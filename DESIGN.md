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
  subhead:
    fontFamily: "'FB Display', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif"
    fontSize: "clamp(1.5rem, 4vw, 2.25rem)"
    fontWeight: 400
    lineHeight: 1.1
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
  run-directory:
    typography: "{typography.label}"
    textColor: "{colors.ink-faint}"
    width: "220px"
  run-directory-active:
    textColor: "{colors.ink}"
  research-prose:
    typography: "{typography.lead}"
    textColor: "{colors.ink-muted}"
    width: "38em"
  rule-chip:
    backgroundColor: "transparent"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.none}"
    padding: "6px 8px 6px 10px"
  rule-chip-active:
    textColor: "{colors.ink}"
  config-select:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "4px 24px 4px 0"
  toggletip:
    backgroundColor: "{colors.void-raised}"
    rounded: "{rounded.none}"
    padding: "12px 16px"
    width: "300px"
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
- **研究控制台里的铜**:暗铜画配置条的常态顶线,以及载入、未运行、出错时的虚线框。铜画实验目录的竖向标记、配置条顶线上随世界流入填满的进度线、选中规则芯片与构造方式按钮的 1px 描边、规则编辑器打开时的调整图标、扇面的 $1 起点虚线、术语浮层顶线与术语下划线的悬停色,以及 RUN 编号文字。RUN 编号是铜唯一以文字出现的地方,分工见 The Instrument-Line Rule。

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

**The Instrument-Line Rule.** 研究控制台里铜只标三类东西:焦点与选中(选中芯片描边、实验目录标记、编辑中的调整图标)、仪器线(配置条顶线与进度、$1 起点虚线、浮层顶线)、实验编号(RUN 05 这类等宽字)。读数工具一律中性:扇面十字线是 field 1px 竖线,悬停读数框是 void-raised 加 edge 描边,网格是白色 7.5%。数据只用两种颜色说话:平行世界是零彩度的灰,真实历史是该规则的槽位色;中位与分位区间是墨。胜负、好坏这类方向靠位置和明度表达,不借涨跌色,也不借铜。

## Typography

**Display Font:** FB Display(得意黑 Smiley Sans 的站内子集,OFL-1.1,按保留字体名条款改名;斜体,缺字回落 PingFang SC / 微软雅黑)
**Body Font:** 系统中文黑体栈(-apple-system、PingFang SC、Hiragino Sans GB、Microsoft YaHei)
**Label/Mono Font:** Martian Mono Variable,宽度轴收窄到 87.5%,等宽数字

**Character:** 得意黑的斜切笔画像径迹的偏转,只给中文大标题;其余一切数字、代号、标签都是窄宽等宽体,像仪器面板上的刻字。

### Hierarchy
- **Display**(400,clamp(3.25rem, 10vw, 6rem),0.95):封面结论标题,一页只有一个。
- **Headline**(400,clamp(2rem, 4vw, 3rem),1):仪表盘区块标题"核对图表"。研究控制台的总结论标题和每个 RUN 小节标题也用这一档,行高放到 1.05;总结论最长 20ch(≥1280px 不限),小节标题最长 24ch。
- **Subhead**(400,clamp(1.5rem, 4vw, 2.25rem),1.1):RUN 小节内部的中文小标题,目前只有 RUN 05 解读栏的「换参数，衰退还在」。它和 Readout 同尺寸、不同字族:Subhead 用得意黑排中文,Readout 用等宽排数字,二者不互换。图表、表格上方的说明标题不用它,用 13px / 500 的正文黑体。
- **Readout**(500,clamp(1.5rem, 4vw, 2.25rem),1,等宽):封面读数列表里的 ROC 数值,% 号缩到 0.55em 并降为中墨。
- **Lead**(400,17px,桌面 18px,1.625):封面结论下的一句话解释,最长 30ch,用墨色。研究控制台的段落正文(总结论解读、RUN 小节导语、RUN 05 解读栏)也用 17px / 1.625,但桌面不升到 18px,用中墨,最长 38em(总结论解读 40em);句中关键数字提为墨色,总结论里用等宽,小节导语里用 500 字重。
- **Body**(400,13px,1.625):指标含义说明(最长 44ch)、状态说明文字。
- **Title**(500,12px,等宽):卡片标题、页头品牌字、工具栏按钮文字。
- **Label**(400,11px,等宽):OHLC 读数、图例、日期、图注、区间页签。图表坐标轴为 10px。

