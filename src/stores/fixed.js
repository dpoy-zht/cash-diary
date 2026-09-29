import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as fixedService from '../services/fixed.js'
import { refreshReminders } from '../services/reminder.js'
import { useAccountStore } from './account.js'

/** 固定支出配置（每月自动补记 + 按 day_of_month 提醒，T4.1） */
export const useFixedStore = defineStore('fixed', function () {
  const list = ref([])

  async function load() {
    list.value = await fixedService.listFixed(useAccountStore().currentId)
  }

  /**
   * 配置变了就重排缴费提醒（T4.1）。
   * 提醒是纯前端定时器，不会自己发现配置改动 —— 这里是唯一的同步点。
   * 引擎尚未启动（initDB 未完成）时是 no-op，安全。
   */
  function syncReminders() {
    try {
      refreshReminders()
    } catch (e) { /* 提醒排定失败不能影响配置保存本身 */ }
  }

  async function add(input) {
    await fixedService.addFixed(input, useAccountStore().currentId)
    await load()
    syncReminders()
  }

  /**
   * 修改配置（T3.5）。金额/记账日/分类/备注/启停都走 services/fixed.js 的 updateFixed 校验。
   * 不动 last_posted_ym：本月已记的那笔不重复记，新配置从下个月开始生效。
   */
  async function update(id, input) {
    await fixedService.updateFixed(id, input)
    await load()
    syncReminders()
  }

  async function toggle(id, enabled) {
    await fixedService.toggleFixed(id, enabled)
    await load()
    syncReminders()
  }

  async function remove(id) {
    await fixedService.removeFixed(id)
    await load()
    syncReminders()
  }

  return { list, load, add, update, toggle, remove }
})
