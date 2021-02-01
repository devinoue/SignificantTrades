import axios from 'axios'
import { gasApiUrl } from '../../env'

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
    if (value.close + 100 < price) {
      //100を超えたと送信
      const unixtime = value.timestamp
      const direction = '上昇'
      const utcTime = new Date(timestamp * 1000).toUTCString()

      const mainData = [utcTime, unixtime, direction, Math.round(price), timestamp * 1000]

      const postData = {
        sheet: value.sheet,
        data: mainData
      }

      axios.post(gasApiUrl, postData)
      console.log(`${value.timestamp} 100ドル超えたよ！`)
    } else if (value.close - 100 > price) {
      // 100ドルより下回ったと送信
      //100を超えたと送信
      const unixtime = value.timestamp
      const direction = '下降'
      const utcTime = new Date(timestamp * 1000).toUTCString()

      const mainData = [utcTime, unixtime, direction, Math.round(price), timestamp * 1000]

      const postData = {
        sheet: value.sheet,
        data: mainData
      }

      axios.post(gasApiUrl, postData)
      console.log(`${value.timestamp} 100ドル下回った！`)
    } else {
      return value
    }
  })
}
export const checkPosition = () => {
  let positions = []
  return {
    positions,
    setPositions,
    checkCurrentPrice
  }
}
