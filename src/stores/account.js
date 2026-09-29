import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import * as accountService from '../services/account.js'
import { refreshReminders } from '../services/reminder.js'

/** 上次选中的账本 id，切 App 回来还在同一个账本 */
const CUR_KEY = 'cashDiary.currentAccountId'

/**
 * 账本状态：列表（带统计）+ 当前账本。
 *
 * 当前账本被 stores/tx.js 读取，用来给所有流水查询加账本过滤 ——
 * 因此页面完全不需要感知"多账本"，切换账本后刷新一下即可。
 */
export const useAccountStore = defineStore('account', function () {
  const list = ref([])
  const currentId = ref(1)
  let ready = false

  const current = computed(function () {
    return list.value.find(function (a) { return a.id === currentId.value }) || list.value[0] || null
  })

  /** 其他账本（当前账本之外的），账本页列表用 */
  const others = computed(function () {
    return list.value.filter(function (a) { return a.id !== currentId.value })
  })

  async function init() {
    if (ready) return
    ready = true
    await reload()
  }

  /**
   * 重新读取账本（可重复调用）。
   * 「从备份恢复」后必须走这个，否则 store 里还是恢复前的账本列表 ——
   * init() 有 ready 守卫，光调它是不生效的。
   */
  async function reload() {
    await accountService.seedDefaultIfEmpty()
    let saved = 0
    try {
      saved = Number(uni.getStorageSync(CUR_KEY)) || 0
    } catch (e) {
      saved = 0
    }
    await refresh()
    // 存过的账本已不存在（比如被删了/被备份覆盖了）→ 回落到第一个
    if (list.value.some(function (a) { return a.id === saved })) currentId.value = saved
    else if (list.value.length) currentId.value = list.value[0].id
    persistCurrent()
  }

  async function refresh() {
    list.value = await accountService.listWithStats()
  }

  function persistCurrent() {
    try {
      uni.setStorageSync(CUR_KEY, currentId.value)
    } catch (e) { /* 存储不可用也不影响本次会话 */ }
  }

  function setCurrent(id) {
    currentId.value = id
    persistCurrent()
    // 切了账本就换了一套固定支出配置，缴费提醒必须按新账本重排（T4.1）
    try {
      refreshReminders()
    } catch (e) { /* 提醒排定失败不影响账本切换 */ }
  }

  /**
   * 新建账本并自动切过去。
   *
   * ⚠️ `accountService.create()` 返回的是**数字 id**（两个适配器的 accountInsert 都返回 id），
   * 不是对象 —— 曾按 `created.id` 取值，导致新建后根本没切过去（T2.4 引入的回归）。
   */
  async function create(name) {
    const newId = Number(await accountService.create(name))
    await refresh()
    if (newId) setCurrent(newId)
    return newId
  }

  async function rename(id, name) {
    await accountService.rename(id, name)
    await refresh()
  }

  async function remove(id) {
    await accountService.removeIfEmpty(id)
    await refresh()
    if (!list.value.some(function (a) { return a.id === currentId.value }) && list.value.length) {
      setCurrent(list.value[0].id)
    }
  }

  return { list, currentId, current, others, init, reload, refresh, setCurrent, create, rename, remove }
})
