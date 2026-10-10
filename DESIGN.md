---
name: FinanceBuddy
description: 对撞机事例显示:纯黑真空里,三条 Ratio ROC 径迹打在铜色探测环上
colors:
  void: "#070707"
  void-raised: "#0f0f0f"
  edge: "#262626"
  field: "#5e5e5e"
  ink-faint: "#868686"
  ink-muted: "#ababab"
  ink: "#ebebeb"
  copper: "#d08b6f"
  copper-dim: "#674335"
  series-amber: "#d27c00"
  series-cyan: "#00a5cc"
  series-coral: "#eb5249"
  series-violet: "#906ae5"
  series-green: "#3cae48"
  series-rose: "#db4594"
  line-single: "#d7d7d7"
  up: "#00a5cc"
  down: "#eb5249"
typography:
  display:
    fontFamily: "'FB Display', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif"
    fontSize: "clamp(3.25rem, 10vw, 6rem)"
    fontWeight: 400
    lineHeight: 0.95
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "'FB Display', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif"
    fontSize: "clamp(2rem, 4vw, 3rem)"
    fontWeight: 400
    lineHeight: 1
  readout:
    fontFamily: "'Martian Mono Variable', ui-monospace, 'SF Mono', Menlo, monospace"
    fontSize: "clamp(1.5rem, 4vw, 2.25rem)"
    fontWeight: 500
    lineHeight: 1
    fontFeature: "'tnum' 1"
    fontVariation: "'wdth' 87.5"
  lead:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Segoe UI', sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.625
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Segoe UI', sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.625
  title:
    fontFamily: "'Martian Mono Variable', ui-monospace, 'SF Mono', Menlo, monospace"
    fontSize: "12px"
    fontWeight: 500
    fontVariation: "'wdth' 87.5"
  label:
    fontFamily: "'Martian Mono Variable', ui-monospace, 'SF Mono', Menlo, monospace"
    fontSize: "11px"
    fontWeight: 400
    fontFeature: "'tnum' 1"
    fontVariation: "'wdth' 87.5"
rounded:
  none: "0px"
spacing:
  page-x-mobile: "20px"
  page-x: "48px"
  grid-gutter-x: "32px"
  grid-gutter-y: "20px"
  grid-row: "40px"
  stack-gap: "40px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.void}"
    rounded: "{rounded.none}"
    padding: "12px 20px"
  button-primary-hover:
    backgroundColor: "{colors.ink-muted}"
  button-toolbar-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.void}"
    typography: "{typography.title}"
    rounded: "{rounded.none}"
    padding: "6px 10px"
  button-toolbar:
    backgroundColor: "transparent"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.none}"
    padding: "6px 10px"
  button-toolbar-hover:
    textColor: "{colors.ink}"
  input:
    backgroundColor: "{colors.void}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "8px 12px"
  range-tab:
    textColor: "{colors.ink-faint}"
    typography: "{typography.label}"
    padding: "4px 6px"
  range-tab-active:
    textColor: "{colors.ink}"
  panel:
    backgroundColor: "transparent"
    rounded: "{rounded.none}"
  panel-editing:
    backgroundColor: "{colors.void-raised}"
  dialog:
    backgroundColor: "{colors.void-raised}"
    rounded: "{rounded.none}"
    padding: "20px"
    width: "320px"
---

# Design System: FinanceBuddy

## Overview


**Creative North Star: "对撞机事例显示"**

每天收盘是一次事例。画面是一台探测器的横截面:纯黑真空底上,铜色发丝线画出环、刻度和束流管,三条 Ratio 径迹从同一顶点射出,打到 |ROC| 对应的那一环,正负决定向哪边卷。仪表盘是同一台仪器的读数区:面板不套框,只挂一条铜色顶线,图表在真空里直接展开。

色彩分三层,互不越界:零彩度的中性灰承担画布与文字;铜色只属于探测器硬件;信号色只属于数据径迹。密度偏高、留白克制,数字一律等宽,读数逐位滚动时宽度不跳。动效只服务于"事例发生"这一刻:顶点闪光、径迹卷出、命中、读数到位;滚动时同一个探测器 SVG 连续缩成页头徽记,不切页。

