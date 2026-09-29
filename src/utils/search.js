/**
 * 搜索筛选条件（T4.3）—— 纯函数，不碰存储。
 *
 * 存在意义：界面上「类型 / 分类 / 金额区间 / 日期区间」的输入五花八门
 * （空串、'0'、负数、输反的区间、重复 id、字符串数字……），
 * **统一在这里收敛成一个规整对象**，让 sqlite 与 memory 两个适配器消费同一份语义 ——
 * 否则两边各写一套判断，迟早跑偏（T2.4 就是被这类分歧咬过一次）。
 *
 * 约定：
 * - 空值一律表示「这一项不参与过滤」，**绝不使用 0 / -1 之类的哨兵值**
 * - 区间写反了自动交换：查不出东西比静默给错结果更糟
 * - 金额单位是**整数分**（与全项目一致）；日期区间是**左闭右开** [startTs, endTs)
 */
import { formatCents } from './money.js'
import { toDateStr } from './date.js'

/** 筛选项的完整形态（空值 = 不参与过滤） */
export function emptyFilters() {
  return { type: '', categoryIds: [], minCents: null, maxCents: null, startTs: null, endTs: null }
}

/** 金额（分）：非负数整数，其余（空/非法/负数）→ null */
export function normCents(v) {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  if (!isFinite(n) || n < 0) return null
  return Math.round(n)
}

/** 时间戳：有限正数，其余 → null */
export function normTs(v) {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  if (!isFinite(n) || n <= 0) return null
  return Math.round(n)
}

/** 分类 id 数组：丢掉非正整数、去重、升序（顺序稳定才好在测试里断言） */
export function normIds(v) {
  if (!Array.isArray(v)) return []
  const seen = {}
  const out = []
  v.forEach(function (x) {
    const n = Math.round(Number(x))
    if (!isFinite(n) || n <= 0 || seen[n]) return
    seen[n] = true
    out.push(n)
  })
  return out.sort(function (a, b) { return a - b })
}

/** 任意输入 → 规整筛选对象（区间反了自动交换） */
export function normalizeFilters(raw) {
  const f = raw && typeof raw === 'object' ? raw : {}
  const type = f.type === 'expense' || f.type === 'income' ? f.type : ''
  let minCents = normCents(f.minCents)
  let maxCents = normCents(f.maxCents)
  if (minCents !== null && maxCents !== null && minCents > maxCents) {
    const t = minCents
    minCents = maxCents
    maxCents = t
  }
  let startTs = normTs(f.startTs)
  let endTs = normTs(f.endTs)
  if (startTs !== null && endTs !== null && startTs > endTs) {
    const t = startTs
    startTs = endTs
    endTs = t
  }
  return { type: type, categoryIds: normIds(f.categoryIds), minCents: minCents, maxCents: maxCents, startTs: startTs, endTs: endTs }
}

/** 是否设置了任何筛选（决定列表是否切到"搜索结果"视图） */
export function hasAnyFilter(raw) {
  const f = normalizeFilters(raw)
  return !!(
    f.type ||
    f.categoryIds.length ||
    f.minCents !== null ||
    f.maxCents !== null ||
    f.startTs !== null ||
    f.endTs !== null
  )
}

/** 生效的筛选维度个数（筛选按钮上的角标） */
export function countFilters(raw) {
  const f = normalizeFilters(raw)
  let n = 0
  if (f.type) n += 1
  if (f.categoryIds.length) n += 1
  if (f.minCents !== null || f.maxCents !== null) n += 1
  if (f.startTs !== null || f.endTs !== null) n += 1
  return n
}

/**
 * 筛选条件的一句话摘要（搜索结果区那行小字）。
 * @param {object} raw 任意筛选输入
 * @param {(id:number)=>string} [catNameOf] 分类 id → 名称；缺省用 #id
 */
export function filterSummary(raw, catNameOf) {
  const f = normalizeFilters(raw)
  const parts = []
  if (f.type) parts.push(f.type === 'expense' ? '支出' : '收入')
  if (f.categoryIds.length) {
    const names = f.categoryIds.map(function (id) {
      const n = typeof catNameOf === 'function' ? catNameOf(id) : ''
      return n || '#' + id
    })
    parts.push(names.length > 2 ? names.slice(0, 2).join('、') + ' 等 ' + names.length + ' 类' : names.join('、'))
  }
  if (f.minCents !== null || f.maxCents !== null) {
    const lo = f.minCents === null ? '' : formatCents(f.minCents)
    const hi = f.maxCents === null ? '' : formatCents(f.maxCents)
    parts.push(lo && hi ? '¥' + lo + '~¥' + hi : lo ? '≥¥' + lo : '≤¥' + hi)
  }
  if (f.startTs !== null || f.endTs !== null) {
    const s = f.startTs === null ? '' : toDateStr(f.startTs)
    const e = f.endTs === null ? '' : toDateStr(f.endTs - 1) // 右端点是"次日 00:00"，显示时要减回当天
    parts.push(s && e ? s + '~' + e : s ? s + ' 起' : '至 ' + e)
  }
  return parts.join(' · ')
}
