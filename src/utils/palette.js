/**
 * 展示层分类样式：配色 + 白色 SVG 图标，按"分类名"映射。
 *
 * v2.0 参考包要求分类图标"8 色严格一致"，因此配色按分类名取（不是按 id 轮换）。
 * 纯展示层：不参与业务、不写入数据库。
 *
 * 渲染方式（跨端最稳）：彩色圆底 + CSS mask 白色图标（svg-icon.js 的 svgMaskStyle）。
 *   - 老数据里没有 SVG 映射的分类名，退回 emoji（category.icon 字段）
 */
import { svgMaskStyle } from './svg-icon.js'

/** v2.0 严格配色（复现参考包 §二）；收入后 3 色为同族扩展（参考包未定义） */
export const CATEGORY_COLORS = {
  午饭: '#ff8a65',
  购物: '#ffc93c',
  通勤: '#81c784',
  房租: '#ba68c8',
  奶茶: '#f48fb1',
  吃药: '#4dd0e1',
  零食: '#a1887f',
  其他: '#bcaaa4',
  工资: '#aed581',
  兼职: '#9ccc65',
  红包: '#ffcc80',
  其他收入: '#d7ccc8'
}

/** 8 色兜底轮换表（未知/老分类名按 id 取色时用） */
export const CATEGORY_TINTS = [
  '#ff8a65',
  '#ffc93c',
  '#81c784',
  '#ba68c8',
  '#f48fb1',
  '#4dd0e1',
  '#a1887f',
  '#bcaaa4'
]

/** 分类名 → 白色图标 SVG path（24×24 viewBox） */
export const CATEGORY_ICONS = {
  午饭:
    'M11 9H9V2H7v7H5V2H3v7c0 2.12 1.66 3.84 3.75 3.97V22h2.5v-9.03C11.34 12.84 13 11.12 13 9V2h-2v7zm5-3v8h2.5v8h2V2c-2.48 0-4.5 2.02-4.5 4z',
  购物:
    'M18 6h-2c0-2.21-1.79-4-4-4S8 3.79 8 6H6c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-6-2c1.1 0 2 .9 2 2h-4c0-1.1.9-2 2-2zm6 16H6V8h2v2h2V8h4v2h2V8h2v12z',
  通勤:
    'M12 2C8 2 4 2.5 4 6v11c0 1.66 1.34 3 3 3h1c1.66 0 3-1.34 3-3v-1h2v1c0 1.66 1.34 3 3 3h1c1.66 0 3-1.34 3-3V6c0-3.5-4-4-8-4zM6.5 7c.83 0 1.5.67 1.5 1.5S7.33 10 6.5 10 5 9.33 5 8.5 5.67 7 6.5 7zm11 0c.83 0 1.5.67 1.5 1.5S18.33 10 17.5 10 16 9.33 16 8.5 16.67 7 17.5 7zM17 14H7v-2h10v2z',
  房租: 'M12 3L2 12h3v8h6v-6h2v6h6v-8h3L12 3z',
  奶茶:
    'M18 5V3c0-1.1-.9-2-2-2H8c-1.1 0-2 .9-2 2v2c-1.66 0-3 1.34-3 3v9c0 2.21 1.79 4 4 4h8c2.21 0 4-1.79 4-4V8c0-1.66-1.34-3-3-3zM8 3h8v2H8V3zm7 14H9c-.83 0-1.5-.67-1.5-1.5S8.17 14 9 14h6c.83 0 1.5.67 1.5 1.5S15.83 17 15 17z',
  吃药:
    'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z',
  零食:
    'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-5-8c0-1.1.9-2 2-2s2 .9 2 2-.9 2-2 2-2-.9-2-2zm6 4c0-1.1.9-2 2-2s2 .9 2 2-.9 2-2 2-2-.9-2-2z',
  其他: 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z',
  工资:
    'M12 1v9.5C12 12.43 10.43 14 8.5 14S5 12.43 5 11.5V1H3v10.5C3 14.45 5.55 17 8.5 17s5.5-2.55 5.5-5.5V1h-2zM21 8h-7v2h5v7h-5v2h7V8z',
  兼职:
    'M20 6h-4V4c0-1.11-.89-2-2-2h-4c-1.11 0-2 .89-2 2v2H4c-1.11 0-2 .89-2 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-6 0h-4V4h4v2z',
  红包:
    'M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z',
  其他收入:
    'M12 2L2 7v10l10 5 10-5V7L12 2zm0 2.2l6.9 3.45L12 11.1 5.1 7.65 12 4.2zM4 9.3l7 3.5v6.9l-7-3.5V9.3zm9 10.4v-6.9l7-3.5v6.9l-7 3.5z'
}

/**
 * 按分类名取 v2.0 严格色；未知名称按 id 在 8 色里兜底轮换。
 * @param {{name?:string,id?:number}} category 分类对象（或仅有 name/id 的退化对象）
 * @returns {string} 十六进制色
 */
export function colorOf(category) {
  const c = category || {}
  if (c.name && CATEGORY_COLORS[c.name]) return CATEGORY_COLORS[c.name]
  const n = typeof c.id === 'number' ? Math.abs(c.id) : 0
  return CATEGORY_TINTS[n % CATEGORY_TINTS.length]
}

/**
 * 取白色图标的 mask 样式；该分类名没有 SVG 映射时返回 null（调用方退回 emoji）。
 * @param {{name?:string}} category
 * @returns {object|null}
 */
export function iconMaskStyle(category) {
  const d = category && CATEGORY_ICONS[category.name]
  if (!d) return null
  return svgMaskStyle(d)
}

/**
 * 按 id 取稳定底色（保留旧 API 给兜底场景与既有测试）。
 */
export function tintOf(id) {
  if (id === null || id === undefined || id === '') return CATEGORY_TINTS[0]
  const n = Number(id)
  if (!Number.isFinite(n)) return CATEGORY_TINTS[0]
  const i = Math.abs(Math.trunc(n) - 1) % CATEGORY_TINTS.length
  return CATEGORY_TINTS[i]
}
