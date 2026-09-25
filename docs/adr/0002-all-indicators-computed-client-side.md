# 0002 · 指标全部前端计算,不用 Twelve Data 指标端点

Twelve Data 提供 100+ 服务端指标端点(RSI/ROC/SMA…,各 1 credit/symbol),但本项目的核心自定义指标 Ratio ROC(比值序列的 N 日 ROC)API 永远算不了。决定:只拉原始 OHLCV(`time_series`),RSI/ROC/SMA/EMA 及一切衍生序列统一在前端一套纯函数引擎计算。理由:自定义指标反正必须前端算,统一引擎保证行为一致;不为指标烧额外 credits;参数(如周期 35)可调而无需重新请求。

## Consequences

- 指标种类与参数不受 API 配额限制;
- 前端指标库成为必须测试先行(TDD)的核心模块,正确性责任在我们而非 API 方。
