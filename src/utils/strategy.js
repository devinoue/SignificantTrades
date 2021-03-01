import { orderPosition, simpleFormatAmount } from './checkPosition'

const formatReadability = (ut, tmpAmounts, data, priceSet, speeds) => {
  const side = data[0].side
  const id = ut
  const open = Math.round(priceSet.open)
  const close = Math.round(priceSet.close)
  const close3 = Math.round(priceSet.threeOpen)
  const close5 = Math.round(priceSet.oldPrices[0])
  const close10 = Math.round(priceSet.oldPrices[1])
  const close30 = Math.round(priceSet.oldPrices[2])
  const amounts = tmpAmounts
  const speed1 = speeds[0]
  const speed5 = speeds[1]
  const speed10 = speeds[2]
  const speed15 = speeds[3]
  const speed30 = speeds[4]

  const sei = side
  const gyaku = side === 'buy' ? 'sell' : 'buy'
  return {
    id,
    open,
    close,
    close3,
    close5,
    close10,
    close30,
    amounts,
    speed1,
    speed5,
    speed10,
    speed15,
    speed30,
    side,
    sei,
    gyaku
  }
}

export function just3A(strategy, data, priceSet, speeds) {
  console.log('入った')
  const amount =
    data[0].side === 'buy' ? `${simpleFormatAmount(data[0].price * data[0].size, 3)}` : `-${simpleFormatAmount(data[0].price * data[0].size, 3)}`
  const {
    id,
    open,
    close,
    close3,
    close5,
    close10,
    close30,
    amounts,
    speed1,
    speed5,
    speed10,
    speed15,
    speed30,
    side,
    sei,
    gyaku
  } = formatReadability(data[0].timestamp, [amount], data, priceSet, speeds)
  if ((Math.abs(close5 - close) < 400 && Math.abs(close - open) < 170 && speed5 < 1000 && speed10 < 1000, speed5 > 200, speed10 > 200)) {
    if (speed5 > 340) {
      orderPosition(strategy, 'new', id, sei)
    } else {
      orderPosition(strategy, 'new', id, gyaku)
    }
  }
}
