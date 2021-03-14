const ccxt = require('ccxt')
const dayjs = require('dayjs')
const axios = require('axios')
const dhm = require('./helper')
const getMedian = require('./getMedian')
dayjs.extend(require('dayjs/plugin/timezone'))
dayjs.extend(require('dayjs/plugin/utc'))
dayjs.tz.setDefault('Asia/Tokyo')

const env = require('../env')

const bitflyer = new ccxt.bitflyer({
  apiKey: env.apiKey,
  secret: env.secret
})

const startTime = dayjs()

// expressモジュールを読み込む
const express = require('express')
const app = express()
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// 全てのポジションを保存する
const position = { side: null, strategy: null, id: null, unixtime: null }

const logs = []

let median = {}

const diffTime = () => {
  const now = dayjs()
  const m = now.diff(startTime)
  return dhm(m)
}

// 30分以上データが混雑していないか
// ローカルデータとリモートデータに齟齬がないかのチェック
let si = setInterval(async () => {
  // チェック
  if (!env.testMode) {
    console.clear()
    await checkPositions()
  }

  try {
    median = await getMedian()
    console.log(median)
  } catch (e) {
    console.log(e)
  }

  console.log(`経過時間: ${diffTime()}`)
  console.log(position)
  console.log('最終更新時間: ', dayjs.tz().format())
  console.log(logs)

  if (isTimeOver(position.unixtime, new Date().getTime(), 30 * 60 * 1000)) {
    console.log(`30分超えしてます`)
    sendError('30分超えポジションがあります', '30分超えポジションがあるのでチェックしてください')
    position.unixtime = new Date().getTime()
  }
}, 10000)

const checkPositions = async () => {
  const res = await bitflyer.privateGetGetpositions({ product_code: 'FX_BTC_JPY' })
  if (res.length === 0 && position.side) {
    // 齟齬があるのでpositionをリセットし通知
    sendError('齟齬がありました', 'ローカルポジションはあるのに、リモートには何もない状況がありました')
    resetPosition()
    return
  }
  if (res.length > 0 && position.side === null) {
    sendError('重大な齟齬がありました', 'リモートポジションはあるのに、ローカルには何もない状況がありました。ただちに対処してください')
    return
  }
  console.log(`現在の建玉は以下の通りです:`, res)
}

const resetPosition = () => {
  position.side = null
  position.strategy = null
  position.unixtime = null
  position.id = null
}

const isTimeOver = (checkUT, nowUT, limit) => {
  if (!checkUT) return false
  // limit以上立っているなら
  if (nowUT > checkUT + limit) {
    console.log(checkUT, nowUT)
    return true
  }
  return false
}

const buyOrder = async () => {
  // 成り行き注文買い
  logs.push(`[${dayjs.tz().format()}] 買い注文が入りました\n`)

  if (!env.testMode) {
    return await bitflyer.createMarketBuyOrder('FX_BTC_JPY', 0.01)
  }
}
const sellOrder = async () => {
  // 売り
  logs.push(`[${dayjs.tz().format()}] 売り注文が入りました\n`)

  if (!env.testMode) {
    return await bitflyer.createMarketSellOrder('FX_BTC_JPY', 0.01)
  }
}

const orderMarket = async data => {
  if (data.action === 'doten') {
    logs.push(`[${dayjs.tz().format()}] ドテンのためID: ${position.id} を決済します。\n`)
    if (data.side === 'buy') {
      // 新しい注文がロングなら、今ある注文はショートなので、一旦ロング
      const res = await buyOrder()
      console.log(res?.data)
    } else if (data.side === 'sell') {
      // 新しい注文がショートなら、今ある注文はロングなので、一旦ショート
      const res = await sellOrder()
      console.log(res?.data)
    }
  }
  logs.push(`[${dayjs.tz().format()}] ID: ${data.id} を新しく注文します。\n`)
  if (data.side === 'buy') {
    await buyOrder()
  } else if (data.side === 'sell') {
    await sellOrder()
  } else {
    throw new Error('sideがない')
  }
}

const payOrderMarket = async () => {
  if (position.side === 'buy') {
    await sellOrder()
  } else if (position.side === 'sell') {
    await buyOrder()
  } else {
    throw new Error('sideがない')
  }
}

// ルート（http://localhost:3001/）
app.post('/order', async (req, res) => {
  const data = req.body
  const posResult = getCheckPositionResult(position, data)
  if (posResult.action === 'ignore') return res.json(position)
  if (posResult.action === 'updateId') {
    position.id = Number(data.id)
    position.unixtime = new Date().getTime()
  }
  if (posResult.action === 'updateIdAndStrategy') {
    position.strategy = data.strategy
    position.id = Number(data.id)
    position.unixtime = new Date().getTime()
  }
  if (posResult.action === 'new' || posResult.action === 'pay' || posResult.action === 'doten') {
    try {
      let resultData
      if (posResult.action === 'pay') {
        resultData = await payOrderMarket()
        resetPosition()
      } else if (posResult.action === 'new' || posResult.action === 'doten') {
        resultData = await orderMarket(posResult)
        position.side = data.side
        position.strategy = data.strategy
        position.unixtime = new Date().getTime()
        position.id = Number(data.id)
      }
      const url = encodeURI(`${env.awsApiUrl}?mailSubject=注文しました&mailMessage=${posResult.id} の注文をしました`)
      axios.get(url)
    } catch (e) {
      si = undefined
      logs.push(`[${dayjs.tz().format()}] Error: ${e.message} \n`)
      sendError('自動停止', 'ポジションに失敗しました')
    }
  }
  res.json(position)
})

