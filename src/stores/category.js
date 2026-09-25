import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import * as categoryService from '../services/category.js'

export const useCategoryStore = defineStore('category', function () {
  const list = ref([])

  async function init() {
    await categoryService.seedIfEmpty()
    list.value = await categoryService.listAll()
  }

  const expenseCats = computed(function () {
    return list.value.filter(function (c) { return c.type === 'expense' })
  })
  const incomeCats = computed(function () {
    return list.value.filter(function (c) { return c.type === 'income' })
  })

  return { list, init, expenseCats, incomeCats }
})
