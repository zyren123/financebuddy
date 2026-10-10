# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **作者本人**：最主要的使用者，同时是 Admin，也就是唯一持有发布口令的编辑者。经 `#admin` 登录，在 Edit Mode 中编辑 Draft，Publish 后对所有访客生效。
- **群友访客**：公开群里的朋友，只读，无需登录。他们不会自己在 TradingView 之类的工具里配置 VTV/QQQ ROC 这样的自定义比值指标，FinanceBuddy 让他们打开链接就能看到算好的结果。

典型场景，三者并存：
1. 每日收盘后扫一眼：几分钟内看清 Ratio ROC 等信号的状态有没有变化。
2. 做配置决策：在价值/红利与成长之间轮动或再平衡时深入看。
3. 手机上随手看：移动端浏览是常态，不是例外。

## Product Purpose

把美股股票与 ETF 的行情，尤其是比值动量，排成一张由 Admin 策划、对所有人一致的卡片仪表盘，作者自己用来跟踪，同时分享给群友：他们不用自己搭图表、写自定义指标，也能读到风格轮动信号。成功的标准是：收盘后打开即可判断"信号变了没有"，需要决策时能下钻到 K 线与指标核对。

## Positioning

核心是 **Ratio ROC**：对 `分子/分母` 比值序列算 N 日 ROC（默认 N=35，如 VTV/QQQ、SCHD/QQQ、CGDV/QQQ），多条 Ratio 同周期叠在一张图上。它是风格轮动（价值/红利 vs 成长）的核心决策依据，而不是众多指标中的一个。K 线卡和指标卡是围绕它的佐证。通用行情工具里看这类比值动量需要自己配置，这里打开就能看，不需要任何配置。

## Operating Context

- 数据源：Twelve Data 免费配额（8 credits/分钟、800/天），经薄代理 `/api/td` 转发（ADR-0001）。首屏多标的时按限速分批点亮，加载是渐进的。
- 日线级数据，IndexedDB 全量缓存加每日增量，不做盘中实时。
- 指标全部在前端计算（ADR-0002）。
- 布局是服务端单一事实源（ADR-0003）：Published Layout 存 KV，Factory Layout 兜底；访客的时间区间等属于 Browse State，刷新即回。
- 部署：Vercel 与 EdgeOne 双平台。

## Capabilities and Constraints

- 三种 Card：K 线卡（蜡烛 + 成交量）、Ratio ROC 卡、指标卡（RSI / ROC / SMA / EMA，参数可调）。归一化对比卡已明确排除。
- 两种 Preset：四宫格、自上而下，仅 Edit Mode 可用。
- 网格可拖拽、可调宽高（react-grid-layout），图表用 lightweight-charts，十字线联动读数。
- 术语以 `CONTEXT.md` 为准（Ticker、Ratio、Card、Draft、Publish 等），界面文案为中文（`lang="zh-CN"`）。
- 未来可能升级为多账号、每人一份布局，目前未决定。
- 链接会发到公开群里，访客可能是不熟悉 Ratio ROC 的人。是否需要"非投资建议"类声明：未决定。

## Brand Commitments

- 名称：FinanceBuddy。
- 现有视觉参照是"TradingView 式观感"（README），图表配色经过 CVD（色觉缺陷）校验。

## Evidence on Hand

- 真实行情数据通过 Twelve Data 获取；出厂布局在 `public/default-dashboard.json`。
- 没有用户数、证言、回测业绩或收益数据。任何界面都不得虚构这些内容，也不得把 Ratio ROC 包装成有业绩背书的信号。

## Product Principles

1. **信号先于噪音**：Ratio ROC 是主角，访客应当一眼读出轮动状态，其他卡片服务于核对。
2. **一套视图，人人一致**：访客看到的就是 Admin 发布的那一版，浏览偏好不污染布局。
3. **扫一眼与深挖都要成立**：收盘后几分钟的快读，和配置决策时的细读，在同一界面里完成。
4. **手机是一等公民**：移动端的读数、手势与布局不能是桌面的降级。
5. **诚实对待配额与延迟**：日线数据、限速分批加载是事实，界面要如实呈现状态，不假装实时。

## Accessibility & Inclusion

- 图表配色需通过 CVD 校验（现有约定，需保持）。
- 中文界面。
