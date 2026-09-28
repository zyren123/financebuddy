# FinanceBuddy

个人自用的美股行情仪表盘:从 Twelve Data 拉取美股股票与 ETF 数据,以卡片网格展示 K 线、比值动量与指标图。访客只读;布局由 Admin 维护,Publish 后对所有访客生效(未来可能升级为多账号,每人一份自己的布局)。

## Language

**Ticker**:
一支美股股票或 ETF 标的(如 QQQ、VTV)。其代码称为 symbol。
_Avoid_: tickt, stock(含糊), 股票/标的(口语)

**Ratio**:
有序的两个 Ticker 构成的比值对,写作 `分子/分母`(如 `VTV/QQQ`)。按日期对齐两标的收盘价后相除得到的序列称为**比值序列**。
_Avoid_: pair(与"标的对"混淆), spread(不同概念)

**Ratio ROC**:
对某个 Ratio 的比值序列计算的 N 日 ROC(`ratio[t] / ratio[t-N] - 1`),N 默认 35。是本项目第一个自定义指标。
_Avoid_: "VTV/QQQ 的 ROC"(口语,未指明先取比值)

**Dashboard**:
由若干 Card 组成的工作区,是应用的主体界面。

**Card**:
Dashboard 网格上的一张图,绑定一类图表规格。v1 共三种:**K 线卡**(单 Ticker 蜡烛图 + 成交量)、**Ratio ROC 卡**(多条 Ratio 的同周期 ROC 画在同一坐标系)、**指标卡**(单 Ticker 的一个指标,参数可调)。
_Avoid_: 图、chart(口语中既指 Card 又指 pane,含糊);归一化对比卡(已明确排除)

**Edit Mode**:
Dashboard 的编辑状态:可拖拽换位、调整宽高、增删卡片、应用 Preset。仅 Admin 可进入;期间的改动只写入 Draft,未 Publish 前对访客不可见。
_Avoid_: 解锁模式、编辑器

**Preset**:
一键重排当前 Dashboard 的布局模板(v1 两种:四宫格、自上而下)。仅在 Edit Mode 下可用。
_Avoid_: 默认布局(与 Published Layout 混淆)

**Admin**:
唯一持有发布口令的编辑者:只有 Admin 能进入 Edit Mode、编辑 Draft、执行 Publish;访客始终只读。
_Avoid_: 维护者(指经仓库与部署改代码的人,是另一个角色)

**Draft**:
Admin 在 Edit Mode 中的未发布布局副本,会话级,放弃编辑即丢弃。
_Avoid_: Local Layout(已废弃)

**Publish**:
Admin 的显式发布动作:校验通过后,Draft 成为新的 Published Layout,对所有访客生效;被替换的旧版保留为上一版,可回滚。
_Avoid_: 保存(未指明对所有访客生效)

**Published Layout**:
对所有访客生效的现行布局,存于服务端,只能由 Admin 通过 Publish 更新;访客在技术上无法改写。
_Avoid_: 默认布局(含糊)

**Factory Layout**:
随应用分发、捆绑在构建产物中的出厂布局;仅在服务端没有 Published Layout 或不可达时兜底。
_Avoid_: 默认布局、与 Published Layout 混用

**Browse State**:
访客会话内的临时视图偏好(如卡片的时间区间),刷新即回,不属于布局、不可发布。
_Avoid_: 个性化布局
