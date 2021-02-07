<template>
  <div id="trades" :class="{ '-logos': this.showLogos, '-slippage': this.showSlippage }">
    <ul ref="tradesContainer"></ul>
    <div v-if="!tradesCount" class="trade -empty">Nothing to show, yet.</div>
  </div>
</template>

<script>
import { mapState } from 'vuex'

import { ago, formatPrice, formatAmount } from '../utils/helpers'
import { getColorByWeight, getColorLuminance, getAppBackgroundColor, splitRgba, getLogShade } from '../utils/colors'
import { getNMinutesOldPrice, getNoldPriceRange } from '../utils/priceHelper'
import { awsApiUrl, gasApiUrl } from '../../env'
import socket from '../services/socket'
import Sfx from '../services/sfx'
import axios from 'axios'
import { checkPosition } from '../utils/checkPosition'

let LAST_TRADE_TIMESTAMP // to control whether we show timestamp on trade or not
let LAST_SIDE // to control wheter we show "up" or "down" icon in front of trade
let MINIMUM_AMOUNT // alias threshold[0].amount
let SIGNIFICANT_AMOUNT // alias threshold[1].amount
let COLORS // prepared array of buy / sell colors ranges
let GIFS // gifs from storages, by threshold gif keyword

let activeExchanges = []
//--------
const tradeSamples = []
const MAX_TRADE_SAMPLES = 30
const analyseTradeSpeed = sample => {
  tradeSamples.push(sample)
  if (tradeSamples.length - 1 < MAX_TRADE_SAMPLES) {
    return 0
  }
  tradeSamples.shift()
  const diff = tradeSamples[tradeSamples.length - 1] - tradeSamples[0]
  if (diff <= 0) return 0
  return MAX_TRADE_SAMPLES / diff
}
let positions = []
const { setPosition, checkCurrentPrice } = checkPosition()
const startTime = new Date().getTime() // 開始時間を保存しておく
let speedSamples = []
const tradeSpeedSamplesMaxInSec = 1800 // 過去1800秒(30分)だけサンプリングする。

const maintainTradeSpeedSamples = trades => {
  const maxMilliSec = tradeSpeedSamplesMaxInSec
  const now = Math.floor(new Date().getTime() / 1000)
  speedSamples = speedSamples.filter(value => value.basetime >= now - maxMilliSec)
  for (let trade of trades) {
    const basetime = Math.floor(trade.timestamp / 1000 / 10) * 10
    // 現在のbasetimeを持つかチェック
    const findBasetime = speedSamples.find(v => v.basetime === basetime)
    if (!findBasetime) {
      speedSamples.push({ basetime, value: 0 })
    }
    speedSamples = speedSamples.map(sample => {
      if (sample.basetime === basetime) {
        return { basetime, value: sample.value + 1 }
      }
      return sample
    })
  }
}

const getAvarageSpeed = (period = 60) => {
  if (speedSamples.length < period) return 0
  const tmpSpeeds = speedSamples.slice(period * -1)
  const speeds = tmpSpeeds.map(sample => sample.value)
  const total = speeds.reduce((acc, value) => acc + value, 0)
  return Math.round(total / speeds.length)
}

