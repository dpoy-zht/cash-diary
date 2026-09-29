import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as fixedService from '../services/fixed.js'
import { useAccountStore } from './account.js'

/** 固定支出配置（每月自动补记） */
export const useFixedStore = defineStore('fixed', function () {
  const list = ref([])

  async function load() {
    list.value = await fixedService.listFixed(useAccountStore().currentId)
  }

  async function add(input) {
    await fixedService.addFixed(input, useAccountStore().currentId)
    await load()
  }

  /**
   * 修改配置（T3.5）。金额/记账日/分类/备注/启停都走 services/fixed.js 的 updateFixed 校验。
   * 不动 last_posted_ym：本月已记的那笔不重复记，新配置从下个月开始生效。
   */
  async function update(id, input) {
    await fixedService.updateFixed(id, input)
    await load()
  }

  async function toggle(id, enabled) {
    await fixedService.toggleFixed(id, enabled)
    await load()
  }

  async function remove(id) {
    await fixedService.removeFixed(id)
    await load()
  }

  return { list, load, add, update, toggle, remove }
})
