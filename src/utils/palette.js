/**
 * 展示层分类样式：配色 + 白色 SVG 图标。
 *
 * 键 = 分类的 `icon` 字段，里面存的是 v2.0 参考包的分类 key（如 breakfast / redbag）。
 * ⚠️ **不能用分类名当键**：支出与收入里都有「红包」「其他」，按名字会撞车。
 * 老数据（icon 存的是 emoji）取不到键，自动退回 emoji + 按 id 轮换兜底色。
 *
 * 纯展示层：不参与业务、不写入数据库。
 * 渲染方式：彩色圆底 + CSS mask 白色图标（见 utils/svg-icon.js）。
 */
import { svgMaskStyle } from './svg-icon.js'

/** 分类 key → 圆底配色（严格照参考包，勿改） */
export const CATEGORY_COLORS = {
  breakfast: '#ff8a65', // 早餐（支出）
  lunch: '#ff7043', // 午餐（支出）
  snack: '#ffb74d', // 零食（支出）
  milktea: '#f48fb1', // 奶茶（支出）
  bus: '#81c784', // 公交（支出）
  taxi: '#4fc3f7', // 打车（支出）
  shop: '#ffc93c', // 购物（支出）
  home: '#ba68c8', // 住房（支出）
  fun: '#7986cb', // 娱乐（支出）
  med: '#4dd0e1', // 医疗（支出）
  gift: '#ef5350', // 红包（支出）
  salary: '#aed581', // 工资（收入）
  bonus: '#ffd54f', // 奖金（收入）
  part: '#4db6ac', // 兼职（收入）
  invest: '#7986cb', // 理财（收入）
  redbag: '#ef5350', // 红包（收入）
  reimb: '#64b5f6', // 报销（收入）
  sell: '#ce93d8', // 二手（收入）
  more: '#a1887f', // 其他（支出 / 收入共用）
  // ↓ 两级分类新增：只给「一级分类」用，二级子类复用上面既有 key
  food: '#ffa726', // 餐饮（一级）
  traffic: '#42a5f5', // 交通（一级）
  edu: '#7e57c2', // 教育（一级）
  comm: '#26c6da', // 通讯（一级）
  social: '#ec407a', // 人情（一级）
  pet: '#ffca28', // 宠物（一级）
  travel: '#66bb6a' // 旅行（一级）
}

