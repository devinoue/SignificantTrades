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

export const setPosition = (positions, trades, data, priceSet, speeds, sheet, numOfValue, saveExchange = false) => {
  // 生データとして保存
  const rawData = formatDataByRawData(data)

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
      speeds[0],
      speeds[1],
      speeds[2],
      speeds[3],
      speeds[4],
      rawData
    ]
  }

  positions.push({
    close: Math.round(priceSet.close),
    sheet,
    mainData
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

    if (value.close + 100 < price) {
      //100を超えたと送信
      const direction = '上昇'
      console.log(`100ドル超えたよ！`)

      mainData.push(direction)
      mainData.push(Math.round(price))
      mainData.push(timestamp * 1000)
      const postData = {
        sheet: value.sheet,
        data: mainData
      }
      axios.post(gasApiUrl, postData)
    } else if (value.close - 100 > price) {
      // 100ドルより下回ったと送信
      const direction = '下降'
      console.log(`100ドル下回った！`)

      mainData.push(direction)
      mainData.push(Math.round(price))
      mainData.push(timestamp * 1000)
      const postData = {
        sheet: value.sheet,
        data: mainData
      }
      axios.post(gasApiUrl, postData)
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