// 戦略の優先順は「数字が大きいほど」優先度が高い
const strategyPriority = { test: 5, just3: 4, huobi: 4, windex: 6, etc_exchange: 2 }

const isPriorityHigh = (position, data) => {
  if (!strategyPriority[position.strategy] || !strategyPriority[data.strategy]) return 0

  let result
  // プライオリティ
  if (strategyPriority[position.strategy] < strategyPriority[data.strategy]) result = 1
  else if (strategyPriority[position.strategy] === strategyPriority[data.strategy]) result = 0
  else result = -1

  return result
}
const isOverThreshold = data => {
  if (data.strategy === 'windex') {
    if (median.windex > 14.2) {
      return true
    }
  }
  if (data.strategy === 'over4') {
    if (median.over4 > 47) {
      return true
    }
  }
  if (data.strategy === 'just3') {
    if (median.windex > 16.2) {
      return true
    }
  }
  if (data.strategy === 'wbinance') {
    if (median.windex < 16.4) {
      return true
    }
  }
  if (data.strategy === 'bybit4over') {
    return true
  }
  if (data.strategy === 'test') {
    return true
  }
  return false
}

// 新しいポジ
// 決済ポジ(逆sideにポジる)
// 同じsideのポジ(無視でいい)
// 真逆の()
const stdUnit = 0.01
const getCheckPositionResult = (position, data) => {
  if (!data.id) {
    sendError('IDがありません', 'IDのないデータが飛ばされました')
    return { action: 'ignore' }
  }

  if (!isOverThreshold(data)) {
    logs.push(`[${dayjs.tz().format()}] ID: ${data.id} 閾値以下だったため無視しました。\n`)

    return { action: 'ignore' }
  }
  const newDataPriority = isPriorityHigh(position, data)

  // 決済ポジなら、idが同じ場合のみ決済
  if (data.type === 'pay' && Number(data.id) === Number(position.id)) {
    if (position.side) {
      logs.push(`[${dayjs.tz().format()}] ID: ${position.id} を決済します。\n`)
      return { action: 'pay', side: data.side, unit: stdUnit }
    } else {
      sendError('決済ポジエラー', 'ポジを持たないのに決済注文がされました')
      return { action: 'ignore' }
    }
  }

  if (data.type === 'new') {
    // 新しいポジで、そもそもポジションをとれるか？とれるなら注文
    if (position.side === null) {
      return { action: 'new', side: data.side, unit: stdUnit, id: Number(data.id) }
    }
    if (position.side === data.side) {
      // 今のポジション方向が同じで、
      if (newDataPriority === 1) {
        // 優先度が高いまたは優先度が同じなら、idだけ新しく更新
        logs.push(`[${dayjs.tz().format()}] 同じsideのnew注文がありましたが優先度が高い戦略のため、戦略とIDと時間を更新しました。\n`)
        return { action: 'updateIdAndStrategy' }
      } else if (newDataPriority === 0) {
        logs.push(`[${dayjs.tz().format()}] 同じsideのnew注文がありましたが、同じ戦略のためIDと時間だけ更新しました。\n`)
        return { action: 'updateId' }
      } else {
        // 優先度が低いなら無視
        logs.push(`[${dayjs.tz().format()}] 同じsideのnew注文がありましたが、優先度が低いため無視しました。\n`)
        return { action: 'ignore' }
      }
    } else {
      // もし方向が異なりポジションがあっても、新しいデータのほうが優先度が高いなら、ドテン
      if (newDataPriority === 1 || newDataPriority === 0) {
        logs.push(`[${dayjs.tz().format()}] 異なるsideのnew注文がありましたが、優先度からドテンします。\n`)
        return { action: 'doten', side: data.side, unit: stdUnit * 2, id: Number(data.id) }
      } else {
        // 優先度が低いなら無視
        logs.push(`[${dayjs.tz().format()}] 異なるsideのnew注文がありましたが、優先度が低いため無視しました。\n`)
        return { action: 'ignore' }
      }
    }
  }
  // 旧idが新しいデータによって塗り替えられたとき、type: 'pay'で存在しないidが投げられることがある
  logs.push(`[${dayjs.tz().format()}] PositionにIDがないpay注文がありましたが無視しました。\n`)
  return { action: 'ignore' }
}

const sendError = async (title, message) => {
  // APIに飛ばす
  const url = encodeURI(`${env.awsApiUrl}?mailSubject=${title}&mailMessage=${message}`)
  await axios.get(url)
  logs.push(`[${dayjs.tz().format()}] 自動更新を停止してください\n`)
}

// ポート3001でサーバを立てる
app.listen(3001, () => console.log('Listening on port 3001'))