### Named Rules
**The Tabular Rule.** 凡是会变化的数字都用等宽体加 tabular-nums,读数逐位滚动时宽度不能跳。

**The One Display Rule.** 得意黑只给中文标题:Display、Headline,以及小节内的 Subhead。不用它排正文、按钮或数字,也不用它排比 Subhead 更小的说明标题。新增标题文字后要重跑 scripts/subset-display-font.py,否则缺字会落回系统黑体。

## Layout

整页是一条连续滚动:上半封面(min-height 100svh),下半仪表盘,内容最宽 1440px,页边距手机 20px、桌面 48px。

封面在 ≥768px 时是 5:7 两栏:左栏自上而下为结论标题、解释、读数列表、主按钮"进入图表"、指标说明;右栏是探测器,最宽 780px,纵向居中。手机端单栏,探测器宽 min(78vw, 40svh) 放在标题与读数之间。在 390×844 视口里,"进入图表"按钮必须留在首屏(当前位于 758–805px);任何加到封面上半部的内容都要先核对这一点。

仪表盘顶部是吸顶页头(探测器徽记 28px + 当前读数 + Admin 操作),下方是 12 列网格:行高 40px,横向间距 32px,纵向 20px,无内边距。<768px 时改为单列堆叠,卡片间距 40px,每类卡固定高度(K 线 420px、Ratio ROC 380px、指标 260px),并且不开放布局编辑:单列堆叠时拖拽没有意义。

手势:图表画布竖向滑动交给页面滚动,横向拖拽与双指捏合交给图表。

研究控制台是仪表盘的第三个页签「TQQQ 研究」,只对 Admin 出现,沿用同一个 1440px 容器。≥1024px 时分两栏:左侧 220px 实验目录吸顶(距顶 88px,让出页头),右侧是阅读栏,栏间距 48px。<1024px 时目录变成正文上方一行横向滚动的列表,归档日期与 commit 隐藏。阅读栏顺序固定:总结论标题与解读、RUN 05 实验台、RUN 04 到 01、我的实验。RUN 小节之间上留白 64px(≥768px 为 96px);标题下 20px 是配置条,再 20px 是导语,图表与表格距导语 40px。导语最长 38em,图表和表格占满栏宽。锚点跳转留出 96px 的 scroll-margin。

实验台内部:≥1024px 时扇面与右侧 220px 读数列并排(间距 40px),读数列与扇面同高 340px,三项上下撑开;更窄时读数改成两列网格排在扇面下。<768px 时配置条收成一行摘要,把扇面留在首屏。

## Elevation & Depth

完全平面,没有任何阴影。层次只靠三件事:真空与抬升真空(void / void-raised)的明度差、一条发丝线,以及透明度(未选中的径迹降到 18%,读数行降到 35%)。浮层(登录对话框)用 void-raised 加 80% 透明的真空遮罩,不加投影。研究控制台的两种浮层(术语浮层,以及扇面与散点图的悬停读数框)同样是 void-raised 加 edge 1px 描边,不加投影;术语浮层另加一条铜色顶线,与登录对话框一致。

### Named Rules
**The Vacuum Rule.** 不发光、不投影、不模糊。探测器之所以显得精密,是因为铜线是唯一的"实物"。

## Shapes

所有角都是直角(0px),包括按钮、输入框、对话框、编辑态拖放占位。唯一的曲线来自数据本身:同心探测环与卷曲的径迹。线宽是形式语言的核心:硬件 1–1.5px 发丝线,数据径迹 3.5px 圆头粗线,幽灵径迹 1.5px 虚线(3 7),外层 μ 子室为 2 9 虚线加 72 根刻度(每 6 根一根长刻度)。站内图标同一套 14px 网格、1.5px 描边、圆头圆角,随文字颜色。研究控制台沿用这套线宽层级,补了几档:平行世界径迹是 1px 灰色发丝线;真实历史是 2.5px 圆头径迹,下垫一条 6px 的真空色底线把它从扇面里切出来,终点挂半径 3.5px 的圆点;中位是 1.5px 虚线(4 4);$1 起点是 1px 铜色虚线(3 5)。分布条里的真实历史是菱形,外圈一道真空色描边。芯片、配置下拉、浮层同样是直角。

