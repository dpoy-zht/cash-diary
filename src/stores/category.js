import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import * as categoryService from '../services/category.js'

export const useCategoryStore = defineStore('category', function () {
  const list = ref([])
  let ready = false

  /**
   * 初始化（有 ready 守卫，与其他 store 风格一致）：
   * App 启动 / 页面 onShow 重复调用只查一次库。
   * 「重置数据」「从备份恢复」后必须走 reload()，光调 init() 是不生效的。
   */
  async function init() {
    if (ready) return
    ready = true
    await reload()
  }

  /** 重新读取分类（可重复调用）：整库替换（重置/恢复）后强制刷新用 */
  async function reload() {
    await categoryService.seedIfEmpty()
    list.value = await categoryService.listAll()
  }

  const expenseCats = computed(function () {
    return list.value.filter(function (c) { return c.type === 'expense' })
  })
  const incomeCats = computed(function () {
    return list.value.filter(function (c) { return c.type === 'income' })
  })

  return { list, init, reload, expenseCats, incomeCats }
})
