import { describe, it, expect, beforeEach } from 'vitest'
import { getStorage, resetStorageForTest } from '../src/db/index.js'
import { seedIfEmpty, listAll as listCats } from '../src/services/category.js'
import * as txService from '../src/services/tx.js'
import {
  emptyFilters,
  normCents,
  normTs,
  normIds,
  normalizeFilters,
  hasAnyFilter,
  countFilters,
  filterSummary
} from '../src/utils/search.js'
import { parseAmountBound } from '../src/utils/money.js'
import { dateStrStart, dateStrEndExclusive } from '../src/utils/date.js'
import { buildTxSearchSql } from '../src/db/tx-search-sql.js'

const at = function (y, mo, d, h, mi) {
  return new Date(y, mo - 1, d, h || 0, mi || 0, 0, 0).getTime()
}

describe('T4.3 —— 筛选条件归一化（纯函数）', () => {
  it('emptyFilters：六项全空，且每次返回新对象（避免共享状态）', () => {
    const a = emptyFilters()
    const b = emptyFilters()
    expect(a).toEqual({ type: '', categoryIds: [], minCents: null, maxCents: null, startTs: null, endTs: null })
    expect(a).not.toBe(b)
    expect(a.categoryIds).not.toBe(b.categoryIds)
  })

  it('normCents：空/非法/负数 → null；0 是合法的（区间下界）', () => {
    expect(normCents(null)).toBeNull()
    expect(normCents(undefined)).toBeNull()
    expect(normCents('')).toBeNull()
    expect(normCents('abc')).toBeNull()
    expect(normCents(-1)).toBeNull()
    expect(normCents(Infinity)).toBeNull()
    expect(normCents(0)).toBe(0)
    expect(normCents('1990')).toBe(1990)
    expect(normCents(19.6)).toBe(20) // 取整到分
  })

  it('normTs：只有有限正数才算有效', () => {
    expect(normTs(null)).toBeNull()
    expect(normTs('')).toBeNull()
    expect(normTs(0)).toBeNull()
    expect(normTs(-5)).toBeNull()
    expect(normTs('abc')).toBeNull()
    expect(normTs(1700000000000)).toBe(1700000000000)
  })

  it('normIds：丢非法值、去重、升序（顺序稳定才好断言）', () => {
    expect(normIds([3, 1, 3, 0, -2, 'x', '2', 1.4])).toEqual([1, 2, 3])
    expect(normIds(null)).toEqual([])
    expect(normIds('1')).toEqual([]) // 不是数组就是空，不做隐式转换
  })

  it('normalizeFilters：脏输入全部收敛，type 只认 expense/income', () => {
    expect(normalizeFilters(null)).toEqual(emptyFilters())
    expect(normalizeFilters({ type: 'foo' }).type).toBe('')
    expect(normalizeFilters({ type: 'expense' }).type).toBe('expense')
    expect(normalizeFilters({ minCents: 'x', maxCents: -3 }).minCents).toBeNull()
    expect(normalizeFilters({ minCents: 'x', maxCents: -3 }).maxCents).toBeNull()
  })

  it('normalizeFilters：金额/日期区间写反了自动交换（查不出东西比给错结果更糟）', () => {
    const f = normalizeFilters({ minCents: 10000, maxCents: 2000, startTs: at(2026, 9, 30), endTs: at(2026, 9, 1) })
    expect(f.minCents).toBe(2000)
    expect(f.maxCents).toBe(10000)
    expect(f.startTs).toBe(at(2026, 9, 1))
    expect(f.endTs).toBe(at(2026, 9, 30))
  })

  it('hasAnyFilter / countFilters：按维度计数，不是按字段数', () => {
    expect(hasAnyFilter(null)).toBe(false)
    expect(hasAnyFilter({ type: 'foo', categoryIds: [], minCents: null })).toBe(false)
    expect(countFilters({ type: 'expense' })).toBe(1)
    expect(countFilters({ categoryIds: [1, 2] })).toBe(1) // 两个分类仍算一个维度
    expect(countFilters({ minCents: 100 })).toBe(1) // 金额区间上下界合起来算一个维度
    expect(countFilters({ maxCents: 100 })).toBe(1)
    expect(countFilters({ startTs: 1 })).toBe(1)
    expect(countFilters({ endTs: 2 })).toBe(1)
    expect(countFilters({ type: 'income', categoryIds: [1], minCents: 0, startTs: 1, endTs: 2 })).toBe(4)
  })

  it('filterSummary：把生效条件拼成一句人话', () => {
    expect(filterSummary(null)).toBe('')
    expect(filterSummary({ type: 'expense' })).toBe('支出')
    expect(filterSummary({ type: 'income' })).toBe('收入')
    expect(filterSummary({ minCents: 2000, maxCents: 10000 })).toBe('¥20.00~¥100.00')
    expect(filterSummary({ minCents: 2000 })).toBe('≥¥20.00')
    expect(filterSummary({ maxCents: 10000 })).toBe('≤¥100.00')
  })

  it('filterSummary：分类多于两个时折叠，否则全列', () => {
    const nameOf = function (id) { return ({ 1: '餐饮', 2: '交通', 3: '购物' })[id] || '' }
    expect(filterSummary({ categoryIds: [1, 2] }, nameOf)).toBe('餐饮、交通')
    expect(filterSummary({ categoryIds: [1, 2, 3] }, nameOf)).toBe('餐饮、交通 等 3 类')
    expect(filterSummary({ categoryIds: [9] })).toBe('#9') // 查不到名字时退化成 id
  })

  it('filterSummary：日期区间显示成含首尾的日期（右端点是次日 00:00，要减回来）', () => {
    const s = filterSummary({ startTs: at(2026, 9, 1), endTs: at(2026, 10, 1) })
    expect(s).toBe('2026-09-01~2026-09-30')
    expect(filterSummary({ startTs: at(2026, 9, 1) })).toBe('2026-09-01 起')
    expect(filterSummary({ endTs: at(2026, 10, 1) })).toBe('至 2026-09-30')
  })

  it('filterSummary：多维度用 · 连接', () => {
    const s = filterSummary({ type: 'expense', categoryIds: [1], minCents: 2000, maxCents: 10000 })
    expect(s).toContain('支出')
    expect(s).toContain('¥20.00~¥100.00')
    expect(s.split(' · ')).toHaveLength(3)
  })
})

