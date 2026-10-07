import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as txService from '../services/tx.js'
import * as tagService from '../services/tag.js'
import { useAccountStore } from './account.js'
import { useMetaStore } from './meta.js'
import { lastNMonths, monthRange, toDateStr, prevYmOf } from '../utils/date.js'
import { emptyFilters, normalizeFilters, hasAnyFilter } from '../utils/search.js'
import { monthlySummaries, periodRange, trendSpecFor, sumByType, bucketSummaries, prevPeriodRange } from '../utils/stats.js'

/** 趋势图统计的月份数 */
export const TREND_MONTHS = 6

export const useTxStore = defineStore('tx', function () {
  const records = ref([])
  const summary = ref({ expenseCents: 0, incomeCents: 0 })
  /** 全量概览（累计笔数/收支、最早最近时间）——账本页 / 我的页用 */
  const overview = ref({ totalCount: 0, incomeCents: 0, expenseCents: 0, firstAt: null, lastAt: null })
  /** 近两年的记录时间戳 —— 我的页算连续记账天数（覆盖到连续段起点即可） */
  const recentTs = ref([])
  /** 近 6 个月分桶： [{ ym, expenseCents, incomeCents }] —— 统计页趋势图用 */
  const trend = ref([])

  /** 统计页期间数据（日/周/月/年）：期间内流水 + 收支合计 + 趋势分桶 */
  const periodRecords = ref([])
  const periodSummary = ref({ expenseCents: 0, incomeCents: 0 })
  const periodTrend = ref([])
  /** 上一「同长度期间」的收支合计 —— 环环比用（日→昨天 / 周→上周 / 月→上月 / 年→去年） */
  const periodPrevSummary = ref({ expenseCents: 0, incomeCents: 0 })

  /** 月度报告（T4.4）：当月流水 + 上月流水（环比用）。总预算由页面从 budget store 取 */
  const reportRecords = ref([])
  const reportPrevRecords = ref([])

  /**
   * 首页搜索：跨月流水（备注/分类名命中）+ 组合筛选（T4.3）。
   * 关键词与筛选**任一存在**就算"搜索中"：只按"支出 + 20~100 元"找账也是合法的用法。
   */
  const searchKeyword = ref('')
  const searchFilters = ref(emptyFilters())
  const searchResults = ref([])

  /** 搜索是否生效（列表区据此切换数据源） */
  function isSearching() {
    return searchKeyword.value.trim() !== '' || hasAnyFilter(searchFilters.value)
  }

  /**
   * 执行搜索。
   * @param {string} kw 关键词
   * @param {object} [filters] 筛选条件（原始输入即可，服务层会归一化）
   */
  async function search(kw, filters) {
    const text = String(kw == null ? '' : kw)
    searchKeyword.value = text
    searchFilters.value = normalizeFilters(
      filters === undefined ? searchFilters.value : filters
    )
    if (!isSearching()) {
      searchResults.value = []
      return
    }
    searchResults.value = await txService.search(text, currentAccount(), searchFilters.value)
  }

  /** 只改筛选、沿用当前关键词（筛选面板点"应用"走这条） */
  async function searchWithFilters(filters) {
    return search(searchKeyword.value, filters)
  }

  function clearSearch() {
    searchKeyword.value = ''
    searchFilters.value = emptyFilters()
    searchResults.value = []
  }

  /**
   * 所有查询都带上"当前账本"的过滤条件。
   * 页面因此完全不需要感知多账本，切换账本后调一次 refresh 即可。
   */
  function currentAccount() {
    return useAccountStore().currentId
  }

  async function loadMonth(ym) {
    const aid = currentAccount()
    // 两个查询互不依赖，并行发（App 端每个 await 都是一次 SQLite 桥接往返）
    const [rows, sum] = await Promise.all([
      txService.listByMonth(ym, aid),
      txService.monthSummary(ym, aid)
    ])
    records.value = rows
    summary.value = sum
  }

  async function loadOverview() {
    overview.value = await txService.overview(currentAccount())
  }

  async function loadRecentTs() {
    const since = Date.now() - 730 * 86400000
    recentTs.value = await txService.recentTimestamps(since, currentAccount())
  }

  /**
   * 近 6 个月趋势：**一次区间查询**再在 JS 里按本地日历月分桶
   * （逐月查 6 次也行，但 App 端每次都是一个桥接往返；而且分桶交给纯函数更好测）。
   */
  async function loadTrend() {
    const months = lastNMonths(TREND_MONTHS)
    const first = months[0].split('-').map(Number)
    const last = months[months.length - 1].split('-').map(Number)
    const start = monthRange(first[0], first[1])[0]
    const end = monthRange(last[0], last[1])[1]
    const rows = await txService.listByRange(start, end, currentAccount())
    trend.value = monthlySummaries(rows, months)
  }

  /**
   * 统计页期间统计（日 / 周 / 月 / 年）：
   * **一次区间查询**覆盖「期间本体 + 趋势区间」的超集，再在 JS 里过滤与分桶 ——
   * 桥接查询次数最少，分桶逻辑全部落在纯函数（可单测）。
   * - day  → 近 7 天逐日
   * - week → 近 4 周逐周
   * - month→ 近 6 个月逐月
   * - year → 当年 12 个月
   *
   * 环比（较昨日/上周/上月/去年）的上一期数据**优先从已取回的 rows 里筛**：
   * 日/周/月三种期间的上一期本来就落在趋势区间内，不用再查一次库；
   * 只有「年」的去年在区间之外，才补发一次查询。
   */
  async function loadStatsPeriod(key, anchorTs) {
    const aid = currentAccount()
    const pr = periodRange(key, anchorTs)
    const spec = trendSpecFor(key, anchorTs)
    const start = Math.min(pr[0], spec.start)
    const end = Math.max(pr[1], spec.end)
    const rows = await txService.listByRange(start, end, aid)
    periodRecords.value = rows.filter(function (r) {
      return r.occurred_at >= pr[0] && r.occurred_at < pr[1]
    })
    periodSummary.value = sumByType(periodRecords.value)
    periodTrend.value = bucketSummaries(rows, spec.keys, spec.keyOf)

    const prev = prevPeriodRange(key, anchorTs)
    const covered = prev[0] >= start && prev[1] <= end
    const prevRows = covered
      ? rows.filter(function (r) {
        return r.occurred_at >= prev[0] && r.occurred_at < prev[1]
      })
      : await txService.listByRange(prev[0], prev[1], aid)
    periodPrevSummary.value = sumByType(prevRows)
  }

  /**
   * 月度报告（T4.4）：一次拿"当月 + 上月"两个月流水。
   * 两个查询互不依赖，并行发（App 端每个 await 都是一次 SQLite 桥接往返）。
   * 上月键由 prevYmOf 算（跨年交给 Date），非法月份直接不查上月。
   */
  async function loadReport(ym) {
    const aid = currentAccount()
    const prev = prevYmOf(ym)
    const [cur, prevRows] = await Promise.all([
      txService.listByMonth(ym, aid),
      prev ? txService.listByMonth(prev, aid) : Promise.resolve([])
    ])
    reportRecords.value = cur
    reportPrevRecords.value = prevRows
  }

  /**
   * 新增一笔流水。
   * @param {string} ym 月份（'YYYY-MM'）
   * @param {object} input buildAddInput 的产物
   * @param {number[]} [tagIds] 要挂的标签（可空）
   * @returns {Promise<number>} 新流水 id
   *
   * 标签在同一次调用里落库：记账页只需要 `txStore.add(ym, input, tagIds)` 一句，
   * 不用自己先记账再补标签（那样两个写操作分散在页面里，容易漏掉其中一个）。
   */
  async function add(ym, input, tagIds) {
    const id = await txService.addTx(Object.assign({}, input, { accountId: currentAccount() }))
    const ids = Array.isArray(tagIds) ? tagIds.filter(Boolean) : []
    if (ids.length) await tagService.setTxTags(currentAccount(), id, ids)
    bumpData()
    await refresh(ym)
    return id
  }

  /**
   * 编辑一笔流水。
   * @param {number[]} [tagIds] 传入则**覆写**标签集合；不传（undefined）表示不动标签。
   *   刻意区分"传空数组"与"不传"：前者是"把标签全清掉"，后者是"这次不碰标签"。
   */
  async function update(ym, id, input, tagIds) {
    await txService.updateTx(id, input)
    if (Array.isArray(tagIds)) await tagService.setTxTags(currentAccount(), id, tagIds)
    bumpData()
    await refresh(ym)
  }

  async function remove(ym, id) {
    await txService.removeTx(id)
    bumpData()
    await refresh(ym)
  }

  function bumpData() {
    useMetaStore().bumpData()
  }

  /**
   * 上一次 refresh 的缓存键（T3.10）。
   *
   * 键 = 月份 | 账本 | 数据版本 | 本地日期：
   * - 月份 / 账本：查询本身的口径
   * - 数据版本：任何写操作后递增（见 meta.js），保证读到的不是旧数据
   * - 本地日期：跨天后「近两年流水时间戳」的窗口在移动，也必须重算
   * 命中就直接返回 —— 首页/账本/预算/我的 四处 onShow 不再重复打同样的四次查询。
   */
  let lastRefreshKey = ''

  function refreshKey(ym) {
    return [ym, currentAccount(), useMetaStore().dataVersion, toDateStr(Date.now())].join('|')
  }

  /**
   * 月份数据 + 全量概览 + 连续天数样本 + 六月趋势一起刷新，避免几处数字对不上。
   * 四个查询互不依赖，并行执行（App 端每个 await 都是一次 plus.sqlite 桥接往返，
   * 串行要付 4 倍往返延迟）；任一失败整体抛出，由调用方按原有错误语义处理。
   *
   * @param {string} ym 月份键
   * @param {{ force?: boolean }} [opts] force=true 时无视缓存强制重查
   */
  async function refresh(ym, opts) {
    const key = refreshKey(ym)
    if (!(opts && opts.force) && key === lastRefreshKey) return
    lastRefreshKey = key
    try {
      await Promise.all([
        loadMonth(ym),
        loadOverview(),
        loadRecentTs(),
        loadTrend()
      ])
    } catch (e) {
      // 失败不留下"已刷新"的假象：下次调用必须真的重试
      lastRefreshKey = ''
      throw e
    }
  }

  return {
    records,
    summary,
    overview,
    recentTs,
    trend,
    periodRecords,
    periodSummary,
    periodTrend,
    periodPrevSummary,
    reportRecords,
    reportPrevRecords,
    searchKeyword,
    searchFilters,
    searchResults,
    isSearching,
    search,
    searchWithFilters,
    clearSearch,
    loadMonth,
    loadOverview,
    loadRecentTs,
    loadTrend,
    loadStatsPeriod,
    loadReport,
    refresh,
    add,
    update,
    remove
  }
})
