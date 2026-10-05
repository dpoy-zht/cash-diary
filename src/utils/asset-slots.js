/**
 * 素材插槽登记表 —— 全站所有图片位点的**唯一事实源**。
 *
 * 为什么要有这张表：
 * 用户要求"先预留占位、不嵌真图，且上传后替换不影响排版"。要做到这点，
 * 前提是**占位框与真图共用同一份空间规格** —— 否则占位时看着合适，换上真图就位移。
 * 所以尺寸/比例/裁切/加载方式全部收敛到这里，页面与组件都不许自己写死。
 *
 * 每条记录的字段：
 * - id       插槽名（页面内唯一，替换素材时按它对位）
 * - usage    用途：logo / hero / avatar / icon / deco / empty
 * - where    位置说明（人话描述，便于对照界面）
 * - w/h      渲染尺寸（px）。**这是占位框与真图共同的盒子**，改这里两边同步变
 * - ratio    建议素材长宽比（w/h 化简后的最简比）
 * - size     建议上传素材的像素规格（长边）
 * - crop     裁切方式：fit=完整显示留白 / fill=铺满裁切 / fill-circle=圆形裁切
 * - lazy     是否需要懒加载。**装饰件一律 false**（见下方说明）
 * - file     期望文件名（放 src/static/milo/ 下）
 *
 * ⚠️ 关于 lazy（踩过的坑，别照抄别人的做法）：
 * uni-app 的 `lazy-load` 只对 **长列表里滚动进入视口才加载** 的图片有意义。
 * 本项目的图片位全是「首屏必见」的主视觉/装饰/空态，占位框尺寸固定、
 * 不存在滚动加载收益，**开 lazy 只会导致图片晚一拍出现、真机上有明显闪烁**。
 * 真正的加载优化点是「别让图片撑大包体」，所以 size 一列才是关键。
 * 唯一值得开 lazy 的场景：将来给流水列表加图（比如分类图/头像），那时再单独标 true。
 *
 * 命名不齐是历史事实：基础形象是 `milo.webp`（无连字符前缀），其余是 `milo-<表情>.webp`。
 * 与现有 home/stats 的写死引用一致，别"顺手统一" —— 一改就和已入库文件对不上。
 */

export const USAGE = Object.freeze({
  logo: 'logo',
  hero: '主视觉',
  avatar: '头像',
  icon: '图标',
  deco: '装饰图',
  empty: '空状态插画',
  banner: '横幅插图'
})

/** 用途 → 占位框配色语义（只用项目已有色，不引入新色） */
export const USAGE_TONE = Object.freeze({
  logo: 'primary',
  hero: 'primary',
  avatar: 'primary',
  icon: 'icon',
  deco: 'ghost',
  empty: 'ink3',
  banner: 'blush'
})

/**
 * 素材语义对照（**原图 src/static/milo/ · 9 张**，另有新增一套 src/static/meme/）：
 *
 *   milo.webp          歪头站立   → 基础主视觉，余额卡右上 / 环形图中心
 *   milo-waving.webp   白底招手   → 我的页头部 88px / 问候横幅
 *   milo-happy.webp    开心举爪   → 记账成功弹窗
 *   milo-sad.webp      委屈臭脸   → 超支弹窗
 *   milo-innocent.webp 无辜大眼   → 空状态 / 加载态
 *   milo-jump.webp     戴围巾蹦跳 → 工资到账横幅
 *   milo-caishen.webp  财神红袍   → 账本卡（圆形裁切）
 *   milo-gold.webp     端金条盘子 → 账本页"新建账本"旁
 *   milo-rich.webp     拿算盘暴富 → 我的页攒钱目标卡
 *
 * ⚠️ 本表 `file` 字段存的是**不带分组前缀**的文件名（上面的 `milo-xxx.webp`）。
 *    运行时路径由 `utils/asset-packs.js` 的 `packSrc(file → mood)` 按当前
 *    `ACTIVE_PACK` 补目录与前缀，所以换素材包不用改这张表。
 *
 * ⚠️ 两套素材的底色不同，用错会出现白边或矩形边：
 *    - `milo`（原图）：7 张自带场景底、2 张抠透明 → 适合彩色卡片
 *    - `meme`（新增）：9 张全部抠透明 → 贴任意背景无白边
 *
 * ⚠️ 命名不齐是历史事实：基础形象叫 `milo.webp`（没有连字符前缀），
 *    其余 8 张才是 `milo-<表情>.webp`。这与现有 home/stats 的写死引用一致，
 *    别"顺手统一"——一改就和已入库的 9 个文件对不上，且只有真机看得到空白图。
 */