describe('T4.3 —— 区间端点的解析', () => {
  it('parseAmountBound：允许 0 与两位小数，空/非法 → null', () => {
    expect(parseAmountBound('')).toBeNull()
    expect(parseAmountBound(null)).toBeNull()
    expect(parseAmountBound('  ')).toBeNull()
    expect(parseAmountBound('abc')).toBeNull()
    expect(parseAmountBound('-1')).toBeNull()
    expect(parseAmountBound('1.234')).toBeNull()
    expect(parseAmountBound('0')).toBe(0)
    expect(parseAmountBound('19.9')).toBe(1990)
    expect(parseAmountBound('100')).toBe(10000)
  })

  it("dateStrStart：'YYYY-MM-DD' → 当天 00:00；不存在的日期返回 null", () => {
    expect(dateStrStart('2026-09-30')).toBe(at(2026, 9, 30))
    expect(dateStrStart('2026-1-5')).toBeNull() // 必须补零
    expect(dateStrStart('2026-02-30')).toBeNull() // 2 月没有 30 号
    expect(dateStrStart('')).toBeNull()
    expect(dateStrStart(null)).toBeNull()
  })

  it('dateStrEndExclusive：取次日 00:00，让"结束日期"含当天', () => {
    expect(dateStrEndExclusive('2026-09-30')).toBe(at(2026, 10, 1))
    expect(dateStrEndExclusive('2026-12-31')).toBe(at(2027, 1, 1))
    expect(dateStrEndExclusive('bad')).toBeNull()
  })
})