## Components

### Buttons
- **Shape:** 直角(0px),文字与 14px 图标间距 6px(主按钮 12px)。
- **Primary:** 墨底真空字,封面主按钮 15px / 500,内边距 12px 20px,箭头图标悬停时下移 2px;工具栏主按钮("发布""登录")12px,内边距 6px 10px。
- **Hover / Focus:** 主按钮悬停底色换成中墨,不用铜;次级按钮悬停描边从 edge 换成铜、文字从中墨变墨,150ms 颜色过渡。键盘焦点统一为 1.5px 铜色描边,外偏移 3px。禁用为 40% 不透明度。
- **Secondary:** 透明底、edge 描边、中墨字,用于页头与编辑工具栏的所有次级操作。
- **Icon-only:** 无描边,内边距 6px,中墨图标;悬停变墨,删除类变 down。
- **研究控制台:** "运行 / 运行新配置 / 复跑"和"新建实验"是工具栏主按钮(12px / 500,内边距 6px 12px,带 14px 图标);"停止""添加规则""在浏览器里用这种构造方式复跑"是次级按钮。

### Chips
- **规则芯片:** 实验台里一条规则一枚芯片,直角,1px 描边:未选为 edge、悬停为 field,选中(正在扇面里查看的那条)为铜,文字从中墨变墨。左侧 12px × 2px 色条是该规则的槽位色,删除其他规则时它不换色。最多 6 枚,与 series 槽数相同;满了"添加规则"禁用并写明原因。芯片尾部是调整图标(编辑器打开时变铜)和移除图标(悬停变 down)。<768px 一行横向滚动,贴到页边。
- **规则编辑器:** 在芯片下方展开,edge 顶线,字段按 2 / 4 / 7 列排(手机 / ≥640px / ≥1024px),作者默认参数在选项后标"· 作者"。
- **构造方式按钮:** 衰退明细里切换构造方式的一组按钮与芯片同一套:edge 描边、中墨字,选中或悬停时描边换铜、文字变墨。

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
- **配置下拉(研究控制台):** 只有一条 1px 底线,透明底,12px 等宽墨字,右侧淡墨箭头;底线常态为 field,悬停中墨,聚焦铜。字段名 11px 淡墨在上。运行中整排降到 40% 并禁用。随机种子是同款底线输入框(宽 86px)加一个骰子图标按钮。

### Navigation
- **吸顶页头:** 真空底、edge 底线。左侧是封面探测器滚动后落下的 28px 徽记与等宽品牌字,中间是当前读数(2px × 12px 色条 + 数值,窄屏隐藏代号),右侧仅 Admin 可见的操作按钮。访客看不到任何编辑入口。
- **管理员中间宽度:** 768–1023px 时操作按钮独占第二行,保留第一行的完整读数;访客页头不增加操作行。
- **区间页签:** 11px 等宽,未选为淡墨,悬停中墨;选中为墨字加 1px 铜色下划线。
- **登录键盘路径:** 打开时聚焦发布口令,Tab 与 Shift+Tab 留在对话框内,验证中也保留可操作的取消按钮;Escape 关闭后回到先前焦点,没有先前控制时聚焦回到封面的链接。
- **视图页签:** 仪表盘标题行上的「核对图表 / 美股指标 / TQQQ 研究」,第三项只对 Admin 出现;选中下划线与区间页签共用 1px 铜色弹簧指示条。编辑布局时其他页签禁用。
- **实验目录:** 研究控制台左栏的 RUN 列表,11px 等宽,未选淡墨、悬停中墨、当前为墨。≥1024px 时左缘有一条 1px 铜色竖线,用 selection 弹簧(刚度 560、阻尼 43)移到当前条目并拉伸成它的高度;当前条目由滚动决定,取视口 15%–35% 区间里第一个 RUN。点按平滑滚动到该 RUN,减少动态效果时直接跳转。<1024px 时变成一行横向滚动,不画竖线。
- **指标切换:** 分布图上方的"最大回撤 / 年化 / Sharpe",11px 等宽,未选淡墨,选中为墨字加 1px 铜色弹簧下划线,与区间页签同款。

