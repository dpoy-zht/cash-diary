/**
 * 流水搜索的 SQL 构造（纯函数，可在 Node 里逐字断言）。
 *
 * 为什么单独抽出来：plus.sqlite **不支持参数绑定**，SQL 全是字符串拼接出来的，
 * 而这段代码在 Node 里跑不了（只有真机有效）——少一个空格、括号错位、拼串顺序反了，
 * 在开发机上完全看不出来，到手机上就是"搜不到任何东西"。
 * 变成纯函数之后，上面这些都能在测试里直接断言。
 *
 * 语义（与 db/memory.js 的 txSearch 逐条一致，改一边必须改另一边）：
 * - 关键词组（组内 OR）：`note LIKE 关键词` 或 `category_id IN 关键词命中的分类`
 * - 筛选组（组内 AND）：类型 / 分类多选 / 金额区间 / 日期区间
 * - 两组之间 AND；一组都没有 → 返回空串（调用方据此跳过查询，不扫全表）
 * - 日期区间左闭右开 [startTs, endTs)
 *
 * 安全：所有动态值经 sqlValue（单引号翻倍）；关键词走 likePattern（额外转义 % _ \，
 * 且 SQL 侧配 ESCAPE '\'）；分类 id 也过一遍 sqlValue ——
 * 即便上游给了脏值，也只会变成一个字符串字面量，拼不出 SQL 结构。
 */
import { sqlValue, likePattern } from './sql-value.js'
import { aid } from '../utils/constant.js'

/** 正整数数组（分类 id）→ '1,2,3'（每个元素单独转义） */
function idList(v) {
  const ids = (Array.isArray(v) ? v : [])
    .map(Number)
    .filter(function (n) { return isFinite(n) && n > 0 })
  return ids.map(function (n) { return sqlValue(Math.round(n)) }).join(',')
}

/** 数值型条件值：null/undefined/非有限 → null（表示不参与过滤） */
function numOrNull(v) {
  if (v === null || v === undefined) return null
  const n = Number(v)
  return isFinite(n) ? Math.round(n) : null
}

/**
 * @param {string} noteKw 关键词（空串 = 不按关键词过滤）
 * @param {number[]} kwCategoryIds 关键词命中的分类 id（与 noteKw 是「或」）
 * @param {number} accountId 账本 id（非法值落默认账本）
 * @param {number} limit 返回上限
 * @param {object} [filters] 见 utils/search.js 的 normalizeFilters
 * @returns {string} 完整 SELECT 语句；无任何条件时返回空串
 */
export function buildTxSearchSql(noteKw, kwCategoryIds, accountId, limit, filters) {
  const max = Math.max(1, Math.floor(Number(limit) || 100))
  const kw = String(noteKw == null ? '' : noteKw)
  const kwIds = idList(kwCategoryIds)
  const f = filters && typeof filters === 'object' ? filters : {}

  // 关键词组（组内 OR）
  const kwConds = []
  if (kw) kwConds.push('note LIKE ' + likePattern(kw) + " ESCAPE '\\'")
  if (kwIds) kwConds.push('category_id IN (' + kwIds + ')')

  // 筛选组（组内 AND）
  const conds = []
  if (kwConds.length) conds.push('(' + kwConds.join(' OR ') + ')')

  const fIds = idList(f.categoryIds)
  if (fIds) conds.push('category_id IN (' + fIds + ')')

  const type = f.type === 'expense' || f.type === 'income' ? f.type : ''
  if (type) conds.push('type = ' + sqlValue(type))

  const min = numOrNull(f.minCents)
  if (min !== null) conds.push('amount_cents >= ' + sqlValue(min))
  const maxC = numOrNull(f.maxCents)
  if (maxC !== null) conds.push('amount_cents <= ' + sqlValue(maxC))

  const start = numOrNull(f.startTs)
  if (start !== null) conds.push('occurred_at >= ' + sqlValue(start))
  const end = numOrNull(f.endTs)
  if (end !== null) conds.push('occurred_at < ' + sqlValue(end)) // 左闭右开

  if (!conds.length) return ''
  return (
    'SELECT * FROM transaction_record ' +
    'WHERE deleted_at IS NULL AND account_id = ' + aid(accountId) + ' ' +
    'AND ' + conds.join(' AND ') +
    ' ORDER BY occurred_at DESC LIMIT ' + max
  )
}