/* ==================== 组合筛选端到端（内存存储 → 服务层 → 仓储） ==================== */

describe('T4.3 —— 组合筛选（内存存储全链路）', () => {
  let cats
  let catA // 餐饮（支出）
  let catB // 交通（支出）
  let catC // 工资（收入）

  function add(note, catId, cents, ts, type) {
    return getStorage().txInsert({
      account_id: 1,
      category_id: catId,
      type: type,
      amount_cents: cents,
      note: note,
      occurred_at: ts,
      created_at: ts,
      updated_at: ts,
      deleted_at: null
    })
  }

  beforeEach(async () => {
    resetStorageForTest()
    await getStorage().init()
    await seedIfEmpty()
    cats = await listCats()
    catA = cats.find(function (c) { return c.type === 'expense' && c.name !== '其他' })
    catB = cats.filter(function (c) { return c.type === 'expense' && c.id !== catA.id })[1]
    catC = cats.find(function (c) { return c.type === 'income' })
  })

  async function seedThree() {
    // 9/10 餐饮 30 元；9/20 交通 300 元；9/25 工资 12000 元
    await add('早饭', catA.id, 3000, at(2026, 9, 10, 8), 'expense')
    await add('打车', catB.id, 30000, at(2026, 9, 20, 9), 'expense')
    await add('九月工资', catC.id, 1200000, at(2026, 9, 25, 10), 'income')
  }

  it('只给筛选、不给关键词也能查（这轮新增的能力）', async () => {
    await seedThree()
    const rows = await txService.search('', 1, { type: 'expense' })
    expect(rows.length).toBe(2)
    rows.forEach(function (r) { expect(r.type).toBe('expense') })
  })

  it('关键词 + 类型：两个条件同时生效（AND）', async () => {
    await seedThree()
    const rows = await txService.search('九', 1, { type: 'expense' })
    expect(rows).toEqual([]) // "九月工资"是收入，被类型条件筛掉
    expect((await txService.search('九', 1, { type: 'income' })).length).toBe(1)
  })

  it('分类多选：命中集合内任一个分类', async () => {
    await seedThree()
    const rows = await txService.search('', 1, { categoryIds: [catA.id, catC.id] })
    expect(rows.length).toBe(2)
  })

  it('金额区间：按整数分比较，边界含在内（闭区间）', async () => {
    await seedThree()
    expect((await txService.search('', 1, { minCents: 3000, maxCents: 30000 })).length).toBe(2)
    expect((await txService.search('', 1, { minCents: 3001 })).length).toBe(2)
    expect((await txService.search('', 1, { minCents: 3001, maxCents: 29999 })).length).toBe(0)
  })

  it('日期区间：左闭右开，结束日在次日 00:00，所以"结束当天"是包含的', async () => {
    await seedThree()
    const s = dateStrStart('2026-09-10')
    const e = dateStrEndExclusive('2026-09-20')
    const rows = await txService.search('', 1, { startTs: s, endTs: e })
    expect(rows.length).toBe(2) // 9/10 与 9/20 都在内
    expect(rows.map(function (r) { return r.note }).sort()).toEqual(['打车', '早饭'])
  })

  it('日期区间：单边也能用（只给开始 / 只给结束）', async () => {
    await seedThree()
    expect((await txService.search('', 1, { startTs: dateStrStart('2026-09-21') })).length).toBe(1)
    expect((await txService.search('', 1, { endTs: dateStrStart('2026-09-11') })).length).toBe(1)
  })

  it('四类条件同时叠加（关键词 + 类型 + 分类 + 金额 + 日期）', async () => {
    await seedThree()
    const rows = await txService.search('早', 1, {
      type: 'expense',
      categoryIds: [catA.id],
      minCents: 1000,
      maxCents: 5000,
      startTs: dateStrStart('2026-09-01'),
      endTs: dateStrEndExclusive('2026-09-30')
    })
    expect(rows.length).toBe(1)
    expect(rows[0].note).toBe('早饭')
  })

  it('组合起来查不到就是空数组，不抛错', async () => {
    await seedThree()
    expect(await txService.search('早饭', 1, { type: 'income' })).toEqual([])
    expect(await txService.search('', 1, { startTs: at(2030, 1, 1) })).toEqual([])
  })

  it('账本隔离与软删除在筛选下依然生效', async () => {
    const id = await add('早饭', catA.id, 3000, at(2026, 9, 10, 8), 'expense')
    await getStorage().txSoftDelete(id)
    expect(await txService.search('', 1, { categoryIds: [catA.id] })).toEqual([])
  })

  it('筛选条件为脏值时不会拼坏 SQL / 不会误命中（转义防护）', async () => {
    await seedThree()
    // 关键词里的 % 与单引号必须被 likePattern 吃掉，不能变成通配或截断 SQL
    expect(await txService.search('%', 1, {})).toEqual([])
    expect(await txService.search("' OR 1=1 --", 1, {})).toEqual([])
    // 分类 id 传字符串脏值 → 归一化阶段就被丢掉，退化为"没有筛选"
    expect((await txService.search('打车', 1, { categoryIds: ["1') OR 1=1 --"] })).length).toBe(1)
  })

  it('一个条件都没有时返回空数组（不扫全表）', async () => {
    await seedThree()
    expect(await txService.search('', 1)).toEqual([])
    expect(await txService.search('   ', 1, { type: 'foo', minCents: -1 })).toEqual([])
  })
})