用户已明确否决:柔化炭灰底(#141414 / #e1e1e1)、浅色纸面(#f7f7f7 / #1f1f1f)、"深灰 + 亮蓝"的行情终端观感,以及 TradingView 仿品式外观。

**Key Characteristics:**
- 纯黑真空底,所有中性色零彩度
- 铜色发丝线只画探测器硬件,不发光、不填实
- 六槽分类径迹色按顺序固定分配,已过 CVD 校验
- 直角,无阴影,无卡片外框
- 数字用窄宽等宽体 Martian Mono,中文标题用得意黑斜体

## Colors

三层分工:中性灰是真空和墨,铜是仪器,信号色是粒子。

### Primary
- **探测器铜** (copper):探测环、外层刻度、束流管、Ratio ROC 的 0 轴虚线、焦点环、输入光标、编辑态的面板顶线与缩放手柄、选中的区间页签下划线、"草稿"标记。只以 1–1.5px 线或细描边出现。
- **暗铜** (copper-dim):常态面板顶线、滚动条滑块、RSI 30/70 参考虚线、缺数状态的虚线框、::selection 背景(文字保持 ink)。

### Secondary
- **分类径迹六槽** (series-amber、series-cyan、series-coral、series-violet、series-green、series-rose):按槽位顺序固定分配给一张卡里的第 1–6 条序列,封面三条径迹取前三槽。同一 Ratio 在封面、页头读数、图例和折线里颜色一致。经 dataviz validate_palette.js 在 #070707 上校验:全部通过,相邻最差 CVD ΔE 10.7(deutan),正常视觉最差 ΔE 26.8。
- **涨 / 跌** (up、down):K 线实体与影线、OHLC 读数里的收盘价;成交量柱用同色 45% 透明度。涨跌对 deutan ΔE 19.3,通过。删除类图标按钮的悬停色也用 down。
- **单序列线** (line-single):指标卡(RSI / ROC / SMA / EMA)只有一条线,用中性亮灰,不占分类色,避免和 Ratio 的身份色混淆。

### Neutral
- **真空** (void):整页画布、图表背景、输入框底、浏览器 theme-color。
- **抬升真空** (void-raised):只用于浮层,登录对话框与编辑态面板底(60% 透明度)。
- **边线** (edge):吸顶页头底线、读数列表分隔线、次级按钮描边、十字线标签底、时间轴边线。
- **场线** (field):输入框描边,对 void 对比度 ≥3:1;十字线本身也用这一档。
- **淡墨** (ink-faint):日期、"35 日前"、图注、未选区间页签等次要读数。
- **中墨** (ink-muted):标签、图表坐标轴文字、次级按钮文字、主按钮悬停底。
- **墨** (ink):正文、标题、读数数值、主按钮底、顶点圆点。
- 图表网格线为白色 7.5% 透明度,K 线卡水印为白色 5% 透明度,均为中性。

### Named Rules
**The Zero-Chroma Rule.** 画布与文字的中性色彩度一律为 0。之前全局偏暖棕,读起来像老照片的棕褐滤镜;暖色永远不回到画布和文字上。

**The Copper-Is-Hardware Rule.** 铜色只画探测器硬件:环、刻度、面板顶线、零线、焦点、光标、滚动条、参考线、编辑态提示。它从不做实心填充(主按钮悬停用 ink-muted,不用铜);读数工具(网格、十字线、水印)不是硬件,一律中性。

**The Fixed-Slot Rule.** 分类色按槽位顺序分配,永不循环;一张卡超过 6 条序列在 UI 层直接拒绝。琥珀径迹与铜色只差 ΔE 8.0,二者的区分同时依赖"粗径迹 vs 发丝线"和位置,不要让琥珀以发丝线出现在铜件旁边。

## Typography

**Display Font:** FB Display(得意黑 Smiley Sans 的站内子集,OFL-1.1,按保留字体名条款改名;斜体,缺字回落 PingFang SC / 微软雅黑)
**Body Font:** 系统中文黑体栈(-apple-system、PingFang SC、Hiragino Sans GB、Microsoft YaHei)
**Label/Mono Font:** Martian Mono Variable,宽度轴收窄到 87.5%,等宽数字

**Character:** 得意黑的斜切笔画像径迹的偏转,只给中文大标题;其余一切数字、代号、标签都是窄宽等宽体,像仪器面板上的刻字。

### Hierarchy
- **Display**(400,clamp(3.25rem, 10vw, 6rem),0.95):封面结论标题,一页只有一个。
- **Headline**(400,clamp(2rem, 4vw, 3rem),1):仪表盘区块标题"核对图表"。
- **Readout**(500,clamp(1.5rem, 4vw, 2.25rem),1,等宽):封面读数列表里的 ROC 数值,% 号缩到 0.55em 并降为中墨。
- **Lead**(400,17px,桌面 18px,1.625):封面结论下的一句话解释,最长 30ch,用墨色。
- **Body**(400,13px,1.625):指标含义说明(最长 44ch)、状态说明文字。
- **Title**(500,12px,等宽):卡片标题、页头品牌字、工具栏按钮文字。
- **Label**(400,11px,等宽):OHLC 读数、图例、日期、图注、区间页签。图表坐标轴为 10px。

### Named Rules
**The Tabular Rule.** 凡是会变化的数字都用等宽体加 tabular-nums,读数逐位滚动时宽度不能跳。

**The One Display Rule.** 得意黑只给中文大标题(Display、Headline)。不用它排正文、按钮或数字。

## Layout

整页是一条连续滚动:上半封面(min-height 100svh),下半仪表盘,内容最宽 1440px,页边距手机 20px、桌面 48px。

封面在 ≥768px 时是 5:7 两栏:左栏自上而下为结论标题、解释、读数列表、主按钮"进入图表"、指标说明;右栏是探测器,最宽 780px,纵向居中。手机端单栏,探测器宽 min(78vw, 40svh) 放在标题与读数之间。在 390×844 视口里,"进入图表"按钮必须留在首屏(当前位于 758–805px);任何加到封面上半部的内容都要先核对这一点。

仪表盘顶部是吸顶页头(探测器徽记 28px + 当前读数 + Admin 操作),下方是 12 列网格:行高 40px,横向间距 32px,纵向 20px,无内边距。<768px 时改为单列堆叠,卡片间距 40px,每类卡固定高度(K 线 420px、Ratio ROC 380px、指标 260px),并且不开放布局编辑:单列堆叠时拖拽没有意义。

手势:图表画布竖向滑动交给页面滚动,横向拖拽与双指捏合交给图表。

## Elevation & Depth

完全平面,没有任何阴影。层次只靠三件事:真空与抬升真空(void / void-raised)的明度差、一条发丝线,以及透明度(未选中的径迹降到 18%,读数行降到 35%)。浮层(登录对话框)用 void-raised 加 80% 透明的真空遮罩,不加投影。

### Named Rules
**The Vacuum Rule.** 不发光、不投影、不模糊。探测器之所以显得精密,是因为铜线是唯一的"实物"。

## Shapes

所有角都是直角(0px),包括按钮、输入框、对话框、编辑态拖放占位。唯一的曲线来自数据本身:同心探测环与卷曲的径迹。线宽是形式语言的核心:硬件 1–1.5px 发丝线,数据径迹 3.5px 圆头粗线,幽灵径迹 1.5px 虚线(3 7),外层 μ 子室为 2 9 虚线加 72 根刻度(每 6 根一根长刻度)。站内图标同一套 14px 网格、1.5px 描边、圆头圆角,随文字颜色。

## Components

### Buttons
- **Shape:** 直角(0px),文字与 14px 图标间距 6px(主按钮 12px)。
- **Primary:** 墨底真空字,封面主按钮 15px / 500,内边距 12px 20px,箭头图标悬停时下移 2px;工具栏主按钮("发布""登录")12px,内边距 6px 10px。
- **Hover / Focus:** 主按钮悬停底色换成中墨,不用铜;次级按钮悬停描边从 edge 换成铜、文字从中墨变墨,150ms 颜色过渡。键盘焦点统一为 1.5px 铜色描边,外偏移 3px。禁用为 40% 不透明度。
- **Secondary:** 透明底、edge 描边、中墨字,用于页头与编辑工具栏的所有次级操作。
- **Icon-only:** 无描边,内边距 6px,中墨图标;悬停变墨,删除类变 down。

### Cards / Containers
- **Corner Style:** 直角(0px)。
- **Background:** 浏览态透明,直接落在真空上;编辑态为 60% 的抬升真空。
- **Shadow Strategy:** 无,见 Elevation & Depth。
- **Border:** 只有一条顶线:浏览态暗铜实线,编辑态铜色虚线;没有侧边和底边。
- **Internal Padding:** 标题行上下 10px,图表区贴边;编辑态左右各 8px 并整行可拖。
- **缺数状态:** 空槽中央一张暗铜虚线框说明标签(12px 中墨,最长 34ch),如实写出配额与分批加载,不用红字报错。

### Inputs / Fields
- **Style:** 真空底、场线描边(field,对比度 ≥3:1)、直角;登录框 13px、内边距 8px 12px,卡片参数表单 11px 等宽、内边距 4px 8px。
- **Focus:** 描边换成铜,光标为铜色;不加光晕。

### Navigation
- **吸顶页头:** 真空底、edge 底线。左侧是封面探测器滚动后落下的 28px 徽记与等宽品牌字,中间是当前读数(2px × 12px 色条 + 数值,窄屏隐藏代号),右侧仅 Admin 可见的操作按钮。访客看不到任何编辑入口。
- **区间页签:** 11px 等宽,未选为淡墨,悬停中墨;选中为墨字加 1px 铜色下划线。

### 探测器(Signature Component)
同一个 SVG 有两种尺寸。封面版:同心环按每档一环标注百分比(中墨 19 单位等宽字),最外环 55% 不透明、其余 30%;铜色十字束流管与墨色顶点;径迹终点挂命中圆点与 22 单位外圈,外侧挂等宽代号;35 天前的位置以同色虚线幽灵径迹显示(45% 不透明)。悬停或点按某条径迹,其余径迹降到 18%,封面读数列表同步降到 35%,命中区宽 48 单位便于手指点选。徽记版只保留环与粗径迹。

动效:数据到齐后顶点闪光(0.7s),径迹按 180ms 起、每条间隔 260ms 依次卷出(1.1s,ease-out-expo),命中点在卷出后 700ms 弹出(0.9s),读数与径迹同步逐位滚动。滚动时探测器按封面滚出比例连续缩放平移,精确落进页头徽记,文字先上移淡出,只写 transform / opacity。prefers-reduced-motion 下径迹直接画满、命中点直接显示。

## Do's and Don'ts

### Do:
- **Do** 让所有中性色保持零彩度(void 到 ink 七档),新增灰阶也必须 R=G=B。
- **Do** 把铜色限制在 1–1.5px 的硬件线、焦点、光标和编辑态提示上。
- **Do** 按槽位顺序分配 series 色,并在一张卡超过 6 条序列时在 UI 层拒绝。
- **Do** 单序列指标线用 line-single,网格、十字线(#5e5e5e,标签底 #262626)和水印保持中性。
- **Do** 所有会变的数字用等宽 tabular-nums。
- **Do** 改动封面上半部后,在 390×844 上确认"进入图表"仍在首屏内。

### Don't:
- **Don't** 让暖色回到画布或文字上;之前的暖棕中性色像老照片的棕褐滤镜。
- **Don't** 用铜色做实心填充:主按钮悬停用 ink-muted,::selection 用 copper-dim 底配 ink 字。
- **Don't** 循环复用分类色,也不要让琥珀以发丝线出现在铜件旁边。
- **Don't** 使用柔化炭灰底(#141414 / #e1e1e1)或浅色纸面(#f7f7f7 / #1f1f1f),两者都已被否决。
- **Don't** 做成"深灰 + 亮蓝"的行情终端或 TradingView 仿品外观。
- **Don't** 加阴影、发光、圆角或卡片外框。
- **Don't** 在 <768px 开放布局编辑。
