import { defineStore } from 'pinia'
import { ref } from 'vue'
import { ymOf } from '../utils/date.js'

/**
 * 全局 UI/数据版本状态。
 *
 * `dataVersion` 是给"查询缓存"用的失效信号（T3.10）：
 * 任何会改变流水/汇总结果的写操作（记账、编辑、删除、固定支出补记、恢复备份、重置数据）
 * 都调一次 bumpData()，各页 onShow 里的重复查询据此跳过或重查 —— 页面侧不需要感知。
 * 切账本不用 bump：查询缓存键里已经带了账本 id，天然失效。
 */
export const useMetaStore = defineStore('meta', function () {
  const ym = ref(ymOf(Date.now()))
  const dataVersion = ref(0)

  function shift(delta) {
    const parts = ym.value.split('-').map(Number)
    const d = new Date(parts[0], parts[1] - 1 + delta, 1)
    ym.value = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
  }

  /** 数据被写过：让所有页面的查询缓存失效 */
  function bumpData() {
    dataVersion.value += 1
  }

  return { ym, shift, dataVersion, bumpData }
})
