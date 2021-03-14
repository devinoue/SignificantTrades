import axios from 'axios'
import { awsApiUrl, gasApiUrl, testMode } from '../../env'

export function orderPosition(strategy, type, id, side = '') {
  console.log(`orderPosition ID : ${id}`)
  const data = {
    strategy,
    type,
    side,
    id
  }
  console.log('送信する')
  axios.post('http://localhost:3001/order', data)
}

export function simpleFormatAmount(amount, decimals) {
  const negative = amount < 0
  amount = Math.ceil(Math.abs(amount) * 1000000000) / 1000000000
  amount = +(amount / 1000000).toFixed(isNaN(decimals) ? 1 : decimals)
  if (negative) {
    return '-' + amount
  } else {
    return amount
  }
}
export function formatDataByRawData(data) {
  let fullText = ''
  for (let trade of data) {
    const amount = trade.side === 'buy' ? `${simpleFormatAmount(trade.price * trade.size, 3)}` : `-${simpleFormatAmount(trade.price * trade.size, 3)}`
    const exchange = trade.exchange
    const utcTime = new Date(trade.timestamp).toUTCString()
    const unixtime = trade.timestamp
    fullText += `売買高:${amount}\n取引所:${exchange}\n時間:${utcTime}\nUT:${unixtime}\n\n`
  }

  return fullText
}

const exchanges = ['binance_futures', 'bybit', 'bitmex', 'binance', 'deribit', 'huobi', 'bitfinex', 'bitstamp', 'gdax']
const formatBigAmountData = data => {
  // リセットする
  const tmpData = {}
  for (let e of exchanges) {
    tmpData[e] = { num: 0, amount: 0 }
  }

  // まとめる
  for (let trade of data) {
    if (tmpData[trade.exchange]) {
      tmpData[trade.exchange].num++
      const amount = trade.side === 'buy' ? simpleFormatAmount(trade.price * trade.size, 3) : simpleFormatAmount(trade.price * trade.size, 3) * -1
      tmpData[trade.exchange].amount += Number(amount)
    }
  }

  // 整形
  const tmpNum = exchanges.map(exchange => tmpData[exchange].num)
  const tmpAmounts = exchanges.map(exchange => tmpData[exchange].amount)
  const formattedDataByExchange = [...tmpNum, ...tmpAmounts]

  return formattedDataByExchange
}

export const totalAmount = data => {
  let total = 0
  for (let trade of data) {
    total += simpleFormatAmount(trade.price * trade.size, 3)
  }
  return Number(total)
}
export const setPositionForOverLevel = (positions, data, priceSet, speeds, sheet) => {
  // 生データとして保存
  const rawData = formatDataByRawData(data)

  // スプレッドシートに入れるデータ
  const total = data[0].side === 'buy' ? totalAmount(data) : totalAmount(data) * -1

  const mainData = [
    new Date(data[0].timestamp).toUTCString(),
    data[0].timestamp,
    Math.round(priceSet.open),
    Math.round(priceSet.close),
    Math.round(priceSet.threeOpen),
    Math.round(priceSet.oldPrices[0]),
    Math.round(priceSet.oldPrices[1]),
    Math.round(priceSet.oldPrices[2]),
    total,
    ...priceSet.oldAmounts,
    speeds[0],
    speeds[1],
    speeds[2],
    speeds[3],
    speeds[4],
    ...formatBigAmountData(data),
    rawData
  ]
  // 後で追加で入れるデータ
  const additionalData = {
    result50: '', // 上昇か下降か
    result50Time: 0, // 時間
    result70: '',
    result70Time: 0 //
  }

  positions.push({
    close: Math.round(priceSet.close),
    sheet,
    additionalData,
    mainData
  })
  return positions
}