### 探测器(Signature Component)
同一个 SVG 有两种尺寸。封面版:同心环按每档一环标注百分比(中墨 19 单位等宽字),最外环 55% 不透明、其余 30%;铜色十字束流管与墨色顶点;径迹终点挂命中圆点与 22 单位外圈,外侧挂等宽代号;35 天前的位置以同色虚线幽灵径迹显示(45% 不透明)。悬停或点按某条径迹,其余径迹降到 18%,封面读数列表同步降到 35%,命中区宽 48 单位便于手指点选。徽记版只保留环与粗径迹。

动效:数据到齐后，刻度与探测环先建立坐标，径迹从 120ms 起、每条间隔 105ms 绘制，约一秒内完成。固定拓扑的三次贝塞尔路径通过阻尼弹簧更新控制点，节点始终与曲线终点共享坐标。选中时命中外圈连续扩展为直角读数面板，收起时返回原圆。按下时节点与外圈轻微压缩，释放后回弹，数据终点保持准确。滚动时唯一的 SVG 在封面和页头的占位之间连续移动，不替换实例；描边根据当前尺寸补偿。反向滚动、改选节点和尺寸变化承接当前位置与速度，标签对齐和面板落点连续过渡。触屏纵向滑动取消点选并交给页面。区间下划线、时间轴和设置展开共用同一套弹簧。减少动态效果时立即展示终态，关闭绘制编排及空间滚动。实现与验证入口见 [Motion system](docs/motion-system.md)。