/* ==================== SQL 拼装（纯函数，逐字断言） ==================== */

describe('T4.3 —— buildTxSearchSql（结构与转义）', () => {
  // 为什么逐字断言：plus.sqlite 不支持参数绑定，SQL 全靠字符串拼；而这段代码在 Node 里
  // 跑不到（真机才有 plus.sqlite），少个空格 / 括号错位 / 转义漏一个，开发机上完全看不出来，
  // 到手机上就是"搜不到任何东西"。抽成纯函数就是为了在这里把每个字符钉死。
  const BASE = 'SELECT * FROM transaction_record WHERE deleted_at IS NULL AND account_id = '
  const TAIL = ' ORDER BY occurred_at DESC LIMIT 100'

  it('关键词：note LIKE 包含匹配，且显式声明 ESCAPE', () => {
    expect(buildTxSearchSql('奶茶', [], 1, 100, {})).toBe(BASE + "1 AND (note LIKE '%奶茶%' ESCAPE '\\')" + TAIL)
  })

  it('LIKE 通配符被转义：% 与 _ 不再当通配符用', () => {
    expect(buildTxSearchSql('%', [], 1, 100, {})).toContain("note LIKE '%\\%%' ESCAPE '\\'")
    expect(buildTxSearchSql('_', [], 1, 100, {})).toContain("note LIKE '%\\_%' ESCAPE '\\'")
  })

  it('单引号被双写：注入串整条落在字面量里，拼不出新结构', () => {
    expect(buildTxSearchSql("' OR 1=1 --", [], 1, 100, {})).toBe(
      BASE + "1 AND (note LIKE '%'' OR 1=1 --%' ESCAPE '\\')" + TAIL
    )
  })

  it('只有关键词命中的分类、没有关键词本身，仍算有搜索条件', () => {
    expect(buildTxSearchSql('', [3], 1, 100, {})).toContain('(category_id IN (3))')
  })

  it('分类 id 脏值：转不成正整数就整条丢掉；保序（排序交给上游 normIds）', () => {
    expect(buildTxSearchSql('', ["1') OR 1=1 --"], 1, 100, {})).toBe('')
    expect(buildTxSearchSql('', [1, 2], 1, 100, {})).toContain('category_id IN (1,2)')
    // -1 / 'x' / NaN 被丢掉；1.4 取整成 1；顺序不打乱（'2,1' 而不是 '1,2'）
    expect(buildTxSearchSql('', [2, -1, 'x', NaN, 1.4], 1, 100, {})).toContain('category_id IN (2,1)')
  })

  it('账号：非法/缺省落默认账本 1（与 aid 约定一致）', () => {
    const f = { type: 'expense' }
    expect(buildTxSearchSql('', [], null, 100, f)).toContain('account_id = 1')
    expect(buildTxSearchSql('', [], 'x', 100, f)).toContain('account_id = 1')
    expect(buildTxSearchSql('', [], -3, 100, f)).toContain('account_id = 1')
    expect(buildTxSearchSql('', [], 7, 100, f)).toContain('account_id = 7')
  })

  it('类型：只认 expense / income，其它值不产生条件', () => {
    expect(buildTxSearchSql('', [], 1, 100, { type: 'expense' })).toContain("type = 'expense'")
    expect(buildTxSearchSql('', [], 1, 100, { type: 'income' })).toContain("type = 'income'")
    expect(buildTxSearchSql('', [], 1, 100, { type: 'foo' })).toBe('')
  })

  it('金额区间：整数分、闭区间（>= 与 <=），小数取整到分', () => {
    const sql = buildTxSearchSql('', [], 1, 100, { minCents: 2000, maxCents: 10000 })
    expect(sql).toContain('amount_cents >= 2000')
    expect(sql).toContain('amount_cents <= 10000')
    expect(buildTxSearchSql('', [], 1, 100, { minCents: 19.6 })).toContain('amount_cents >= 20')
    expect(buildTxSearchSql('', [], 1, 100, { minCents: 0 })).toContain('amount_cents >= 0')
  })

  it('日期区间：左闭右开（>= start 且 < end）', () => {
    const sql = buildTxSearchSql('', [], 1, 100, { startTs: 1000, endTs: 2000 })
    expect(sql).toContain('occurred_at >= 1000')
    expect(sql).toContain('occurred_at < 2000')
  })

  it('关键词组内 OR、组外与筛选组 AND，各自套括号（括号错一位语义就翻）', () => {
    const sql = buildTxSearchSql('奶茶', [3], 1, 100, { type: 'expense' })
    expect(sql).toContain("(note LIKE '%奶茶%' ESCAPE '\\' OR category_id IN (3)) AND type = 'expense'")
  })

  it('LIMIT：最小 1；非法/0 落到默认 100；小数向下取整', () => {
    const f = { type: 'expense' }
    expect(buildTxSearchSql('', [], 1, 5, f)).toContain('LIMIT 5')
    expect(buildTxSearchSql('', [], 1, -5, f)).toContain('LIMIT 1')
    expect(buildTxSearchSql('', [], 1, 0, f)).toContain('LIMIT 100')
    expect(buildTxSearchSql('', [], 1, 'abc', f)).toContain('LIMIT 100')
    expect(buildTxSearchSql('', [], 1, 19.8, f)).toContain('LIMIT 19')
  })

  it('一组条件都没有 → 空串（调用方据此跳过查询，避免扫全表）', () => {
    expect(buildTxSearchSql('', [], 1, 100, {})).toBe('')
    expect(buildTxSearchSql('', [], 1, 100, null)).toBe('')
    expect(buildTxSearchSql('', [], 1, 100, { type: 'foo', categoryIds: [], minCents: null })).toBe('')
  })

  it('filters 传非对象（脏值）不炸，按"没有筛选"处理', () => {
    expect(buildTxSearchSql('', [], 1, 100, 'oops')).toBe('')
    expect(buildTxSearchSql('', [], 1, 100, 42)).toBe('')
    expect(buildTxSearchSql('', [], 1, 100, undefined)).toBe('')
  })
})
