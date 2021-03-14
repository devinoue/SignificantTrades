import { simpleFormatAmount, totalAmount } from './checkPosition'

const getAmountArray = trades => {
  console.log('はいーーー')
  console.log(trades)
  const amounts = trades.map(trade => {
    return trade.side === 'buy' ? `${simpleFormatAmount(trade.price * trade.size, 3)}` : `-${simpleFormatAmount(trade.price * trade.size, 3)}`
  })
  return amounts
}

export const formatReadability = (ut, trades, data, priceSet, speeds) => {
  const side = data[0].side
  const id = ut
  const open = Math.round(priceSet.open)
  const close = Math.round(priceSet.close)
  const close3 = Math.round(priceSet.threeOpen)
  const close5 = Math.round(priceSet.oldPrices[0])
  const close10 = Math.round(priceSet.oldPrices[1])
  const close30 = Math.round(priceSet.oldPrices[2])
  const amounts = getAmountArray(trades)
  const speed1 = speeds[0]
  const speed5 = speeds[1]
  const speed10 = speeds[2]
  const speed15 = speeds[3]
  const speed30 = speeds[4]

  // 売買高系
  const amount0 = priceSet.oldAmounts[0]
  const amount1 = priceSet.oldAmounts[1]
  const amount2 = priceSet.oldAmounts[2]
  const amount3 = priceSet.oldAmounts[3]
  const amount4 = priceSet.oldAmounts[4]
  const amount5 = priceSet.oldAmounts[5]
  const amountMed1 = priceSet.oldAmounts[6]
  const amountMed5 = priceSet.oldAmounts[7]
  const amountMed10 = priceSet.oldAmounts[8]
  const amountMed15 = priceSet.oldAmounts[9]
  const amountMed30 = priceSet.oldAmounts[10]
  const amountMax1 = priceSet.oldAmounts[11]
  const amountMax5 = priceSet.oldAmounts[12]
  const amountMax10 = priceSet.oldAmounts[13]
  const amountMax30 = priceSet.oldAmounts[14]

  const total = totalAmount(data)

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
    gyaku,
    total,
    amount0,
    amount1,
    amount2,
    amount3,
    amount4,
    amount5,
    amountMed1,
    amountMed5,
    amountMed10,
    amountMed15,
    amountMed30,
    amountMax1,
    amountMax5,
    amountMax10,
    amountMax30
  }
}
