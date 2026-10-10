/** 把取数错误翻成访客能看懂的话:说清是什么问题、怎么恢复 */
export function describeDataError(err: Error): string {
  if (/HTTP 429/.test(err.message)) {
    return /for the day/i.test(err.message)
      ? 'Twelve Data 免费额度今天已用完,明天(北京时间早上 8 点左右)恢复'
      : 'Twelve Data 免费配额本分钟已用完,稍等一分钟刷新即可'
  }
  if (/HTTP 5\d\d/.test(err.message) || /Failed to fetch|NetworkError/i.test(err.message)) {
    return '行情服务暂时连不上,稍后刷新重试'
  }
  return err.message
}