### 研究控制台
每个实验是一条记录:配置条在上,图表在下,结论写在导语里。
- **配置条:** 暗铜 1px 顶线,左起 12px 等宽铜色 RUN 编号,接着是字段(构造方式、段长、世界数、随机种子、成交、每次切换成本),右端是运行按钮与"已完成 / 总数 个世界"状态读数(11px 等宽中墨,读屏播报)。运行时顶线上叠一条 1px 铜线,按已完成世界的占比从左向右填满(200ms ease-out),结束后收回。<768px 字段默认收起,只剩一行 11px 等宽摘要(构造方式 · 段长 · 世界数),点按展开。段长选 1 天时下方补一句淡墨说明。归档小节用静态版:同一条暗铜顶线,11px 等宽中墨条目,RUN 编号为铜。
- **平行世界扇面:** canvas,高 300px(≥768px 为 340px),纵轴是对数净值,网格白色 7.5%,轴标 10px 等宽中墨。底层每个世界一条 1px 灰色径迹(#ababab),透明度随预期世界数缩放为 3.2 / √N,夹在 0.035–0.24 之间,所以 100 个和 2000 个世界的扇面亮度相近,流入过程中也不跳。世界全部到齐后画上层:5% 与 95% 分位为中墨 1px、55% 透明;中位为墨色虚线;$1 起点为铜色虚线;最后用规则槽位色画出真实历史,900ms 四次方缓出,带真空色底线。右侧边距标"中位""真实"两条读数,间距不足 14px 时自动错开。十字线只有一条 field 1px 竖线;悬停读数框写日期、真实值、中位与 5%–95%。减少动态效果时真实历史直接画完。
- **分布条:** 每条规则一行,高 34px:左 200px 规则名(槽位色条加 12px 墨字),中间 canvas,右 150px 读数(中位、真实、分位,11px 等宽)。canvas 里有一条 edge 1px 中线;每个世界一根 1px × 14px 灰色刻度,透明度 6 / √N,夹在 0.06–0.5;5–95% 是墨色 1px 线,25–75% 是墨色 4px 粗段,中位是墨色 2px × 18px 竖线;真实历史是规则色菱形,外圈 2px 真空色描边。悬停某行时其他行降到 35%。回撤轴固定为 −100% 到 0。归档小节的 DOM 版用同一套记号。
- **配对胜率矩阵:** 行规则胜过列规则的世界占比。每格是一个 12px 等宽百分比,下面一条最宽 96px、高 3px 的 edge 底槽,中点一根 field 竖线标 50%。条从中线伸出:≥50% 向右、墨色,<50% 向左、淡墨;数字同步为墨或中墨。方向只靠左右位置和明度,不用涨跌色,也不用铜。行列表头带槽位色条,对角线为"—"。
- **读数列:** 扇面旁三项(平行世界回撤中位、年化中位、回撤深于 −70% 的世界),每项一条 edge 顶线,11px 淡墨标签、Readout 档数值、11px 淡墨注释,数值随世界流入逐位滚动。归档小节的统计数字用同一结构。
- **术语浮层(toggletip):** 正文里的术语(平行世界、PBO、DSR、分位等)是行内按钮,field 色点状下划线,偏移 5px,悬停变铜。鼠标悬停 160ms 打开、离开 120ms 关闭,点按切换;Escape、点别处、滚动或改窗口尺寸都会收起。浮层宽 300px(窄屏为视口宽减 32px),贴在术语下方 8px,内容是 12px / 500 墨色术语名和 13px 中墨解释。
- **归档标记:** 结果只来自 Python 归档、浏览器不复跑的小节(RUN 01–03),在配置条末尾加一条淡墨"Python 归档结果 · 浏览器不复跑"。能复跑的小节不加它,改在图表旁放复跑按钮;浏览器跑完后图注写"浏览器复算 N 个世界 · 耗时",口径相同时下方再用淡墨给出 Python 归档的对照数。
- **状态:** 载入归档、未运行、运行出错都用暗铜虚线框加中墨说明,与仪表盘缺数状态一致。改了配置还没运行时,结果区降到 45%,上方写明这仍是上一次运行的结果。
- **表格与明细:** 12px,表头 11px 淡墨,行间 edge 底线,数字列右对齐等宽。可点选的行选中为 void-raised,悬停为 60% 的 void-raised。折叠明细是 edge 顶线下的 12px 中墨标题,右侧加号展开时转 45°。

## Do's and Don'ts

### Do:
- **Do** 让所有中性色保持零彩度(void 到 ink 七档),新增灰阶也必须 R=G=B。
- **Do** 把铜色限制在 1–1.5px 的硬件线、焦点、光标和编辑态提示上。
- **Do** 按槽位顺序分配 series 色,并在一张卡超过 6 条序列时在 UI 层拒绝。
- **Do** 单序列指标线用 line-single,网格、十字线(#5e5e5e,标签底 #262626)和水印保持中性。
- **Do** 所有会变的数字用等宽 tabular-nums。
- **Do** 改动封面上半部后,在 390×844 上确认"进入图表"仍在首屏内。
- **Do** 研究控制台里让真实历史用规则自己的槽位色、平行世界用零彩度灰,同一条规则在芯片、扇面、分布条、矩阵和图例里同色。
- **Do** 十字线和悬停读数框保持中性(field 线、void-raised 框);铜只给焦点、选中、仪器线和 RUN 编号。
- **Do** 新增得意黑标题文字后重跑 scripts/subset-display-font.py(上游 Smiley Sans v2.0.1,保留 OFL 版权、许可与改名记录)。

### Don't:
- **Don't** 让暖色回到画布或文字上;之前的暖棕中性色像老照片的棕褐滤镜。
- **Don't** 用铜色做实心填充:主按钮悬停用 ink-muted,::selection 用 copper-dim 底配 ink 字。
- **Don't** 循环复用分类色,也不要让琥珀以发丝线出现在铜件旁边。
- **Don't** 使用柔化炭灰底(#141414 / #e1e1e1)或浅色纸面(#f7f7f7 / #1f1f1f),两者都已被否决。
- **Don't** 做成"深灰 + 亮蓝"的行情终端或 TradingView 仿品外观。
- **Don't** 加阴影、发光、圆角或卡片外框。
- **Don't** 在 <768px 开放布局编辑。
- **Don't** 用涨跌色或铜表达胜负方向;配对胜率矩阵只靠位置和明度。
- **Don't** 把十字线、悬停读数或分布区间画成铜色或规则色。
- **Don't** 用得意黑排图表、表格上方的说明标题;它们用 13px / 500 正文黑体。
