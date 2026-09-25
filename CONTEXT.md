# FinanceBuddy

个人自用的美股行情仪表盘:从 Twelve Data 拉取美股股票与 ETF 数据,以卡片网格展示 K 线、比值动量与指标图。单用户、无登录(未来可能升级为多账号版本)。

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
Dashboard 的编辑状态:可拖拽换位、调整宽高、增删卡片、应用 Preset。默认处于浏览模式(纯查看)。
_Avoid_: 解锁模式、编辑器

**Preset**:
一键重排当前 Dashboard 的布局模板(v1 两种:四宫格、自上而下)。仅在 Edit Mode 下可用。
_Avoid_: 默认布局(与 Published Layout 混淆)

**Published Layout**:
随应用分发、对所有访客生效的默认布局,只能由维护者通过发布流程(导出 JSON → 仓库 → 部署)更新,访客在技术上无法改写。
_Avoid_: 默认布局(含糊)

**Local Layout**:
单个浏览器内的布局副本。Edit Mode 的修改只写入此处(localhost 存储),不影响 Published Layout 与其他访客。
_Avoid_: 用户布局(与未来多账号版的账号级布局混淆)