/** 分类 key → 白色图标 path（24×24 viewBox，Material Icons 风格） */
export const CATEGORY_ICONS = {
  breakfast:
    'M20 3H4v10c0 2.21 1.79 4 4 4h6c2.21 0 4-1.79 4-4v-3h2c1.11 0 2-.89 2-2V5c0-1.11-.89-2-2-2zm0 5h-2V5h2v3zM4 19h16v2H4v-2z',
  lunch:
    'M11 9H9V2H7v7H5V2H3v7c0 2.12 1.66 3.84 3.75 3.97V22h2.5v-9.03C11.34 12.84 13 11.12 13 9V2h-2v7zm5-3v8h2.5v8H21V2c-2.76 0-5 2.02-5 4z',
  snack:
    'M12 6c1.11 0 2-.9 2-2 0-.38-.1-.73-.29-1.03L12 0l-1.71 2.97c-.19.3-.29.65-.29 1.03 0 1.1.89 2 2 2zm6 3H6c-1.66 0-3 1.34-3 3v7h18v-7c0-1.66-1.34-3-3-3zm-5 7c-.83 0-1.5-.67-1.5-1.5S11.17 13 12 13s1.5.67 1.5 1.5S12.83 16 12 16z',
  milktea:
    'M5 5h14l-1.2 14.2a2 2 0 01-2 1.8H8.2a2 2 0 01-2-1.8L5 5zm2.3 2l1 11h7.4l1-11H7.3zM13.5 1l-.8 3h-1.4l.8-3h1.4z',
  bus:
    'M4 16c0 .88.39 1.67 1 2.22V20c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h8v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1.78c.61-.55 1-1.34 1-2.22V6c0-3.5-3.58-4-9-4s-9 .5-9 4v10zm3-8c.83 0 1.5.67 1.5 1.5S7.83 11 7 11s-1.5-.67-1.5-1.5S6.17 8 7 8zm10 0c.83 0 1.5.67 1.5 1.5S17.83 11 17 11s-1.5-.67-1.5-1.5S16.17 8 17 8zM5 14v-2.5h14V14H5z',
  taxi:
    'M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z',
  shop:
    'M18 6h-2c0-2.21-1.79-4-4-4S8 3.79 8 6H6c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-6-2c1.1 0 2 .9 2 2h-4c0-1.1.9-2 2-2zm6 16H6V8h2v2h2V8h4v2h2V8h2v12z',
  home:
    'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8h5z',
  fun:
    'M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H3c-1.1 0-1.99.9-1.99 2L1 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-3zm0 12H5V8h13v8z',
  med:
    'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14h-2v-4H8v-2h2V7h2v4h2v2h-2v4z',
  gift:
    'M20 6h-2.18c.11-.31.18-.65.18-1 0-1.66-1.34-3-3-3-1.05 0-1.96.54-2.5 1.35l-.5.67-.5-.68C10.96 2.54 10.05 2 9 2 7.34 2 6 3.34 6 5c0 .35.07.69.18 1H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-5-2c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zM9 4c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm11 15H4v-2h16v2zm0-5H4V8h5.08L7 10.83 8.62 12 11 8.76l1-1.36 1 1.36L15.38 12 17 10.83 14.92 8H20v6z',
  more:
    'M6 10c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm12 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm-6 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z',
  salary:
    'M12 1v9.5C12 12.43 10.43 14 8.5 14S5 12.43 5 11.5V1H3v10.5C3 14.45 5.55 17 8.5 17s5.5-2.55 5.5-5.5V1h-2zM21 8h-7v2h5v7h-5v2h7V8z',
  bonus:
    'M19 3h-4.18C14.4 1.84 13.3 1 12 1c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm2 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z',
  part:
    'M20 6h-4V4c0-1.11-.89-2-2-2h-4c-1.11 0-2 .89-2 2v2H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-6 0h-4V4h4v2z',
  invest:
    'M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1H6.32c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z',
  redbag:
    'M20 6h-2.18c.11-.31.18-.65.18-1 0-1.66-1.34-3-3-3-1.05 0-1.96.54-2.5 1.35l-.5.67-.5-.68C10.96 2.54 10.05 2 9 2 7.34 2 6 3.34 6 5c0 .35.07.69.18 1H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2z',
  reimb:
    'M19 5v14H5V5h14m0-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 14H7v-2h10v2zm0-4H7v-2h10v2zm0-4H7V7h10v2z',
  sell:
    'M20 4H4v2h16V4zm1 10v-2l-1-5H4l-1 5v2h1v6h10v-6h4v6h2v-6h1zm-9 4H6v-4h6v4z',
  // ↓ 两级分类新增（一级分类专用图标）。二级子类复用上面的既有 key，不新增。
  food:
    'M12 3C7.03 3 3 7.03 3 12h18c0-4.97-4.03-9-9-9zm0 2c3.5 0 6.42 2.57 6.93 5H5.07C5.58 7.57 8.5 5 12 5zM5 15h14v2H5v-2zm2 4h10v2H7v-2z',
  traffic:
    'M20 10h-3V8.86c1.72-.45 3-2 3-3.86h-3V4c0-.55-.45-1-1-1H8c-.55 0-1 .45-1 1v1H4c0 1.86 1.28 3.41 3 3.86V10H4c0 1.86 1.28 3.41 3 3.86V15H4c0 1.86 1.28 3.41 3 3.86V20c0 .55.45 1 1 1h8c.55 0 1-.45 1-1v-1.14c1.72-.45 3-2 3-3.86h-3v-1.14c1.72-.45 3-2 3-3.86zm-8 9c-1.11 0-2-.89-2-2s.89-2 2-2 2 .89 2 2-.89 2-2 2zm0-5c-1.11 0-2-.89-2-2s.89-2 2-2 2 .89 2 2-.89 2-2 2zm0-5c-1.11 0-2-.89-2-2s.89-2 2-2 2 .89 2 2-.89 2-2 2z',
  edu:
    'M5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82zM12 3L1 9l11 6 9-4.91V17h2V9L12 3z',
  comm:
    'M16 1H8C6.34 1 5 2.34 5 4v16c0 1.66 1.34 3 3 3h8c1.66 0 3-1.34 3-3V4c0-1.66-1.34-3-3-3zm-2 20h-4v-1h4v1zm3.25-3H6.75V4h10.5v14z',
  social:
    'M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z',
  pet:
    'M4.5 9.5c1.38 0 2.5-1.12 2.5-2.5S5.88 4.5 4.5 4.5 2 5.62 2 7s1.12 2.5 2.5 2.5zm15 0c1.38 0 2.5-1.12 2.5-2.5S20.88 4.5 19.5 4.5 17 5.62 17 7s1.12 2.5 2.5 2.5zM12 2c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3zM7.5 9C6.12 9 5 10.12 5 11.5S6.12 14 7.5 14 10 12.88 10 11.5 8.88 9 7.5 9zm9 0c-1.38 0-2.5 1.12-2.5 2.5S15.12 14 16.5 14 19 12.88 19 11.5 17.88 9 16.5 9zm-4.5 6c-2.33 0-7 1.17-7 3.5V21h14v-2.5c0-2.33-4.67-3.5-7-3.5z',
  travel:
    'M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z'
}

/**
 * 图标语义分组（T3.4）：新建/换图标时按分类类型过滤，
 * 避免给"支出"分类选到「工资」，或给"收入"分类选到「奶茶」这种明显不搭的图标。
 *
 * - `common`：两类共用（「其他」）。
 * - 这里必须与 CATEGORY_ICONS 保持一一覆盖，否则会有点不出来的图标（有测试守着）。
 *
 * v7 起新增了 7 个**一级分类专用**图标（food/traffic/edu/comm/social/pet/travel），
 * 全部归入 `expense` —— 二级子类不新增 key，直接复用既有图标。
 * ⚠️ 收入分类目前仍是**一级平铺**（没有 parent_id），所以 income 组保持不变。
 */
