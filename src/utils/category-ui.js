/**
 * 两级分类的**选择态推导**（纯函数，可单测）。
 *
 * 组件只负责画、页面只负责存，两者的共同计算放在这里 ——
 * 与 `db/tx-search-sql.js`、`mascot-deco/spec.js` 同一套路：
 * 样式/交互背后的计算落成 `.js` 才有测试价值（vitest 跑不了 `.vue` 的 scoped 脚本）。
 *
 * 输入 `tree` 一律是 `services/category.js: buildTree()` 的产物：`[{ cat, children }]`。
 */

function normalizeTree(tree) {
  return (Array.isArray(tree) ? tree : []).filter(function (n) { return n && n.cat })
}

/**
 * 找出某个分类 id 所属的**一级节点**。
 * - id 本身是一级 → 返回它自己那个节点
 * - id 是它下面的二级 → 返回该一级节点
 * - 找不到 / id 非法（null、NaN、'') → null
 */
export function topNodeOf(tree, id) {
  if (id == null || id === '') return null
  const n = Number(id)
  if (!Number.isFinite(n)) return null
  const list = normalizeTree(tree)
  for (const node of list) {
    if (Number(node.cat.id) === n) return node
    const hit = (node.children || []).some(function (c) { return Number(c.id) === n })
    if (hit) return node
  }
  return null
}

/**
 * 当前选中项的选择态 —— 组件照着它渲染即可，不必自己再找一遍。
 *
 * @returns {{
 *   top: object|null,        // 所属一级分类
 *   topId: number|null,      // 所属一级 id
 *   children: object[],      // 该一级下的二级（可能为空）
 *   isTopSelected: boolean,  // 选中的是不是一级本身
 *   selected: number|null    // 归一后的选中 id
 * }}
 */
export function selectionOf(tree, id) {
  const node = topNodeOf(tree, id)
  if (!node) {
    return { top: null, topId: null, children: [], isTopSelected: false, selected: null }
  }
  const n = Number(id)
  const topId = Number(node.cat.id)
  return {
    top: node.cat,
    topId: topId,
    children: node.children || [],
    isTopSelected: n === topId,
    selected: n
  }
}

/**
 * 点一个一级时该选中谁 —— 决定"宫格点一级"的手感。
 *
 * 规则：**已经是当前一级时不改变选择**（用户可能刚选好「早餐」，
 * 手滑又点了一下「餐饮」，这时把他退回一级会很恼火）；换一个一级才落到那个一级本身。
 *
 * @returns {number|null} 下一个 modelValue；返回 null 表示"保持不变"
 */
export function nextOnPickTop(sel, topId) {
  // ⚠️ 必须先挡 null/''：Number(null) === 0 且是有限数，只判 isFinite 会把空点击
  // 当成"选了 id=0 的分类"放过去
  if (topId == null || topId === '') return null
  const n = Number(topId)
  if (!Number.isFinite(n)) return null
  if (sel && sel.topId === n) return null
  return n
}
