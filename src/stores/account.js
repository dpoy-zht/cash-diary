import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import * as accountService from '../services/account.js'

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
    await accountService.seedDefaultIfEmpty()
    let saved = 0
    try {
      saved = Number(uni.getStorageSync(CUR_KEY)) || 0
    } catch (e) {
      saved = 0
    }
    await refresh()
    // 存过的账本已不存在（比如被删了）→ 回落到第一个
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
  }

  /** 新建账本并自动切过去（sqlite 拿不到自增 id，故刷新后取 id 最大的那个） */
  async function create(name) {
    await accountService.create(name)
    await refresh()
    const newest = list.value.reduce(function (m, a) {
      return !m || a.id > m.id ? a : m
    }, null)
    if (newest) setCurrent(newest.id)
    return newest
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

  return { list, currentId, current, others, init, refresh, setCurrent, create, rename, remove }
})