const attention = {
  period: null, //現在の10秒間隔をUnixTimeで
  data: [] // 現在の10秒間隔で2M以上の全てのデータ
}
export default {
  data() {
    return {
      tradesCount: 0
    }
  },
  computed: {
    ...mapState('settings', [
      'pair',
      'maxRows',
      'thresholds',
      'exchanges',
      'useAudio',
      'showSlippage',
      'liquidationsOnly',
      'audioIncludeInsignificants',
      'preferQuoteCurrencySize',
      'decimalPrecision',
      'showLogos'
    ]),
    ...mapState('app', ['actives'])
  },
  created() {
    // cache list of active exchange
    activeExchanges = this.$store.state.app.actives.slice(0, this.$store.state.app.actives.length)

    this.retrieveStoredGifs()
    this.prepareColorsSteps()

    socket.$on('trades.aggr', this.onTrades)

    this.onStoreMutation = this.$store.subscribe((mutation, state) => {
      switch (mutation.type) {
        case 'app/EXCHANGE_UPDATED':
          activeExchanges = state.app.actives.slice(0, state.app.actives.length)
          break
        case 'settings/SET_PAIR':
          this.clearList()
          break
        case 'settings/TOGGLE_AUDIO':
          if (mutation.payload) {
            this.sfx = new Sfx()
          } else {
            this.sfx && this.sfx.disconnect() && delete this.sfx
          }
          break
        case 'settings/SET_THRESHOLD_GIF':
          this.fetchGifByKeyword(mutation.payload.value, mutation.payload.isDeleted)
          break
        case 'settings/SET_THRESHOLD_COLOR':
        case 'settings/SET_THRESHOLD_AMOUNT':
        case 'settings/DELETE_THRESHOLD':
        case 'settings/ADD_THRESHOLD':
          this.prepareColorsSteps()
          break
      }
    })
  },
  mounted() {
    if (this.useAudio) {
      this.sfx = new Sfx()

      if (this.sfx.context.state === 'suspended') {
        const resumeOnFocus = (() => {
          if (this.useAudio) {
            this.sfx.context.resume()
          }

          if (!this.useAudio || this.sfx.context.state !== 'suspended') {
            window.removeEventListener('focus', resumeOnFocus, false)
            window.removeEventListener('blur', resumeOnFocus, false)
          }
        }).bind(this)

        window.addEventListener('blur', resumeOnFocus, false)
        window.addEventListener('focus', resumeOnFocus, false)
      }
    }

    this._timeAgoInterval = setInterval(() => {
      const elements = this.$el.getElementsByClassName('-timestamp')

      if (!elements.length) {
        return
      }

      let ref

      for (let i = 0; i < elements.length; i++) {
        const txt = ago(elements[i].getAttribute('timestamp'))

        if (typeof ref !== 'undefined' && ref === txt) {
          elements[i].textContent = ''
          elements[i].className = 'trade__date'
          i++
          continue
        }

        if (txt !== elements[i].textContent) {
          elements[i].textContent = txt
        }

        ref = txt
      }
    }, 1000)
  },
  beforeDestroy() {
    socket.$off('trades.aggr', this.onTrades)

    this.onStoreMutation()

    clearInterval(this._timeAgoInterval)

    this.sfx && this.sfx.disconnect()
  },
  methods: {
    async onTrades(trades) {
      if (speedSamples.length === 0) {
        speedSamples = this.$store.state.app.savedSpeeds
      }
      positions = checkCurrentPrice(
        positions,
        this.$store.state.app.newPrices.slice(-1)[0]?.price ?? 0,
        this.$store.state.app.newPrices.slice(-1)[0]?.timestamp ?? 0
      )
      // トレードスピードのチェック
      maintainTradeSpeedSamples(trades)
      // console.log(this.$store.state.app.newPrices.slice(-1)[0].price)
      for (let i = 0; i < trades.length; i++) {
        if (activeExchanges.indexOf(trades[i].exchange) === -1) {
          continue
        }

        // tradeを入れるといいか悪いか判断する。遠くに置きたくないのでここに置く
        const isGoodTrade = (data, priceSet) => {
          const reasons = []
          for (let trade of data) {
            const bigAmount = 6_000_000
            const littleBigAmount = 4_000_000
            const littleLittleAmount = 3_000_000
            let isKouho = false
            if (formatAmount(trade.price * trade.size) === '10M' && trade.exchange === 'bitmex' && trade.side === 'buy') {
              // 使う
              isKouho = true
              reasons.push({ reason: 'bitmexで10Mちょうどのロング正指標', code: 'bitmex10M', span: 100, sameLength: 10, side: trade.side })
            } else if (formatAmount(trade.price * trade.size) === '6M' && trade.exchange === 'bitmex' && trade.side === 'buy') {
              // 使わない
              isKouho = true
              console.log(`%cbitmexで6Mちょうどロング正指標`, 'color:red')
              // reasons.push({ reason: 'bitmexで6Mちょうどのロング正指標', code: 'bitmex6M', span: 100, sameLength: 10, side: trade.side })
            } else if (trade.price * trade.size > bigAmount && trade.exchange === 'bitmex' && trade.side === 'buy') {
              // reasons.push({ reason: 'bitmexで6M以上ロング正指標', code: '', span: 100, sameLength: null })
              isKouho = true
              console.log(`%cbitmexで6M以上ロング正指標`, 'color:red')
            } else if (trade.price * trade.size >= bigAmount && trade.exchange === 'bitmex' && trade.side === 'sell') {
              // reasons.push({ reason: 'bitmexで6M以上ショート', code: '', span: 100, sameLength: null })
              isKouho = true
              console.log(`%cbitmexで6M以上ショート`, 'color:red')
            }

            const speeds = [getAvarageSpeed(6), getAvarageSpeed(30), getAvarageSpeed(60), getAvarageSpeed(90), getAvarageSpeed(180)]

            if (isKouho) {
              positions = setPosition(positions, [trade], data, priceSet, speeds, 'kouho', 1)
            }

            if (trade.price * trade.size >= 5_000_000 && trade.exchange === 'bybit') {
              // 使う
              positions = setPosition(positions, [trade], data, priceSet, speeds, 'bybit4over', 1)
            } else if (trade.price * trade.size >= 4_500_000 && trade.exchange === 'bybit') {
              // 使う
              // reasons.push({ reason: 'bybitで4.5M以上正指標説', code: 'bybit4_5M', span: 160, sameLength: 10, side: trade.side })

              positions = setPosition(positions, [trade], data, priceSet, speeds, 'bybit4over', 1)
            } else if (trade.price * trade.size >= 4_000_000 && trade.exchange === 'bybit') {
              // 使う
              // reasons.push({ reason: 'bybitで4M以上正指標説', code: 'bybit4M', span: 100, sameLength: 10, side: trade.side })

              positions = setPosition(positions, [trade], data, priceSet, speeds, 'bybit4over', 1)
            }
            if (trade.exchange === 'huobi') {
              // 使う
              // reasons.push({ reason: '取引所huobi', code: 'huobi', span: 150, sameLength: 10 })

              positions = setPosition(positions, [trade], data, priceSet, speeds, 'huobi', 1)
            }

            if (trade.exchange === 'bitfinex') {
              // 使う
              console.log(`%c取引所bitfinex`, 'color:red')
              // reasons.push({ reason: '取引所bitfinex', code: 'bitfinex', span: 150, sameLength: 10 })

              positions = setPosition(positions, [trade], data, priceSet, speeds, 'bitfinex', 1)
            }
            // 気になる
            if (trade.exchange === 'binance') {
              // 使う
              console.log(`%c取引所binance`, 'color:red')
              positions = setPosition(positions, [trade], data, priceSet, speeds, 'binance', 1)
            }
            // 気になる数字
            if (['gdax', 'bitstamp', 'okex'].includes(trade.exchange)) {
              // reasons.push({ reason: '取引所がいい', code: '', span: 100, sameLength: null })
              console.log(`%c取引所がいい`, 'color:red')

              positions = setPosition(positions, [trade], data, priceSet, speeds, 'etc_exchange', 1, true)
            }
          }
          return reasons
        }

        const trade = trades[i]
        const amount = trade.size * (this.preferQuoteCurrencySize ? trade.price : 1)
        const multiplier = typeof this.exchanges[trade.exchange].threshold !== 'undefined' ? +this.exchanges[trade.exchange].threshold : 1

        const baseTimestamp = Math.floor(trade.timestamp / 1000 / 10) * 10

        // 送信
        const executeCheckout = async priceSet => {
          const diffNum = Math.round(priceSet.close - priceSet.open)
          const data = attention.data
          const isPlus = diffNum > 0 ? true : false

          console.log(positions)
          let amount = 0
          if (data.length >= 4) {
            console.log(`%c4つ以上ある！`, 'color:red')
          }
          let binance = []
          let bitmex = 0
          let bybit = []
          let deribit = 0

          for (let _trade of data) {
            if (_trade.exchange === 'binance_futures') binance.push(_trade)
            if (_trade.exchange === 'bitmex') bitmex++
            if (_trade.exchange === 'bybit') bybit.push(_trade)
            if (_trade.exchange === 'deribit') deribit++
            amount += _trade.price * _trade.size
          }
          const reasons = isGoodTrade(data, priceSet)
          const speeds = [getAvarageSpeed(6), getAvarageSpeed(30), getAvarageSpeed(60), getAvarageSpeed(90), getAvarageSpeed(180)]
          if (binance.length === 2 && data.length === 2 && getAvarageSpeed(6) > 240) {
            console.log(`%cダブルバイナンス`, 'color:red')

            console.log(
              `${Math.round(priceSet.close)} からダブルバイナンススタート${Math.round(priceSet.close) + 100}か、${Math.round(priceSet.close) -
                100}で終わり`
            )

            positions = setPosition(positions, binance, data, priceSet, speeds, '50k_binance', 2)
          } else if (bybit.length === 2 && data.length === 2) {
            // reasons.push({ reason: 'ダブルbybit', span: 100, sameLength: null })

            positions = setPosition(positions, bybit, data, priceSet, speeds, 'wbybit', 2)
            console.log(`%cダブルbybit`, 'color:red')
          } else if (data.length === 2) {
            // reasons.push({ reason: 'ダブル指標', span: 100, sameLength: null })
            console.log(`%cダブル指標`, 'color:red')
            positions = setPosition(positions, data, data, priceSet, speeds, 'windex', 2, true)
          }

          if (deribit > 0 && data.length > 1) {
            // buyとsell両方が含まれているかチェック
            const existBuy = data.some(t => t.side === 'buy')
            const existSell = data.some(t => t.side === 'sell')
            const isGood = existBuy && existSell
            if (isGood) {
              const allDerbit = data.filter(t => t.exchange === 'deribit')
              const latestDarbit = allDerbit[allDerbit.length - 1]
              // reasons.push({ reason: 'deribit逆張り正指標説', code: 'DarbitCon', span: 200, sameLength: 10, side: latestDarbit.side })
              console.log('deribit逆張り正指標説 side: ', latestDarbit.side, '最新時間: ', latestDarbit.timestamp)
            }
          }
          // bitmex逆張り正指標説
          if (bitmex > 0 && data.length > 1 && data.length <= 3) {
            // buyとsell両方が含まれているかチェック
            const existBuy = data.some(t => t.side === 'buy')
            const existSell = data.some(t => t.side === 'sell')
            const isGood = existBuy && existSell
            if (isGood) {
              const allBitmex = data.filter(t => t.exchange === 'bitmex')
              const latestBitmex = allBitmex[allBitmex.length - 1]

              positions = setPosition(positions, [latestBitmex], data, priceSet, speeds, 'bitmex_gyaku', 1)

              // reasons.push({ reason: 'bitmex逆張り正指標説', code: 'bitmexCon', span: 200, sameLength: 10, side: latestBitmex.side })
              console.log('bitmex逆張り正指標説 side: ', latestBitmex.side, '最新時間: ', latestBitmex.timestamp)
            } else {
              // こちらはbitmexが１つ以上あり、すべて同じポジ。ここでbitmexとbinance以外の取引所があるかチェックし、あれば2M以上かチェック
              const allNotBitmexAndBinance = data.filter(t => t.exchange !== 'bitmex' && t.exchange !== 'binance_futures')
              // そのうち１つでも2M以上ならOK正指標としてOK
              const existsHugeAmountAlly = allNotBitmexAndBinance.some(trade => trade.price * trade.size >= 2_000_000)
              if (existsHugeAmountAlly) {
                positions = setPosition(positions, allNotBitmexAndBinance, data, priceSet, speeds, 'kouho', 1)

                console.log(`%cbitmexかついい感じに大きな取引を伴っている`, 'color:red')
              } else {
                console.log(`%cbitmex他取引所指標チェック`, 'color:red')
              }
            }
          }
          // 矛盾Binance(現在バイナンスが2つだけのときだけ考慮)
          if (binance.length === 2 && data.length === 2) {
            const allBinance = data.filter(t => t.exchange === 'binance_futures')
            const isSameSide = allBinance.every(t => data[0].side === t.side)
            const total = allBinance.reduce((acc, trade) => acc + trade.price * trade.size)
            if (!isSameSide) {
              // reasons.push({ reason: 'binance正指標説', code: 'bybitover3', span: 100, sameLength: 10, side: data[0].side })

              positions = setPosition(positions, binance, data, priceSet, speeds, 'mujun_binance', 2)

              console.log(`%c矛盾Binanceチェック`, 'color:red')
              if (total > 0) {
                console.log(`%c矛盾Binance落下予測`, 'color:red')
              }
            }
          }
          // bybit三連撃(廃止)
          if (bybit.length === 3 || bybit.length === 4) {
            const allBybit = data.filter(t => t.exchange === 'bybit')
            const isSameSide = allBybit.every(t => data[0].side === t.side)
            if (isSameSide) {
              positions = setPosition(positions, allBybit, data, priceSet, speeds, '3bybit', 2)
              // reasons.push({ reason: 'bybit三連以上は正指標説', code: 'bybitover3', span: 100, sameLength: 10, side: data[0].side })
            }
          }
          //理由の表示
          if (reasons.length > 0) {
            const message = reasons.reduce((acc, val) => acc + val.reason + '\n', '')
            console.log(`%c${message}`, 'color:red')
          }

          // 条件チェック。「売買する理由」を集めて調整する
          const checkAllReasons = reasons => {
            const result = { side: null, priceRange: 0, reason: null }
            if (reasons.length === 0) return { error: 'なし', result }

            // 方向チェック、すべてbuyまたはすべてsellと方向が揃ってるならOK。１つでも異なるならNG
            const sides = reasons.map(t => t.side)
            const isEverySameSide = sides.every(s => sides[0] === s)
            if (!isEverySameSide) return { error: 'reasonsの全てのポジが同じ方向ではない', result: null }

            // 最大値チェック。ポジりたい値幅の最大値を取得
            const priceRanges = reasons.map(t => t.span)
            const maxPriceRange = Math.max(...priceRanges)

            // huobiチェック。今の所huobiは１つだけを想定
            const num = reasons.length
            const isInvalidForHuobi = reasons.some(reason => reason.code === 'huobi' && num !== 1)
            if (isInvalidForHuobi) return { error: 'huobiはあるが１ではない', result: null }

            result.side = sides[0]
            result.priceRange = maxPriceRange
            result.reason = reasons[0].reason

            return { error: null, result }
          }

          // 理由があるとき
          if (reasons.length > 0) {
            const result = checkAllReasons(reasons)
            if (result.error) {
              console.log(`%c${result.error}`, 'color:red')
            } else {
              // ここで売買を実行
              // UTCでの時間と、理由も書く
              const side = result.result.side
              const priceRange = result.result.priceRange
              const reason = result.result.reason
              axios.get(`${awsApiUrl}?mailSubject=${side}です&mailMessage=${reason} ${priceRange}で取る！`)
              console.table(result.result)
            }
          }
          console.log('始値', Math.round(priceSet.open), '終値', Math.round(priceSet.close))
          const plusOrMinus = isPlus > 0 ? '陽線' : '陰線'
          const threePriceRange = Math.round(priceSet.close - priceSet.threeOpen)
          console.log(`%c${diffNum} ${plusOrMinus} 3値幅${threePriceRange}`, 'color:red')
          console.log('３つ前のopen', priceSet.threeOpen)
          setTimeout(() => {
            console.log(
              '売買高:',
              formatAmount(this.$store.state.app.newAmount),
              '指標: ',
              Math.round((this.$store.state.app.newAmount / amount) * 100) / 100
            )
          }, 1000)
        }

        // chatController, store経由で登録して始値、終値データを取得してexecuteCheckoutに渡している
        const newPrices = this.$store.state.app.newPrices

        const filtered1 = newPrices.find(v => v.timestamp === attention.period - 10)
        const filtered2 = newPrices.find(v => v.timestamp === attention.period)
        const threeOpen = getNoldPriceRange(newPrices, attention.period, 3)
        const oldPrices = [getNMinutesOldPrice(newPrices, 5), getNMinutesOldPrice(newPrices, 10), getNMinutesOldPrice(newPrices, 30)]
        if (attention.period != null && baseTimestamp !== attention.period && filtered1 && filtered2) {
          const priceSet = { open: filtered1.price, close: filtered2.price, threeOpen, oldPrices }
          await executeCheckout(priceSet)

          attention.period = null
          attention.data = []
        }

        if (trade.liquidation) {
          if (this.useAudio && amount > SIGNIFICANT_AMOUNT * multiplier * 0.1) {
            this.sfx.liquidation((amount / SIGNIFICANT_AMOUNT) * multiplier)
          }

          if (amount >= MINIMUM_AMOUNT * multiplier) {
            let liquidationMessage = `<i class="icon-currency"></i> <strong>${formatAmount(amount, 1)}</strong>`

            liquidationMessage += `&nbsp;liq<span class="min-280">uidate</span>d <strong>${
              trade.side === 'buy' ? 'SHORT' : 'LONG'
            }</strong> @ <i class="icon-quote"></i> ${formatPrice(trade.price)}`

            this.appendRow(trade, amount, multiplier, '-liquidation', liquidationMessage)
          }
          continue
        } else if (this.liquidationsOnly) {
          continue
        }

        if (amount >= MINIMUM_AMOUNT * multiplier) {
          this.appendRow(trade, amount, multiplier)
        } else {
          if (this.useAudio && this.audioIncludeInsignificants && amount >= SIGNIFICANT_AMOUNT * 0.1) {
            this.sfx.tradeToSong(amount / (SIGNIFICANT_AMOUNT * multiplier), trade.side, 0)
          }
        }
      }
    },
    appendRow(trade, amount, multiplier = 1, classname = '', message = null) {
      if (!this.tradesCount) {
        this.$forceUpdate()
      }

      this.tradesCount++

      const li = document.createElement('li')
      li.className = ('trade ' + classname).trim()
      li.className += ' -' + trade.exchange

      li.className += ' -' + trade.side

      if (trade.exchange.length > 10) {
        li.className += ' -sm'
      }

      if (amount >= SIGNIFICANT_AMOUNT * multiplier) {
        li.className += ' -significant'
      }

      for (let i = 0; i < this.thresholds.length; i++) {
        li.className += ' -level-' + i

        if (!this.thresholds[i + 1] || amount < this.thresholds[i + 1].amount * multiplier) {
          // THIS IS OUR THRESHOLD
          const color = COLORS[Math.min(this.thresholds.length - 2, i)]
          const threshold = this.thresholds[i]

          if (threshold.gif && GIFS[threshold.gif]) {
            // get random gif for this threshold
            li.style.backgroundImage = `url('${GIFS[threshold.gif][Math.floor(Math.random() * (GIFS[threshold.gif].length - 1))]}`
          }

          // percentage to next threshold
          const percentToNextThreshold = (Math.max(amount, color.threshold) - color.threshold) / color.range

          // 0-255 luminance of nearest color
          const luminance = color[trade.side][(percentToNextThreshold < 0.5 ? 'from' : 'to') + 'Luminance']

          // background color simple color to color based on percentage of amount to next threshold
          const backgroundColor = getColorByWeight(color[trade.side].from, color[trade.side].to, percentToNextThreshold)
          li.style.backgroundColor = 'rgb(' + backgroundColor[0] + ', ' + backgroundColor[1] + ', ' + backgroundColor[2] + ')'

          if (i >= 1) {
            // ajusted amount > SIGNIFICANT_AMOUNT
            // only pure black or pure white foreground
            li.style.color = luminance < 175 ? 'white' : 'black'
          } else {
            // take background color and apply logarithmic shade based on amount to SIGNIFICANT_AMOUNT percentage
            // darken if luminance of background is high, lighten otherwise
            li.style.color = getLogShade(backgroundColor, Math.max(0.25, Math.min(1, amount / SIGNIFICANT_AMOUNT)) * (luminance < 175 ? 1 : -1))
          }

          if (this.useAudio && amount >= (this.audioIncludeInsignificants ? SIGNIFICANT_AMOUNT * 0.1 : MINIMUM_AMOUNT * 1) * multiplier) {
            this.sfx.tradeToSong(amount / (SIGNIFICANT_AMOUNT * multiplier), trade.side, i)
          }

          break
        }
      }

      if (!message) {
        if (trade.side !== LAST_SIDE) {
          const side = document.createElement('div')
          side.className = 'trade__side icon-side'
          li.appendChild(side)
        }

        LAST_SIDE = trade.side
      }

      const exchange = document.createElement('div')
      exchange.className = 'trade__exchange'
      exchange.innerText = trade.exchange.replace('_', ' ')
      exchange.setAttribute('title', trade.exchange)
      li.appendChild(exchange)

      if (message) {
        const message_div = document.createElement('div')
        message_div.className = 'trade__message'
        message_div.innerHTML = message
        li.appendChild(message_div)
      } else {
        const price = document.createElement('div')
        price.className = 'trade__price'
        price.innerHTML = `<span class="icon-quote"></span> <span>${formatPrice(trade.price)}</span>`
        li.appendChild(price)

        if (this.showSlippage === 'price' && trade.slippage / trade.price > 0.0001) {
          price.setAttribute(
            'slippage',
            (trade.slippage > 0 ? '+' : '-') + document.getElementById('app').getAttribute('data-symbol') + Math.abs(trade.slippage).toFixed(1)
          )
        } else if (this.showSlippage === 'bps' && trade.slippage) {
          price.setAttribute('slippage', (trade.slippage > 0 ? '+' : '-') + trade.slippage)
        }

        const amount_div = document.createElement('div')
        amount_div.className = 'trade__amount'

        const amount_quote = document.createElement('span')
        amount_quote.className = 'trade__amount__quote'
        amount_quote.innerHTML = `<span class="icon-quote"></span> <span>${formatAmount(trade.price * trade.size)}</span>`

        // WebSocketからのタイムスタンプ取得
        const table = {}

        // const alpha = 200_000
        const alpha = 1_200_000
        const isOverAlpha = target => target > alpha

        const resetAttention = () => {
          attention.period = null
          attention.data = []
        }

        const setNewAttention = trade => {
          const baseTimestamp = Math.floor(trade.timestamp / 1000 / 10) * 10
          attention.period = baseTimestamp
          attention.data.push(trade)
        }

        const setAttention = trade => {
          const baseTimestamp = Math.floor(trade.timestamp / 1000 / 10) * 10

          // 新しいtrade情報はattentionのピリオドと同じか。同じなら追加。違うなら削除しAttentionに追加
          if (baseTimestamp === attention.period) {
            attention.data.push(trade)
          } else {
            resetAttention()
            attention.period = baseTimestamp
            setNewAttention(trade)
            return
          }
        }
        // ココ ──────────────────────────────────────────
        if (isOverAlpha(trade.price * trade.size)) {
          setAttention(trade)

          table['price'] = trade.side === 'buy' ? `${formatAmount(trade.price * trade.size, 3)}` : `-${formatAmount(trade.price * trade.size, 3)}`
          table['speed'] = getAvarageSpeed()
          table['exchange'] = trade.exchange
          table['time'] = new Date(trade.timestamp).toUTCString()
          table['unixtime'] = trade.timestamp
          table['size'] = trade.size
          console.table(table)
          const diffTime = Date.now() - startTime
          const passHours = Math.floor(diffTime / (60 * 60 * 1000))
          console.log(`経過時間: ${passHours}`)

          // ストアに保存する
          this.$store.commit('app/SET_SPEEDS', speedSamples)

          // リロードチェック
          if (passHours >= 24 && positions.length === 0) {
            location.reload()
          }
        }
        const amount_base = document.createElement('span')
        amount_base.className = 'trade__amount__base'
        amount_base.innerHTML = `<span class="icon-base"></span> <span>${formatAmount(trade.size)}</span>`

        amount_div.appendChild(amount_quote)
        amount_div.appendChild(amount_base)
        li.appendChild(amount_div)
      }

      const date = document.createElement('div')
      date.className = 'trade__date'

      let timestamp = Math.floor(trade.timestamp / 1000) * 1000

      if (timestamp !== LAST_TRADE_TIMESTAMP) {
        LAST_TRADE_TIMESTAMP = timestamp

        date.setAttribute('timestamp', trade.timestamp)
        date.innerText = ago(timestamp)

        date.className += ' -timestamp'
      }

      li.appendChild(date)

      this.$refs.tradesContainer.appendChild(li)

      while (this.tradesCount > this.maxRows) {
        this.tradesCount--
        this.$refs.tradesContainer.removeChild(this.$refs.tradesContainer.firstChild)
      }
    },
    retrieveStoredGifs(refresh) {
      GIFS = {}

      this.thresholds.forEach(threshold => {
        if (!threshold.gif) {
          return
        }

        const slug = this.slug(threshold.gif)
        const storage = localStorage ? JSON.parse(localStorage.getItem('threshold_' + slug + '_gifs')) : null

        if (!refresh && storage && +new Date() - storage.timestamp < 1000 * 60 * 60 * 24 * 7) {
          GIFS[threshold.gif] = storage.data
        } else {
          this.fetchGifByKeyword(threshold.gif)
        }
      })
    },
    fetchGifByKeyword(keyword, isDeleted = false) {
      if (!keyword || !GIFS) {
        return
      }

      const slug = this.slug(keyword)

      if (isDeleted) {
        if (GIFS[keyword]) {
          delete GIFS[keyword]
        }

        localStorage.removeItem('threshold_' + slug + '_gifs')

        return
      }

      fetch('https://api.giphy.com/v1/gifs/search?q=' + keyword + '&rating=r&limit=100&api_key=b5Y5CZcpj9spa0xEfskQxGGnhChYt3hi')
        .then(res => res.json())
        .then(res => {
          if (!res.data || !res.data.length) {
            return
          }

          GIFS[keyword] = []

          for (let item of res.data) {
            GIFS[keyword].push(item.images.original.url)
          }

          localStorage.setItem(
            'threshold_' + slug + '_gifs',
            JSON.stringify({
              timestamp: +new Date(),
              data: GIFS[keyword]
            })
          )
        })
    },
    slug(keyword) {
      return keyword
        .toLowerCase()
        .trim()
        .replace(/[^a-zA-Z0-9]+/g, '-')
    },
    prepareColorsSteps() {
      const appBackgroundColor = getAppBackgroundColor()

      COLORS = []
      MINIMUM_AMOUNT = this.thresholds[0].amount
      SIGNIFICANT_AMOUNT = this.thresholds[1].amount

      for (let i = 0; i < this.thresholds.length - 1; i++) {
        const buyFrom = splitRgba(this.thresholds[i].buyColor, appBackgroundColor)
        const buyTo = splitRgba(this.thresholds[i + 1].buyColor, appBackgroundColor)
        const sellFrom = splitRgba(this.thresholds[i].sellColor, appBackgroundColor)
        const sellTo = splitRgba(this.thresholds[i + 1].sellColor, appBackgroundColor)

        COLORS.push({
          threshold: this.thresholds[i].amount,
          range: this.thresholds[i + 1].amount - this.thresholds[i].amount,
          buy: {
            from: buyFrom,
            to: buyTo,
            fromLuminance: getColorLuminance(buyFrom),
            toLuminance: getColorLuminance(buyTo)
          },
          sell: {
            from: sellFrom,
            to: sellTo,
            fromLuminance: getColorLuminance(sellFrom),
            toLuminance: getColorLuminance(sellTo)
          }
        })
      }
    },

    clearList() {
      this.$refs.tradesContainer.innerHTML = ''
      this.tradesCount = 0
    }
  }
}
</script>

