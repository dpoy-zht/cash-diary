/**
 * 记账表单（add 页）的状态纯函数。
 * 逻辑集中在这里而不是散在页面里，一是可单测，二是把"保留什么、清空什么"写成明确契约，
 * 避免以后有人"顺手"把日期也重置了，破坏连续记账的预期。
 */

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
