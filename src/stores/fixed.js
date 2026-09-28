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

  async function toggle(id, enabled) {
    await fixedService.toggleFixed(id, enabled)
    await load()
  }

  async function remove(id) {
    await fixedService.removeFixed(id)
    await load()
  }

  return { list, load, add, toggle, remove }
})