<style lang="scss">
@keyframes highlight {
  0% {
    opacity: 0.75;
  }

  100% {
    opacity: 0;
  }
}

#trades {
  background-color: rgba(black, 0.2);
  line-height: 1;

  ul {
    margin: 0;
    padding: 0;
    display: flex;
    flex-flow: column-reverse nowrap;
  }

  &.-slippage {
    .trade__price {
      flex-grow: 1.5;
    }
  }

  &.-logos {
    .trade__exchange {
      text-indent: -9999px;
      flex-basis: 0;
      flex-grow: 0.4;
    }

    @each $exchange in $exchanges {
      .-#{$exchange} .trade__exchange {
        background-image: url('../assets/exchanges/#{$exchange}.svg');
      }
    }

    .-liquidation {
      .trade__exchange {
        position: absolute;
        width: 1em;
      }
    }
  }

  &:not(.-logos) .trade.-sm {
    .trade__exchange {
      font-size: 0.75em;
      letter-spacing: -0.5px;
      margin-top: -5px;
      margin-bottom: -5px;
      white-space: normal;
      word-break: break-word;
      line-height: 0.9;
    }

    &.-liquidation .trade__exchange {
      max-width: 4em;
    }
  }
}

.trade {
  display: flex;
  flex-flow: row nowrap;
  padding: 0.4em 0.6em;
  background-position: center center;
  background-size: cover;
  background-blend-mode: overlay;
  position: relative;
  align-items: center;

  &:after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    opacity: 0;
    background-color: white;
    animation: 1s $easeOutExpo highlight;
    pointer-events: none;
  }

  &.-empty {
    justify-content: center;
    padding: 20px;
    font-size: 0.8rem;

    &:after {
      display: none;
    }
  }

  &.-sell {
    background-blend-mode: soft-light;
    background-color: lighten($red, 35%);
    color: $red;

    .icon-side:before {
      content: unicode($icon-down);
    }
  }

  &.-buy {
    background-color: lighten($green, 50%);
    color: $green;

    .icon-side:before {
      content: unicode($icon-up);
    }
  }

  &.-level-1 {
    color: white;
  }

  &.-level-2 {
    padding: 0.5em 0.6em;
  }

  &.-level-3 {
    box-shadow: 0 0 20px rgba(red, 0.5);
    z-index: 1;
  }

  > div {
    flex-grow: 1;
    flex-basis: 0;
    word-break: break-word;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .trade__side {
    flex-grow: 0;
    flex-basis: 1em;
    font-size: 1em;
    position: absolute;

    + .trade__message {
      margin-left: 0.5em;
    }
  }

  .icon-currency,
  .icon-quote,
  .icon-base {
    line-height: 0;
  }

  .trade__exchange {
    background-repeat: no-repeat;
    background-position: center center;
    flex-grow: 0.75;
    margin-left: 5%;

    small {
      opacity: 0.8;
    }
  }

  &.-liquidation {
    background-color: $pink !important;
    color: white !important;

    .trade__exchange {
      flex-grow: 0;
      flex-basis: auto;
      margin-left: 0;
    }
  }

  .trade__price:after {
    content: attr(slippage);
    font-size: 80%;
    position: relative;
    top: -2px;
    left: 2px;
    opacity: 0.75;
  }

  .trade__amount {
    flex-grow: 1;
    position: relative;

    > span {
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      transition: all 0.1s ease-in-out;
      display: block;

      &.trade__amount__quote {
        position: absolute;
      }

      &.trade__amount__base {
        transform: translateX(25%);
        opacity: 0;
      }
    }

    &:hover {
      > span.trade__amount__base {
        transform: none;
        opacity: 1;
      }

      > span.trade__amount__quote {
        transform: translateX(-25%);
        opacity: 0;
      }
    }
  }

  .trade__date {
    text-align: right;
    flex-basis: 2em;
    flex-grow: 0;
  }

  .trade__message {
    flex-grow: 2;
    text-align: center;
    font-size: 90%;
    line-height: 1.5;

    + .trade__date {
      overflow: visible;
      flex-basis: auto;
      font-size: 0.8em;
      margin-left: -0.2em;
    }
  }
}

#app[data-prefer='base'] .trade .trade__amount {
  .trade__amount__quote {
    transform: translateX(-25%);
    opacity: 0;
  }

  .trade__amount__base {
    transform: none;
    opacity: 1;
  }

  &:hover {
    > span.trade__amount__base {
      transform: translateX(25%);
      opacity: 0;
    }

    > span.trade__amount__quote {
      transform: none;
      opacity: 1;
    }
  }
}
</style>
