import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as txService from '../services/tx.js'

export const useTxStore = defineStore('tx', function () {
  const records = ref([])
  const summary = ref({ expenseCents: 0, incomeCents: 0 })
  /** 全量概览（累计笔数/收支、最早最近时间）——账本页用 */
  const overview = ref({ totalCount: 0, incomeCents: 0, expenseCents: 0, firstAt: null, lastAt: null })

  async function loadMonth(ym) {
    records.value = await txService.listByMonth(ym)
    summary.value = await txService.monthSummary(ym)
  }

  async function loadOverview() {
    overview.value = await txService.overview()
  }

  async function add(ym, input) {
    await txService.addTx(input)
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

  /** 月份数据 + 全量概览一起刷新，避免两处数字对不上 */
  async function refresh(ym) {
    await loadMonth(ym)
    await loadOverview()
  }

  return { records, summary, overview, loadMonth, loadOverview, refresh, add, update, remove }
})
