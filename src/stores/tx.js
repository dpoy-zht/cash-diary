import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as txService from '../services/tx.js'
import { useAccountStore } from './account.js'
import { lastNMonths, monthRange } from '../utils/date.js'
import { monthlySummaries } from '../utils/stats.js'

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

  /**
   * 所有查询都带上"当前账本"的过滤条件。
   * 页面因此完全不需要感知多账本，切换账本后调一次 refresh 即可。
   */
  function currentAccount() {
    return useAccountStore().currentId
  }

  async function loadMonth(ym) {
    const aid = currentAccount()
    records.value = await txService.listByMonth(ym, aid)
    summary.value = await txService.monthSummary(ym, aid)
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

  async function add(ym, input) {
    await txService.addTx(Object.assign({}, input, { accountId: currentAccount() }))
    await refresh(ym)
  }

  async function update(ym, id, input) {
    await txService.updateTx(id, input)
    await refresh(ym)
  }

  async function remove(ym, id) {
    await txService.removeTx(id)
    await refresh(ym)
  }

  /** 月份数据 + 全量概览 + 连续天数样本 + 六月趋势一起刷新，避免几处数字对不上 */
  async function refresh(ym) {
    await loadMonth(ym)
    await loadOverview()
    await loadRecentTs()
    await loadTrend()
  }

  return {
    records,
    summary,
    overview,
    recentTs,
    trend,
    loadMonth,
    loadOverview,
    loadRecentTs,
    loadTrend,
    refresh,
    add,
    update,
    remove
  }
})
