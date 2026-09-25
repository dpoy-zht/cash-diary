import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as txService from '../services/tx.js'

export const useTxStore = defineStore('tx', function () {
  const records = ref([])
  const summary = ref({ expenseCents: 0, incomeCents: 0 })

  async function loadMonth(ym) {
    records.value = await txService.listByMonth(ym)
    summary.value = await txService.monthSummary(ym)
  }

  async function add(ym, input) {
    await txService.addTx(input)
    await loadMonth(ym)
  }

  async function update(ym, id, input) {
    await txService.updateTx(id, input)
    await loadMonth(ym)
  }

  async function remove(ym, id) {
    await txService.removeTx(id)
    await loadMonth(ym)
  }

  return { records, summary, loadMonth, add, update, remove }
})