export const CATEGORY_ICON_GROUPS = {
  common: ['more'],
  expense: [
    'breakfast',
    'lunch',
    'snack',
    'milktea',
    'bus',
    'taxi',
    'shop',
    'home',
    'fun',
    'med',
    'gift',
    'food',
    'traffic',
    'edu',
    'comm',
    'social',
    'pet',
    'travel'
  ],
  income: ['salary', 'bonus', 'part', 'invest', 'redbag', 'reimb', 'sell']
}

/** 兜底轮换色：未知分类 / 老数据按 id 取色时用 */
export const CATEGORY_TINTS = [
  '#ff8a65',
  '#ff7043',
  '#ffb74d',
  '#f48fb1',
  '#81c784',
  '#4fc3f7',
  '#ffc93c',
  '#ba68c8'
]

/** 取分类的 key（存在 icon 字段里；老数据是 emoji，取不到返回空串） */
function keyOf(category) {
  const c = category || {}
  const k = typeof c.icon === 'string' ? c.icon.trim() : ''
  return Object.prototype.hasOwnProperty.call(CATEGORY_COLORS, k) ? k : ''
}

/**
 * 取分类圆底配色：优先用 key 对应的严格色，否则按 id 兜底轮换
 * （兜底直接复用 tintOf，保证全工程只有一套取模规则）。
 */
export function colorOf(category) {
  const key = keyOf(category)
  if (key) return CATEGORY_COLORS[key]
  return tintOf(category && category.id)
}

/**
 * 标签颜色（T5.1）。
 *
 * 与分类不同：标签的 `color` 字段存的是**色 key**（`c1`..`c8`），不是 category 那样的 icon key ——
 * 这样换配色只改这里的映射表，历史数据不用迁移。
 * 认不出（老数据 / 空串 / 脏值）就按 tag.id 取一个稳定色，保证永远有颜色可用。
 */
export function tagColorOf(tag) {
  const t = tag || {}
  const m = /^c([1-8])$/.exec(String(t.color || ''))
  if (m) return CATEGORY_TINTS[Number(m[1]) - 1]
  return tintOf(t.id)
}

/**
 * 取白色图标的 mask 样式；该分类没有 SVG 图标时返回 null（调用方退回 emoji）。
 */
export function iconMaskStyle(category) {
  const key = keyOf(category)
  if (!key || !CATEGORY_ICONS[key]) return null
  return svgMaskStyle(CATEGORY_ICONS[key])
}

/** 按 id 取兜底底色（保留给老数据与既有测试） */
export function tintOf(id) {
  if (id === null || id === undefined || id === '') return CATEGORY_TINTS[0]
  const n = Number(id)
  if (!Number.isFinite(n)) return CATEGORY_TINTS[0]
  const i = Math.abs(Math.trunc(n) - 1) % CATEGORY_TINTS.length
  return CATEGORY_TINTS[i]
}

/** #rgb / #rrggbb / #rrggbbaa→ [r,g,b] 0~255；认不出来的返回 null */
function parseRgb(hex) {
  if (typeof hex !== 'string') return null
  const s = hex.trim().replace(/^#/, '')
  if (s.length === 3 || s.length === 4) {
    if (!/^[0-9a-fA-F]+$/.test(s)) return null
    const r = parseInt(s[0] + s[0], 16)
    const g = parseInt(s[1] + s[1], 16)
    const b = parseInt(s[2] + s[2], 16)
    return [r, g, b]
  }
  if (s.length === 6 || s.length === 8) {
    if (!/^[0-9a-fA-F]+$/.test(s)) return null
    return [
      parseInt(s.slice(0, 2), 16),
      parseInt(s.slice(2, 4), 16),
      parseInt(s.slice(4, 6), 16)
    ]
  }
  return null
}

/** 亮底上用的深墨（对 --cd-ink 的色相保持一致，对比度约 8:1） */
export const INK_ON_LIGHT = '#4A3A0A'

/** 环带上的字该用多深（0~1）。WCAG 相对亮度公式 */
export function luminanceOf(hex) {
  const rgb = parseRgb(hex)
  if (!rgb) return 0
  const lin = rgb.map(function (v) {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]
}

/**
 * 给定底色，返回压在上面该用深字还是白字（纯函数，可单测）。
 *
 * 为什么需要：分类色深浅跨度很大 —— #ffca28（宠物）亮到白字读不出来，
 * #42a5f5（交通）深到黑字看不见。统计页圆环把这些色当扇区填充，
 * 环上要打百分比，字色必须逐扇区决定。
 *
 * @param {string} hex 底色
 * @returns {string} '#ffffff' 或深墨色
 */
export function readableInk(hex) {
  return luminanceOf(hex) > 0.42 ? INK_ON_LIGHT : '#ffffff'
}
