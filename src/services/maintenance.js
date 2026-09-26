/**
 * 维护业务层：数据重置。
 *
 * 「重置数据」= 清空全部流水与分类 → 立刻回写内置分类种子，
 * 这样重置完 App 马上可用（不会出现「分类空了、记不了账」的中间态）。
 */
import * as maintenanceRepo from '../db/repository/maintenance.js'
import { seedIfEmpty } from './category.js'
import { seedDefaultIfEmpty } from './account.js'

/** 重置全部数据并恢复内置分类与默认账本；调用方负责之后刷新 store */
export async function resetAll() {
  await maintenanceRepo.clearAll()
  await seedIfEmpty()
  await seedDefaultIfEmpty()
}
