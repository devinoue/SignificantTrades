export function getNoldPriceRange(prices, targetPeriod, num) {
  // n個前のデータの始値を抽出する。
  const prevOpen = prices.find(v => v.timestamp === targetPeriod - (num + 1) * 10)
  // 最新の終値を抽出する
  const latestOpen = prices.find(v => v.timestamp === targetPeriod)
  return prevOpen?.price ?? 0
}
