# Q10 布局原型(抛弃式)

> **PROTOTYPE** —— 只回答一个问题:FinanceBuddy 的 Dashboard 用哪种布局。
> 拍板后本目录整体移入 throwaway 分支归档,主分支只留结论;勿在此之上做正式实现。

## 运行

```bash
cd prototype/q10-layout
npm install
npm run dev    # http://localhost:5174
```

底部浮动条(或键盘 ←/→)切换三个变体,URL `?layout=a|b|c` 可分享、刷新稳定:

| Key | 变体 | 技术 | 可以试什么 |
|---|---|---|---|
| `?layout=a` | A · 可拖拽网格(**两种默认预设**:`&preset=quad` 四宫格 / `&preset=flow` 自上而下) | react-grid-layout | 顶栏切换预设;两种预设下都可拖卡片标题栏换位、拉右下角/右边缘/下边缘调宽高,其余卡片自动让位 |
| `?layout=b` | B · 自动流式 | 纯 CSS 单列 | 什么都不用管、也什么都动不了 —— 基线 |
| `?layout=c` | C · IDE 式停靠 | dockview | 拖标签页到任意方向分屏;拖进另一组变成标签页;组右上角菜单可浮动/弹出窗口 |

「状态」按钮实时显示当前布局状态(A 显示当前预设 + 网格坐标并标注是否手动调整过 / C 的标签分组),拖动后立刻能看到变化。

## 与正式实现的约定差异

- **数据**:本地确定性 mock(seed 随机 + 市场阶段),不请求 Twelve Data、不消耗 credits;
- **指标**(Ratio ROC 35 / RSI 14 / ROC 35)全部前端计算,口径与已定架构一致(只用原始 OHLCV);
- **图表库**:lightweight-charts 5.2(即正式实现所选库),蜡烛+成交量 pane / 多线 / 参考线;
- **无持久化**:布局调整只在内存里,刷新即回初始态(原型刻意如此,持久化是正式实现的事);
- 每张卡支持 6M/1Y/3Y/5Y/Max 快捷切换、十字线 legend、滚轮缩放、拖拽平移;
- Ratio ROC 三色 `#2962ff/#cc6a10/#ab47bc` 已过 dataviz `validate_palette.js`(dark / surface `#1e222d`)。

## 原型验证工具(可选)

```bash
npm run dev &   # 需先起 dev server
OUT=/tmp/shots node scripts/shot.mjs [chromium可执行文件路径]
```