export const setPosition = (positions, trades, data, priceSet, speeds, sheet, numOfValue, saveExchange = false) => {
  // 生データとして保存
  const rawData = formatDataByRawData(data)
  const id = trades[0].timestamp
  // スプレッドシートに入れるデータ
  const amount1 =
    trades[0].side === 'buy'
      ? `${simpleFormatAmount(trades[0].price * trades[0].size, 3)}`
      : `-${simpleFormatAmount(trades[0].price * trades[0].size, 3)}`

  let amount2
  if (numOfValue === 2) {
    amount2 =
      trades[1].side === 'buy'
        ? `${simpleFormatAmount(trades[1].price * trades[1].size, 3)}`
        : `-${simpleFormatAmount(trades[1].price * trades[1].size, 3)}`
  }

  let mainData
  // 一つだけ保存 + 取引所も記録する(取引所研究用)
  if (numOfValue === 1 && saveExchange === true) {
    mainData = [
      new Date(trades[0].timestamp).toUTCString(),
      trades[0].timestamp,
      Math.round(priceSet.open),
      Math.round(priceSet.close),
      Math.round(priceSet.threeOpen),
      Math.round(priceSet.oldPrices[0]),
      Math.round(priceSet.oldPrices[1]),
      Math.round(priceSet.oldPrices[2]),
      amount1,
      ...priceSet.oldAmounts,
      trades[0].exchange,
      speeds[0],
      speeds[1],
      speeds[2],
      speeds[3],
      speeds[4],
      rawData
    ]
  }
  // 1つだけ保存 + 取引所は無視(huobiなど)
  if (numOfValue === 1 && saveExchange === false) {
    mainData = [
      new Date(trades[0].timestamp).toUTCString(),
      trades[0].timestamp,
      Math.round(priceSet.open),
      Math.round(priceSet.close),
      Math.round(priceSet.threeOpen),
      Math.round(priceSet.oldPrices[0]),
      Math.round(priceSet.oldPrices[1]),
      Math.round(priceSet.oldPrices[2]),
      amount1,
      ...priceSet.oldAmounts,
      speeds[0],
      speeds[1],
      speeds[2],
      speeds[3],
      speeds[4],
      rawData
    ]
  }
  // 2つの値 + 取引所は保存(windexの研究など)
  if (numOfValue === 2 && saveExchange === true) {
    mainData = [
      new Date(trades[0].timestamp).toUTCString(),
      trades[0].timestamp,
      trades[1].timestamp,
      Math.round(priceSet.open),
      Math.round(priceSet.close),
      Math.round(priceSet.threeOpen),
      Math.round(priceSet.oldPrices[0]),
      Math.round(priceSet.oldPrices[1]),
      Math.round(priceSet.oldPrices[2]),
      amount1,
      amount2,
      ...priceSet.oldAmounts,
      trades[0].exchange,
      trades[1].exchange,
      speeds[0],
      speeds[1],
      speeds[2],
      speeds[3],
      speeds[4],
      rawData
    ]
  }
  // 2つの値 + 取引所は無視(wbybitなど)
  if (numOfValue === 2 && saveExchange === false) {
    mainData = [
      new Date(trades[0].timestamp).toUTCString(),
      trades[0].timestamp,
      trades[1].timestamp,
      Math.round(priceSet.open),
      Math.round(priceSet.close),
      Math.round(priceSet.threeOpen),
      Math.round(priceSet.oldPrices[0]),
      Math.round(priceSet.oldPrices[1]),
      Math.round(priceSet.oldPrices[2]),
      amount1,
      amount2,
      ...priceSet.oldAmounts,
      speeds[0],
      speeds[1],
      speeds[2],
      speeds[3],
      speeds[4],
      rawData
    ]
  }
  // 後で追加で入れるデータ
  const additionalData = {
    result50: '', // 上昇か下降か
    result50Time: 0, // 時間
    result70: '',
    result70Time: 0 //
  }

  positions.push({
    close: Math.round(priceSet.close),
    sheet,
    additionalData,
    mainData,
    id
  })
  return positions
}

// 削除予定(setPositionが動けば)
export const setPositions = (positions, data) => {
  const { close, sheet, timestamp } = data
  positions.push({
    close,
    sheet,
    timestamp
  })
  return positions
}
export const checkCurrentPrice = (positions, price, timestamp) => {
  return positions.filter(value => {
    const mainData = value.mainData

    if (value.close + 100 < price && !testMode) {
      //100を超えたと送信
      const direction = '上昇'
      console.log(`100ドル超えたよ！`)

      // 追加分を付け加える
      mainData.push(value.additionalData.result50)
      mainData.push(value.additionalData.result50Time)
      mainData.push(value.additionalData.result70)
      mainData.push(value.additionalData.result70Time)

      mainData.push(direction)
      mainData.push(Math.round(price))
      mainData.push(timestamp * 1000)
      const postData = {
        sheet: value.sheet,
        data: mainData
      }
      orderPosition(value.sheet, 'pay', value.id)
      axios.post(gasApiUrl, postData)
    } else if (value.close - 100 > price && !testMode) {
      // 100ドルより下回ったと送信
      const direction = '下降'
      console.log(`100ドル下回った！`)
      // 追加分を付け加える
      mainData.push(value.additionalData.result50)
      mainData.push(value.additionalData.result50Time)
      mainData.push(value.additionalData.result70)
      mainData.push(value.additionalData.result70Time)

      mainData.push(direction)
      mainData.push(Math.round(price))
      mainData.push(timestamp * 1000)
      const postData = {
        sheet: value.sheet,
        data: mainData
      }
      orderPosition(value.sheet, 'pay', value.id)
      axios.post(gasApiUrl, postData)
    } else if (value.close + 70 < price && value.additionalData.result70Time === 0) {
      // 70ドルだけ上昇した場合
      value.additionalData.result70Time = timestamp * 1000
      value.additionalData.result70 = '上昇'
      return value
    } else if (value.close + 50 < price && value.additionalData.result50Time === 0) {
      // 50ドルだけ上昇した場合
      value.additionalData.result50Time = timestamp * 1000
      value.additionalData.result50 = '上昇'
      return value
    } else if (value.close - 70 > price && value.additionalData.result70Time === 0) {
      // 70ドルだけ降下した場合
      value.additionalData.result70Time = timestamp * 1000
      value.additionalData.result70 = '下降'
      return value
    } else if (value.close - 50 > price && value.additionalData.result50Time === 0) {
      // 50ドルだけ降下した場合
      value.additionalData.result50Time = timestamp * 1000
      value.additionalData.result50 = '下降'
      return value
    } else {
      return value
    }
  })
}
export const checkPosition = () => {
  let positions = []
  return {
    positions,
    // setPositions,
    setPosition,
    checkCurrentPrice
  }
}
