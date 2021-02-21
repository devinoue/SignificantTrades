import axios from 'axios'
import { gasApiUrl } from '../../env'

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

export function getNoldPriceRange(prices, targetPeriod, num) {
  // n個前のデータの始値を抽出する。
  const prevOpen = prices.find(v => v.timestamp === targetPeriod - (num + 1) * 10)
  // 最新の終値を抽出する
  const latestOpen = prices.find(v => v.timestamp === targetPeriod)
  return prevOpen?.price ?? 0
}
//
export function getNMinutesOldPrice(prices, min) {
  // minには分が入るため調整
  const num = min * 6
  const value = prices.slice(-1 * num, -1 * (num - 1))
  return value.length === 0 ? 0 : value[0].price
}

export function getNOldAmountByMin(amounts, basetime, min) {
  // minには分が入るため調整
  const num = min * 60

  const filtered = amounts.find(v => v.timestamp === basetime - num)
  return !filtered ? 0 : simpleFormatAmount(filtered.amount, 2)
}

export function getNOldAmountByN(amounts, basetime, n) {
  // 最新の場合はn=0、3つ前ならn=3
  const num = n * 10

  const filtered = amounts.find(v => v.timestamp === basetime - num)
  return !filtered ? 0 : simpleFormatAmount(filtered.amount, 2)
}

function getAverage(arr) {
  const res =
    arr.reduce((pre, curr, i) => {
      return pre + curr
    }, 0) / arr.length
  return res
}

// 過去n分の最大値と、平均値を出す
export function getNOldAmountAverageByMin(amounts, basetime, min) {
  const num = min * 60

  const filtered = amounts.filter(v => v.timestamp > basetime - num)
  if (filtered.length === 0) return 0
  // 予想通りの数が取れていない場合0を返す
  const amountArray = filtered.map(v => v.amount)

  if (amountArray.length < min * 6) {
    return 0
  }

  //平均値を返す
  return simpleFormatAmount(getAverage(amountArray), 2)
}

export function getNOldAmountMedianByMin(amounts, basetime, min) {
  const num = min * 60

  const filtered = amounts.filter(v => v.timestamp > basetime - num)
  // 予想通りの数が取れていない場合0を返す
  const amountArray = filtered.map(v => v.amount)

  if (amountArray.length < min * 6) {
    return 0
  }

  amountArray.sort((a, b) => a - b)
  const median = (amountArray[(amountArray.length - 1) >> 1] + amountArray[amountArray.length >> 1]) / 2
  return simpleFormatAmount(median, 2)
}

export function getNOldAmountMaxByMin(amounts, basetime, min) {
  const num = min * 60

  const filtered = amounts.filter(v => v.timestamp > basetime - num)
  // 予想通りの数が取れていない場合0を返す
  const amountArray = filtered.map(v => v.amount)

  if (amountArray.length < min * 6) {
    return 0
  }

  return simpleFormatAmount(Math.max(...amountArray), 2)
}

// function simpleFormatAmount(amount, decimals) {
//   const negative = amount < 0
//   amount = Math.ceil(Math.abs(amount) * 1000000000) / 1000000000
//   amount = +(amount / 1000000).toFixed(isNaN(decimals) ? 1 : decimals)
//   if (negative) {
//     return '-' + amount
//   } else {
//     return amount
//   }
// }

// export function formatDataByRawData(data) {
//   let fullText = ''
//   for (let trade of data) {
//     const amount = trade.side === 'buy' ? `${simpleFormatAmount(trade.price * trade.size, 3)}` : `-${simpleFormatAmount(trade.price * trade.size, 3)}`
//     const exchange = trade.exchange
//     const utcTime = new Date(trade.timestamp).toUTCString()
//     const unixtime = trade.timestamp
//     fullText += `売買高:${amount}\n取引所:${exchange}\n時間:${utcTime}\nUT:${unixtime}\n\n`
//   }

//   return fullText
// }

// export function oneSetData(trade, data, priceSet, speeds, sheet, saveExchange = false) {
//   const rawData = formatDataByRawData(data)

//   // スプレッドシートに入れるデータ
//   const amount = trade.side === 'buy' ? `${simpleFormatAmount(trade.price * trade.size, 3)}` : `-${simpleFormatAmount(trade.price * trade.size, 3)}`
//   const utcTime = new Date(trade.timestamp).toUTCString()
//   const unixtime = trade.timestamp
//   let mainData
//   if (saveExchange) {
//     mainData = [
//       utcTime,
//       unixtime,
//       Math.round(priceSet.open),
//       Math.round(priceSet.close),
//       Math.round(priceSet.threeOpen),
//       Math.round(priceSet.oldPrices[0]),
//       Math.round(priceSet.oldPrices[1]),
//       Math.round(priceSet.oldPrices[2]),
//       amount,
//       trade.exchange,
//       speeds[0],
//       speeds[1],
//       speeds[2],
//       rawData
//     ]
//   } else {
//     mainData = [
//       utcTime,
//       unixtime,
//       Math.round(priceSet.open),
//       Math.round(priceSet.close),
//       Math.round(priceSet.threeOpen),
//       Math.round(priceSet.oldPrices[0]),
//       Math.round(priceSet.oldPrices[1]),
//       Math.round(priceSet.oldPrices[2]),
//       amount,
//       speeds[0],
//       speeds[1],
//       speeds[2],
//       rawData
//     ]
//   }
//   const postData = {
//     sheet,
//     data: mainData
//   }

//   axios.post(gasApiUrl, postData)
// }

// export function twoSetData(trades, data, priceSet, speeds, sheet, saveExchange = false) {
//   const rawData = formatDataByRawData(data)

//   // スプレッドシートに入れるデータ
//   const amount1 =
//     trades[0].side === 'buy'
//       ? `${simpleFormatAmount(trades[0].price * trades[0].size, 3)}`
//       : `-${simpleFormatAmount(trades[0].price * trades[0].size, 3)}`
//   const amount2 =
//     trades[1].side === 'buy'
//       ? `${simpleFormatAmount(trades[1].price * trades[1].size, 3)}`
//       : `-${simpleFormatAmount(trades[1].price * trades[1].size, 3)}`
//   const utcTime = new Date(trades[0].timestamp).toUTCString()
//   const unixtime1 = trades[0].timestamp
//   const unixtime2 = trades[1].timestamp

//   let mainData
//   if (saveExchange) {
//     mainData = [
//       utcTime,
//       unixtime1,
//       unixtime2,
//       Math.round(priceSet.open),
//       Math.round(priceSet.close),
//       Math.round(priceSet.threeOpen),
//       Math.round(priceSet.oldPrices[0]),
//       Math.round(priceSet.oldPrices[1]),
//       Math.round(priceSet.oldPrices[2]),
//       amount1,
//       amount2,
//       trades[0].exchange,
//       trades[1].exchange,
//       speeds[0],
//       speeds[1],
//       speeds[2],
//       rawData
//     ]
//   } else {
//     mainData = [
//       utcTime,
//       unixtime1,
//       unixtime2,
//       Math.round(priceSet.open),
//       Math.round(priceSet.close),
//       Math.round(priceSet.threeOpen),
//       Math.round(priceSet.oldPrices[0]),
//       Math.round(priceSet.oldPrices[1]),
//       Math.round(priceSet.oldPrices[2]),
//       amount1,
//       amount2,
//       speeds[0],
//       speeds[1],
//       speeds[2],
//       rawData
//     ]
//   }

//   const postData = {
//     sheet,
//     data: mainData
//   }

//   axios.post(gasApiUrl, postData)
// }
