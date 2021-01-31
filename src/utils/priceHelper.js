import axios from 'axios'
import { gasApiUrl } from '../../env'
export function getNoldPriceRange(prices, targetPeriod, num) {
  // n個前のデータの始値を抽出する。
  const prevOpen = prices.find(v => v.timestamp === targetPeriod - (num + 1) * 10)
  // 最新の終値を抽出する
  const latestOpen = prices.find(v => v.timestamp === targetPeriod)
  return prevOpen?.price ?? 0
}

function simpleFormatAmount(amount, decimals) {
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

export function oneSetData(trade, data, priceSet, speeds, sheet) {
  const rawData = formatDataByRawData(data)

  // スプレッドシートに入れるデータ
  const amount = trade.side === 'buy' ? `${simpleFormatAmount(trade.price * trade.size, 3)}` : `-${simpleFormatAmount(trade.price * trade.size, 3)}`
  const utcTime = new Date(trade.timestamp).toUTCString()
  const unixtime = trade.timestamp

  const mainData = [
    utcTime,
    unixtime,
    Math.round(priceSet.open),
    Math.round(priceSet.close),
    Math.round(priceSet.threeOpen),
    amount,
    speeds[0],
    speeds[1],
    speeds[2],
    rawData
  ]

  const postData = {
    sheet,
    data: mainData
  }

  axios.post(gasApiUrl, postData)
}

export function twoSetData(trades, data, priceSet, speeds, sheet) {
  const rawData = formatDataByRawData(data)

  // スプレッドシートに入れるデータ
  const amount1 =
    trades[0].side === 'buy'
      ? `${simpleFormatAmount(trades[0].price * trades[0].size, 3)}`
      : `-${simpleFormatAmount(trades[0].price * trades[0].size, 3)}`
  const amount2 =
    trades[1].side === 'buy'
      ? `${simpleFormatAmount(trades[1].price * trades[1].size, 3)}`
      : `-${simpleFormatAmount(trades[1].price * trades[1].size, 3)}`
  const utcTime = new Date(trades[0].timestamp).toUTCString()
  const unixtime1 = trades[0].timestamp
  const unixtime2 = trades[1].timestamp
  const mainData = [
    utcTime,
    unixtime1,
    unixtime2,
    Math.round(priceSet.open),
    Math.round(priceSet.close),
    Math.round(priceSet.threeOpen),
    amount1,
    amount2,
    speeds[0],
    speeds[1],
    speeds[2],
    rawData
  ]

  const postData = {
    sheet,
    data: mainData
  }

  axios.post(gasApiUrl, postData)
}
