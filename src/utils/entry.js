/**
 * 记账表单（add 页）的状态纯函数。
 * 逻辑集中在这里而不是散在页面里，一是可单测，二是把"保留什么、清空什么"写成明确契约，
 * 避免以后有人"顺手"把日期也重置了，破坏连续记账的预期。
 */

import { toDateStr } from './date.js'

/**
 * 保存成功后的表单收敛（用于连续记账 / 离开页面前收尾）。
 *
 * 契约：
 * - 保留 `type` / `categoryId` / `dateStr`：连续补记同一天的多笔账是高频场景，每笔都要重选分类很烦；
 * - 清空 `amount` / `note`：金额与备注是"这一笔"的属性，跨笔复用会直接写错账。
 *
 * @param {{ type?: string, categoryId?: *, dateStr?: string }} form 当前表单快照
 * @returns {{ type: string, categoryId: *, dateStr: string, amount: string, note: string }}
 */
export function formAfterSaved(form) {
  const f = form || {}
  return {
    type: f.type,
    // 显式区分"传了 null"和"没传"：没传时兜底 null，传了 0 之类的合法值要原样保留
    categoryId: f.categoryId === undefined ? null : f.categoryId,
    dateStr: f.dateStr,
    amount: '',
    note: ''
  }
}

/**
 * 把日期钳制到"今天"以内（T3.3）。
 *
 * 记账语义是"记录已经发生的收支"：未来日期既不会进当月预算，又会污染趋势图与统计口径，
 * 所以入口处一律拦掉。picker 的 end 属性各端支持度不完全一致，这里再兜一层。
 *
 * @param {string} dateStr 'YYYY-MM-DD'
 * @param {string} [today] 比较基准，缺省取本机今天
 * @returns {string} 不超过 today 的日期字符串
 */
export function clampFutureDate(dateStr, today) {
  const limit = today || toDateStr(Date.now())
  if (typeof dateStr !== 'string' || !dateStr) return limit
  // 'YYYY-MM-DD' 定长补零，字典序与时间序一致，直接比字符串即可
  return dateStr > limit ? limit : dateStr
}

/**
 * 日期选择器的下界（T3.3）：今天往前 years 年。
 * 不设下界时 picker 的年份列能一路滑到 1970，补记账目时极难滑回来。
 *
 * @param {string} [today] 'YYYY-MM-DD'，缺省取本机今天
 * @param {number} [years] 往前年数，默认 5
 * @returns {string} 'YYYY-MM-DD'
 */
export function minSelectableDate(today, years) {
  const n = Math.abs(Math.floor(Number(years) || 5))
  // 用 12:00 构造，避免时区偏移把日期整体挪一天
  const base = new Date((today || toDateStr(Date.now())) + 'T12:00:00')
  base.setFullYear(base.getFullYear() - n)
  return toDateStr(base.getTime())
}
