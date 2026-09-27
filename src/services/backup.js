/**
 * 备份业务层：导出 / 恢复。
 *
 * 两条硬规矩：
 * 1. **恢复前先整份校验**（validateBackup 是只读的）。校验不过就直接抛错，
 *    绝不"恢复了一半"——那样会留下残缺库，比不恢复更糟。
 * 2. **恢复是整库替换**：先清空再按原 id 写回。所以调用方必须在界面上
 *    明确告知"会覆盖当前数据"，并让用户二次确认。
 */
import * as maintenanceRepo from '../db/repository/maintenance.js'
import { buildBackup, validateBackup } from '../utils/backup.js'
import { seedIfEmpty } from './category.js'
import { seedDefaultIfEmpty } from './account.js'

/** 导出：读全库 → 打包成备份对象 */
export async function exportBackup() {
  const tables = await maintenanceRepo.dumpAll()
  return buildBackup(tables, Date.now())
}

/** 导出成 JSON 文本（带缩进，方便用户自己查看/编辑） */
export async function exportJson() {
  return JSON.stringify(await exportBackup(), null, 2)
}

/** 解析备份文本；不是合法 JSON 时给出人话错误 */
export function parseBackupText(text) {
  try {
    return JSON.parse(String(text == null ? '' : text))
  } catch (e) {
    throw new Error('文件内容不是有效的 JSON')
  }
}

/**
 * 恢复：校验 → 整库替换 → 兜底种子。
 * @returns {Promise<{account:number, category:number, transaction_record:number, budget:number}>} 恢复条数
 */
export async function restoreBackup(obj) {
  const check = validateBackup(obj)
  if (!check.ok) throw new Error(check.error)
  await maintenanceRepo.restoreAll(obj)
  // 兜底：万一备份里没有分类 / 账本，恢复完立刻补上，保证 App 马上可用
  await seedIfEmpty()
  await seedDefaultIfEmpty()
  return check.counts
}
