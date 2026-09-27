import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import * as budgetService from '../services/budget.js'
import { useAccountStore } from './account.js'

/**
 * 预算状态：总预算 + 各分类预算（按当前账本）。
 * 与 tx store 一样，账本从 account store 取，页面不感知多账本。
 */
export const useBudgetStore = defineStore('budget', function () {
  const totalCents = ref(0)
  const byCategory = ref({})

  const hasTotal = computed(function () {
    return totalCents.value > 0
  })

  function currentAccount() {
    return useAccountStore().currentId
  }

  async function load() {
    const data = await budgetService.getAll(currentAccount())
    totalCents.value = data.totalCents
    byCategory.value = data.byCategory
  }

  /** 取某分类的预算（没设返回 0） */
  function limitOf(categoryId) {
    return Number(byCategory.value[String(categoryId)]) || 0
  }

  async function setTotal(amountStr) {
    totalCents.value = await budgetService.setTotal(currentAccount(), amountStr)
  }

  async function setCategory(categoryId, amountStr) {
    const cents = await budgetService.setCategory(currentAccount(), categoryId, amountStr)
    const next = Object.assign({}, byCategory.value)
    if (cents) next[String(categoryId)] = cents
    else delete next[String(categoryId)]
    byCategory.value = next
  }

  return { totalCents, byCategory, hasTotal, load, limitOf, setTotal, setCategory }
})
