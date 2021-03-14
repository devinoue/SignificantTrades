import { orderPosition } from './checkPosition'
import { formatReadability } from './strategyHelper'

export function just3B(id, trades, data, priceSet, speeds) {
  const { close, close3, total, amount0, sei, gyaku } = formatReadability(trades[0].timestamp, trades, data, priceSet, speeds)

  if (Math.abs((total / amount0) * Math.abs(close3 - close)) > 20.6) {
    orderPosition('just3', 'new', id, sei)
  } else {
    orderPosition('just3', 'new', id, gyaku)
  }
}

export function just3A(id, trades, data, priceSet, speeds) {
  console.log('入った')

  const { open, close, close5, speed5, speed10, sei, gyaku } = formatReadability(data[0].timestamp, trades, data, priceSet, speeds)
  if ((Math.abs(close5 - close) < 400 && Math.abs(close - open) < 170 && speed5 < 1000 && speed10 < 1000, speed5 > 200, speed10 > 200)) {
    if (speed5 > 340) {
      orderPosition('just3', 'new', id, sei)
    } else {
      orderPosition('just3', 'new', id, gyaku)
    }
  }
}

export function windexC(id, trades, data, priceSet, speeds) {
  console.log('windexc入った')
  const { amount0, amount1, speed1, sei } = formatReadability(data[0].timestamp, trades, data, priceSet, speeds)
  if (amount0 < amount1 * 4.3 && amount0 < 24 && speed1 > 430) {
    console.log(`windex cの条件に合致: ID ${id}`)
    orderPosition('windex', 'new', id, sei)
  } else {
    console.log('条件に合わず保留')
  }
}

export function testStrategy(id, trades, data, priceSet, speeds) {
  console.log('テスト用戦略に入りました')
  const { amount0, amount1, speed1, sei } = formatReadability(data[0].timestamp, trades, data, priceSet, speeds)
  orderPosition('test', 'new', id, sei)
}
