/**
 * 展示层配色工具：给分类图标提供稳定的柔和底色。
 *
 * 定位说明：
 * - 这里是**纯视觉**映射，不参与业务、不写入数据库、不影响任何统计。
 * - 取色依据分类 id（而非数组下标），保证同一分类在「记一笔」宫格、
 *   「明细」列表、「编辑弹层」chip 三处颜色完全一致。
 * - 内置分类 id 为 1..12（8 支出 + 4 收入，见 services/category.js），
 *   因此底色表按 8 个一组循环——支出 8 项刚好各不相同。
 *
 * 设计约束见 docs/nailong-ui-spec.md §3.4。
 */

/** 柔和底色表（8 色循环，均为浅色，保证 emoji 图标清晰可辨） */
export const CATEGORY_TINTS = [
  '#fff0be', // 奶黄
  '#e6f6ff', // 天空蓝
  '#ffedf0', // 腮红粉
  '#e8f8f0', // 薄荷绿
  '#fff1e3', // 奶油橙
  '#ede9ff', // 淡紫
  '#e4f5f7', // 淡青
  '#fbeaf2' // 淡玫
]

/**
 * 按分类 id 取稳定底色。
 * id 从 1 开始，故以 (id - 1) 为下标，让第一个分类用到第一个色；
 * 取绝对值是为了让 id 为 0 或负数的异常数据也能得到合法颜色而非 undefined。
 * @param {number|string} id 分类 id（非数字或缺失时回落到第 1 个色）
 * @returns {string} 十六进制底色
 */
export function tintOf(id) {
  // null / undefined / 空串视为"没有 id"，而不是数字 0——它们应当回落到默认色
  if (id === null || id === undefined || id === '') return CATEGORY_TINTS[0]
  const n = Number(id)
  if (!Number.isFinite(n)) return CATEGORY_TINTS[0]
  const i = Math.abs(Math.trunc(n) - 1) % CATEGORY_TINTS.length
  return CATEGORY_TINTS[i]
}
