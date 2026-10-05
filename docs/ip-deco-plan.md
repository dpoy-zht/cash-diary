# 奶龙 IP 元素布置方案

> 基线：`demo/nailong-ledger.html`（v2.0 扩充版）为唯一设计基准。
> 本方案**不新增任何素材文件**，全部复用包内已有的 9 张 `src/static/milo/*.webp`，
> 因此**包体积增加 0 B**。

## 一、为什么要统一走组件

散着写 `<image>` 有三个必然踩的坑：

1. 有人给装饰写 `position: static` → 挤走正文，版面变形
2. 有人忘了 `pointer-events: none` → 奶龙盖在按钮上，点不到
3. 尺寸随手写 → 一个 160px 的奶龙压住标题

所以新增 `src/components/mascot-deco/`，把"尺寸档 / 透明度 / 裁切方式"收进纯函数
`spec.js`（有单测），页面只声明 `mood` + `tier`。项目里已有同构先例：
`db/tx-search-sql.js` 也是把 SQL 拼装抽成纯函数，好让"转义无注入"可被测试断言。

## 二、视觉语言基准（沿用现有 12 处，不新造样式）

| 维度 | 取值 |
|---|---|
| 配色 | 奶油底 `#FFF8E7`、蛋黄 `#FFD93D`、纯白卡面 |
| 圆角 | 卡 24px、小卡 14px；圆形裁切用 `border-radius: 999px` + `aspectFill` |
| 阴影 | 只用现成的 `--cd-sh-card` / `--cd-sh-pop`，装饰件一律不加阴影 |
| 留白硬约束 | 装饰件 `position: absolute` + `pointer-events: none`，**永不占布局流** |

## 三、三档尺寸

| 档 | 边长 | 默认透明度 | 用途 |
|---|---|---|---|
| `inline` | 44px | 1.0 | 横幅、结论行、卡片内行内点缀 |
| `corner` | 44px | 0.5 | 导航条/头部右上角，**天生半透明** |
| `hero` | 96px | 1.0 | 空状态、加载态的主插画 |

需要"占位"（如空状态居中）时，父级把它写成 flex 子项并改 `position: relative`，
让它参与排版而不是压在上面。

## 四、逐位置清单

### 4.1 新增 · 空状态主插画（3 处）

| 页面 | 位置 | mood | 规格 | 理由 |
|---|---|---|---|---|
| `category` | 空列表卡内居中 | `gold` | hero 96px | "还没分类"是中性状态，端金条比无辜脸更有生气 |
| `tag` | 空列表卡内居中 | `innocent` | hero 96px | "还没标签"同理，用无辜脸引导创建 |
| `health` | 扫描中加载态居中 | `innocent` | hero 96px | 加载也有情绪，不再是干巴巴一行字 |

布局：`position: relative` + `margin: 4px auto 10px` 水平居中，文案位置不跳动。

### 4.2 新增 · 状态联动插画（3 处）

这三处的表情**跟着数据变**，不是静态贴图：

| 页面 | 位置 | 判据 | mood |
|---|---|---|---|
| `budget` | 总预算卡右上 56px | 未设预算 / `level=warn|over` / 其余 | `innocent` / `sad` / `milo` |
| `report` | 概览卡右上 58px | 本月 0 笔 / 环比 down / flat / up | `innocent` / `caishen` / `milo` / `sad` |
| `health` | 结论卡右上 52px | `healthy` / 其他 | `gold` / `sad` |

**判据一律复用已有的计算属性**（`totalStatus.level`、`report.mom.expense.dir`、
`scan.healthy`），不另立标准 —— 否则插画表情和下方文案会出现口径不一致的尴尬。

### 4.3 新增 · 边角装饰（11 处）

| 页面 | 位置 | mood |
|---|---|---|
| `home` | navbar 右上 | `milo` |
| `add` | navbar 右上 | `happy` |
| `stats` | navbar 右上 | `milo` |
| `ledger` | navbar 右上 | `caishen` |
| `report` | navbar 右上 | `gold` |
| `health` | navbar 右上 | `innocent` |
| `budget` | navbar 右上 | `sad` |
| `category` | navbar 右上 | `waving` |
| `tag` | navbar 右上 | `waving` |
| `fixed` | navbar 右上 | `rich` |
| `me` | profile-head 右上 | `gold`（`opacity: .55`） |

`me` 页没有 navbar（用的是渐变头部），所以挂在 `profile-head`，与左侧 88px 挥手奶龙呼应。

**为什么绝对定位后布局完全不变**：navbar 是 `flex + space-between`，装饰件绝对定位即退出
flex 流，右侧按钮组的排布分毫不动。再加 `pointer-events: none`，压到按钮上也不抢点击。

### 4.4 复用现有（未改动）

`home` 余额卡 72×90、工资横幅、空态、超支弹窗；`stats` 环形图中心；`me` 头部 88×88、
攒钱目标卡、问候横幅；`ledger` 财神卡；`add` 记账成功弹窗。

## 五、适配与可读性保障

| 风险 | 处理 |
|---|---|
| 遮挡文字 | 装饰件全部 `z-index: 0` + 绝对定位；容器加 `overflow: hidden` 防溢出圆角 |
| 影响点击 | 组件根节点写死 `pointer-events: none` |
| 小屏挤占 | 边角档固定 44px 半透明，不随屏幕放大；hero 档 96px 有 22px+ padding 兜底 |
| 挖空内容 | 圆角卡（`total-card`/`hero`/`summary`）加 `position: relative; overflow: hidden` |

## 六、图片规格建议（若将来要补新素材）

现有 9 张 webp 共 90 KB，单张 6–17 KB，已足够。补新素材时按同一套：

| 用途 | 长边 | 格式 | 体积 |
|---|---|---|---|
| 主插画 / 空状态 | 420px | WebP q82 | ≤ 25 KB |
| 行内 / 边角 | 240px | WebP q82 | ≤ 10 KB |

**白底图必须抠透明**：`milo.webp` / `milo-waving.webp` 已抠（外圈纯白 100% / 92.4%），
其余 7 张自带场景底、按圆形裁切使用。参考 `demo/assets/milo/README.md` 记录的
泛洪抠图算法（只从四边泛洪，角色内部白色高光不会被误伤）。

## 七、版权提醒

⚠️ 现有 9 张素材的 `demo/assets/milo/README.md` 与 `demo/assets/nailong/README.md`
**都明确标注版权归第七印象文化传媒**，仅限个人自用。
**上架前必须替换为自有或已授权素材。** 本方案不改变这一结论。

## 八、改动文件清单

| 文件 | 改动 |
|---|---|
| `src/components/mascot-deco/spec.js` | 新增 · 纯函数规格计算（有单测） |
| `src/components/mascot-deco/mascot-deco.vue` | 新增 · 装饰组件 |
| `src/pages/{home,add,stats,ledger,report,health,budget,category,tag,fixed}.vue` | 各加 navbar 边角装饰 |
| `src/pages/me/me.vue` | 加 profile-head 边角装饰 |
| `src/pages/{budget,report,health,category,tag}.vue` | 加状态联动/空状态插画 |
| `dist/dev/apply-nav-deco.py` | 新增 · 批量插入脚本（幂等，可重跑） |
| `tests/mascot-deco.test.js` | 新增 · 14 个断言 |
| `tests/mascot-assets.test.js` | 新增 · 4 个断言（素材契约） |
