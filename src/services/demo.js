/**
 * 示例账目 —— **仅供网页版演示使用**（H5 条件编译引入，App 端不会打包这段）。
 *
 * 为什么需要它：
 * 评委/试用者打开网页时库是空的，只能看到空状态，看不到列表分组、统计圆环、
 * 预算进度这些真正的界面效果。一键灌入一批像样的账目，能立刻看清成品长什么样。
 *
 * 为什么走 store API 而不是直接写 localStorage：
 * 直接改存储会绕过金额校验、账本归属、月分桶这些规则，造出来的数据"看起来对、
 * 一操作就露馅"。这里走 `txStore.add`，和用户手点记账**完全同一条链路**，
 * 金额同样是整数分、软删字段同样齐、今日/本月分桶同样正确。
 */

import { buildAddInput } from './tx.js'

/** 演示账目：daysAgo 越小越近，金额/分类/备注都贴近真实记账习惯 */
const PLAN = [
  { daysAgo: 0, h: 8, m: 20, amount: '6.50', cat: '早餐', note: '豆浆油条', type: 'expense' },
  { daysAgo: 0, h: 12, m: 40, amount: '28.00', cat: '午餐', note: '公司楼下面馆', type: 'expense' },
  { daysAgo: 0, h: 15, m: 10, amount: '18.50', cat: '奶茶', note: '下午茶续命', type: 'expense' },
  { daysAgo: 1, h: 9, m: 5, amount: '4.00', cat: '公交', note: '地铁通勤', type: 'expense' },
  { daysAgo: 1, h: 19, m: 30, amount: '89.00', cat: '晚餐', note: '和朋友吃火锅', type: 'expense' },
  { daysAgo: 2, h: 14, m: 0, amount: '199.00', cat: '购物', note: '换季买了件外套', type: 'expense' },
  { daysAgo: 3, h: 21, m: 15, amount: '45.00', cat: '外卖', note: '加班点外卖', type: 'expense' },
  { daysAgo: 4, h: 10, m: 30, amount: '3200.00', cat: '', note: '本月房租', type: 'expense', fallback: '居住' },
  { daysAgo: 5, h: 18, m: 0, amount: '6600.00', cat: '', note: '工资到账', type: 'income' }
]

/**
 * 造一个「本月内」的时间戳。
 * 月初打开时 daysAgo 会退到上个月，而首页只渲染当月 —— 那种情况夹到 1 号，
 * 免得灌了示例数据却看不见。
 */
function tsAt(daysAgo, hour, minute) {
  const now = new Date()
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo, hour, minute, 0, 0)
  if (d.getMonth() !== now.getMonth() || d.getFullYear() !== now.getFullYear()) {
    return new Date(now.getFullYear(), now.getMonth(), 1, hour, minute, 0, 0).getTime()
  }
  return d.getTime()
}

/**
 * 灌入示例账目。
 *
 * @param {{ txStore:object, categoryStore:object, metaStore:object }} stores
 *   Pinia store 实例（在组件里取，不在这里 import —— 避免脱离 app 上下文时
 *   Pinia 还没 install 就报错）
 * @returns {Promise<{added:number, skipped:number}>}
 */
export async function seedDemoData(stores) {
  const txStore = stores.txStore
  const categoryStore = stores.categoryStore
  const metaStore = stores.metaStore

  const all = Array.isArray(categoryStore.list) ? categoryStore.list : []
  const byName = function (name) {
    const hit = all.filter(function (c) { return c && c.name === name })[0]
    return hit ? hit.id : null
  }
  const firstExpenseTop = all.filter(function (c) {
    return c && c.type === 'expense' && !c.parent_id
  })[0]
  const firstIncome = all.filter(function (c) { return c && c.type === 'income' })[0]

  let added = 0
  let skipped = 0

  for (let i = 0; i < PLAN.length; i += 1) {
    const item = PLAN[i]
    let categoryId = item.cat ? byName(item.cat) : null
    if (!categoryId && item.fallback) categoryId = byName(item.fallback)
    if (!categoryId) {
      categoryId = item.type === 'income'
        ? (firstIncome && firstIncome.id)
        : (firstExpenseTop && firstExpenseTop.id)
    }
    if (!categoryId) {
      // 分类表还没就绪（极端情况）—— 跳过而不是写一条分类悬空的坏数据
      skipped += 1
      continue
    }
    await txStore.add(
      metaStore.ym,
      buildAddInput({
        amountText: item.amount,
        categoryId: categoryId,
        type: item.type,
        note: item.note,
        ts: tsAt(item.daysAgo, item.h, item.m)
      }),
      []
    )
    added += 1
  }

  return { added: added, skipped: skipped }
}
