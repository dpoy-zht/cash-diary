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
 * 色板对齐 sdufe-nailong-checkin 的"马卡龙奶油系"：
 * 鹅黄 / 天蓝 / 樱花粉 / 薄荷 / 蜜桃 / 薰衣草，再加两支同族色补足 8 个，
 * 保证 8 个支出分类两两不同色。设计约束见 docs/nailong-ui-spec.md §12。
 */

/** 柔和底色表（8 色循环，取自参考项目的马卡龙色板） */
export const CATEGORY_TINTS = [
  '#ffe4a0', // 鹅黄（= 参考项目 --cream-yellow）
  '#b8e4f0', // 天蓝（= --sky-blue）
  '#ffd1dc', // 樱花粉（= --sakura-pink）
  '#b8f0d8', // 薄荷（= --mint-green）
  '#ffd4b3', // 蜜桃（= --peach）
  '#e8d5f2', // 薰衣草（= --lavender）
  '#e4f5d8', // 淡草绿（同族补充）
  '#d9e8ff' // 淡蓝紫（同族补充）
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
