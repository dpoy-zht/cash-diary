import { defineStore } from 'pinia'
import { ref } from 'vue'
import { ymOf } from '../utils/date.js'

export const useMetaStore = defineStore('meta', function () {
  const ym = ref(ymOf(Date.now()))

  function shift(delta) {
    const parts = ym.value.split('-').map(Number)
    const d = new Date(parts[0], parts[1] - 1 + delta, 1)
    ym.value = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
  }

  return { ym, shift }
})
