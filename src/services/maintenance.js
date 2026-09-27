/**
 * 维护业务层：数据重置。
 *
 * 「重置数据」= 清空全部流水与分类 → 立刻回写内置分类种子，
 * 这样重置完 App 马上可用（不会出现「分类空了、记不了账」的中间态）。
 */
import * as maintenanceRepo from '../db/repository/maintenance.js'
import { seedIfEmpty } from './category.js'
import { seedDefaultIfEmpty } from './account.js'
import { pickOverAlertKeys } from '../utils/budget.js'
import { clearNotifyTray } from '../utils/notify.js'

/** 清掉所有「超支提醒已弹过」的去重键：重置 = 全新账本，提醒要从头来 */
function clearOverAlertKeys() {
  try {
    const info = uni.getStorageInfoSync()
    pickOverAlertKeys(info && info.keys).forEach(function (k) {
      try { uni.removeStorageSync(k) } catch (e) { /* 单个键失败不阻塞重置 */ }
    })
  } catch (e) { /* storage 不可用时跳过，不影响数据重置本身 */ }
}

/** 重置全部数据并恢复内置分类与默认账本；调用方负责之后刷新 store */
export async function resetAll() {
  await maintenanceRepo.clearAll()
  await seedIfEmpty()
  await seedDefaultIfEmpty()
  clearOverAlertKeys()
  clearNotifyTray() // 通知栏里残留的「超预算」本地通知一并撤掉，避免误导
}