/**
 * 全部图片插槽。**顺序按页面分组**，便于对着界面从上往下核对。
 * w/h 必须与页面 CSS 里原有的盒子一致 —— 原来是 72×90 就别改成 96×96，
 * 否则占位阶段就会看到位移。
 */
export const SLOTS = Object.freeze([
  // ── home 首页 ──
  {
    id: 'home.balance',
    usage: 'deco',
    where: '余额卡右上角（已存/已花两列的右侧留白区）',
    w: 72, h: 90, ratio: '4:5', size: '420×525',
    crop: 'fit', lazy: false, file: 'milo.webp',
    note: '首页主视觉，抠透明底（外圈纯白必须去掉，否则黄卡上露白方块）'
  },
  {
    id: 'home.salary',
    usage: 'banner',
    where: '工资到账横幅左侧',
    w: 52, h: 52, ratio: '1:1', size: '240×240',
    crop: 'fit', lazy: false, file: 'milo-jump.webp',
    note: '点金币弹出，3.5s 自动消失'
  },
  {
    id: 'home.empty',
    usage: 'empty',
    where: '本月无流水时的空状态卡',
    w: 140, h: 140, ratio: '1:1', size: '420×420',
    crop: 'fit', lazy: false, file: 'milo-innocent.webp',
    note: '自带场景底，保持原样不抠图'
  },
  {
    id: 'home.over',
    usage: 'empty',
    where: '超支弹窗内',
    w: 140, h: 140, ratio: '1:1', size: '420×420',
    crop: 'fit', lazy: false, file: 'milo-sad.webp',
    note: '每账本每月只弹一次'
  },

  // ── stats 统计 ──
  {
    id: 'stats.donut',
    usage: 'hero',
    where: '环形图正中（conic-gradient 内圈）',
    w: 82, h: 82, ratio: '1:1', size: '240×240',
    crop: 'fit', lazy: false, file: 'milo.webp',
    note: '与 home.balance 同一文件，可只备一份；原始 CSS 用 82% 百分比，这里按 82px 等效登记'
  },
  {
    id: 'stats.empty',
    usage: 'empty',
    where: '无数据时的空状态',
    w: 120, h: 120, ratio: '1:1', size: '420×420',
    crop: 'fit', lazy: false, file: 'milo-innocent.webp',
    note: '与 home.empty 同一文件'
  },

  // ── add 记一笔 ──
  {
    id: 'add.success',
    usage: 'empty',
    where: '记账成功弹窗内',
    w: 140, h: 140, ratio: '1:1', size: '420×420',
    crop: 'fit', lazy: false, file: 'milo-happy.webp',
    note: '保存成功后才出现'
  },

  // ── ledger 账本 ──
  {
    id: 'ledger.current',
    usage: 'avatar',
    where: '当前账本卡（圆形头像位）',
    w: 84, h: 84, ratio: '1:1', size: '240×240',
    crop: 'fill-circle', lazy: false, file: 'milo-caishen.webp',
    note: '必须圆形裁切，配 aspectFill，否则被压成椭圆'
  },
  {
    id: 'ledger.create',
    usage: 'icon',
    where: '「新建账本」按钮旁',
    w: 56, h: 56, ratio: '1:1', size: '180×180',
    crop: 'fit', lazy: false, file: 'milo-gold.webp',
    note: ''
  },

  // ── me 我的 ──
  {
    id: 'me.avatar',
    usage: 'avatar',
    where: '个人头部大头像（渐变头部左侧）',
    w: 88, h: 88, ratio: '1:1', size: '420×420',
    crop: 'fit', lazy: false, file: 'milo-waving.webp',
    note: '已抠透明底（外圈白度 92.4%）'
  },
  {
    id: 'me.goal',
    usage: 'hero',
    where: '累计攒钱目标卡左侧',
    w: 72, h: 72, ratio: '1:1', size: '320×320',
    crop: 'fill', lazy: false, file: 'milo-rich.webp',
    note: '圆角裁切（14px），不圆形'
  },
  {
    id: 'me.greet',
    usage: 'banner',
    where: '问候横幅左侧',
    w: 52, h: 52, ratio: '1:1', size: '240×240',
    crop: 'fit', lazy: false, file: 'milo-waving.webp',
    note: '与 me.avatar 同一文件'
  },

  // ── fixed 固定支出 ──
  {
    id: 'fixed.empty',
    usage: 'empty',
    where: '无固定支出时的空状态',
    w: 120, h: 120, ratio: '1:1', size: '420×420',
    crop: 'fit', lazy: false, file: 'milo-innocent.webp',
    note: '与 home.empty 同一文件'
  },

  // ── 空数据占位插画（meme 包，2026-10-05 新增）──
  // 这三处都是**当前完全没有图**的位置，加图不覆盖任何原有元素：
  // 账本空列表、报告 TOP 无数据、我的页空数据区。
  // 用 meme 包是因为它 9 张全抠透明，贴奶油底/白卡无白边与矩形边。
  {
    id: 'meme.ledger.empty', usage: 'empty', where: '账本页「其他账本」空态行',
    w: 96, h: 96, ratio: '1:1', size: '320×320',
    crop: 'fit', lazy: false, file: 'meme-milo.webp', pack: 'meme', mood: 'milo',
    note: '空态行内居中，横向排布（不占过多纵向空间）'
  },
  {
    id: 'meme.report.top', usage: 'empty', where: '月度报告「花得最多的是…」无数据时',
    w: 72, h: 72, ratio: '1:1', size: '320×320',
    crop: 'fit', lazy: false, file: 'meme-milo-sad.webp', pack: 'meme', mood: 'sad',
    note: '只在 topCategories 为空时出现，不影响有数据时的排版'
  },
  {
    id: 'meme.me.empty', usage: 'empty', where: '我的页无数据区块',
    w: 88, h: 88, ratio: '1:1', size: '320×320',
    crop: 'fit', lazy: false, file: 'meme-milo-caishen.webp', pack: 'meme', mood: 'caishen',
    note: '圆形裁切，作为无数据时的头像位替代'
  },

  // ── 边角装饰 ──
  // ⚠️ 原来给 10 页 navbar 右上各放了一个 44×44 装饰，**真机验证后已全部撤掉**：
  //   navbar 没有状态栏留白（padding-top 只有 10px），负偏移直接顶出屏幕外；
  //   改正偏移后又与状态栏图标区、右侧功能按钮重叠，半透明下几乎不可辨。
  //   结论：navbar 右侧不是放 IP 装饰的位置。素材用在能看清的地方 ——
  //   卡片主视觉、空状态插画、圆形头像、结论横幅。
  // 现仅保留 me 页一处（挂在有状态栏留白的渐变头部上，实测可见）。
  {
    id: 'deco.me.head', usage: 'deco', where: '我的页渐变头部右上角',
    w: 44, h: 44, ratio: '1:1', size: '180×180',
    crop: 'fit', lazy: false, file: 'milo-gold.webp', mood: 'gold',
    note: 'decorative，opacity .55'
  },

  // ── 状态联动插画（表情跟数据变）──
  {
    id: 'deco.budget.card', usage: 'deco', where: '总预算卡右上角',
    w: 56, h: 56, ratio: '1:1', size: '240×240',
    crop: 'fit', lazy: false, file: 'milo-sad.webp', mood: 'sad',
    note: '未设预算=innocent / warn|over=sad / 其余=milo（动态切换，沿用原表情语义）'
  },
  {
    id: 'deco.report.hero', usage: 'deco', where: '报告概览卡右上角',
    w: 58, h: 58, ratio: '1:1', size: '240×240',
    crop: 'fit', lazy: false, file: 'milo-caishen.webp', mood: 'caishen',
    note: '0笔=innocent / 环比down=caishen(财神=我省了) / flat=milo / up=sad'
  },
  {
    id: 'deco.health.summary', usage: 'deco', where: '体检结论卡右上角',
    w: 52, h: 52, ratio: '1:1', size: '240×240',
    crop: 'fit', lazy: false, file: 'milo-sad.webp', mood: 'sad',
    note: 'healthy=gold(端金条=有成就感) / 其他=sad'
  },
  {
    id: 'deco.health.ok', usage: 'deco', where: '体检「一切正常」卡左侧',
    w: 44, h: 44, ratio: '1:1', size: '180×180',
    crop: 'fill-circle', lazy: false, file: 'milo-gold.webp', mood: 'gold',
    note: '圆形裁切'
  },

  // ── 空状态主插画（hero 档 96px）──
  {
    id: 'deco.category.empty', usage: 'empty', where: '分类管理空列表',
    w: 96, h: 96, ratio: '1:1', size: '320×320',
    crop: 'fit', lazy: false, file: 'milo-gold.webp', mood: 'gold',
    note: ''
  },
  {
    id: 'deco.tag.empty', usage: 'empty', where: '标签管理空列表',
    w: 96, h: 96, ratio: '1:1', size: '320×320',
    crop: 'fit', lazy: false, file: 'milo-innocent.webp', mood: 'innocent',
    note: ''
  },
  {
    id: 'deco.health.loading', usage: 'empty', where: '体检扫描中加载态',
    w: 96, h: 96, ratio: '1:1', size: '320×320',
    crop: 'fit', lazy: false, file: 'milo-innocent.webp', mood: 'innocent',
    note: '加载态也要有情绪'
  }
])

/** 必配图标（不排版，但缺了发版会被拦） */
export const REQUIRED_ICONS = Object.freeze([
  { id: 'app.icon', usage: 'logo', where: '应用图标（HBuilderX 打包必填）', size: '1024×1024', file: 'app-icon-1024.png' },
  { id: 'splash.logo', usage: 'logo', where: '启动页（manifest.json splashscreen）', size: '1242×2436 或按比例', file: 'splash.png' }
])

const SLOT_INDEX = Object.freeze(
  SLOTS.reduce(function (acc, s) { acc[s.id] = s; return acc }, {})
)

/**
 * 按 id 取插槽。未知 id 抛错而不是静默返回 undefined ——
 * 占位阶段打错字若静默通过，会变成一个没框的空位，比报错更难查。
 */
export function slot(id) {
  const s = SLOT_INDEX[id]
  if (!s) throw new Error('未登记的图片插槽：' + id)
  return s
}

export function hasSlot(id) {
  return Object.prototype.hasOwnProperty.call(SLOT_INDEX, id)
}

/** 去重后的素材文件清单（多插槽可共用同一文件，用户只需备最少的图） */
export function uniqueFiles() {
  const seen = {}
  SLOTS.forEach(function (s) {
    if (!seen[s.file]) seen[s.file] = { file: s.file, usedBy: [] }
    seen[s.file].usedBy.push(s.id)
  })
  return Object.keys(seen).sort().map(function (f) { return seen[f] })
}
