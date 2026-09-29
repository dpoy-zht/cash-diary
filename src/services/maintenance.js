/**
 * 维护业务层：数据重置 + 数据体检（T4.6）。
 *
 * 「重置数据」= 清空全部流水与分类 → 立刻回写内置分类种子，
 * 这样重置完 App 马上可用（不会出现「分类空了、记不了账」的中间态）。
 *
 * 「数据体检」= 扫出平时看不出来、但会让备份/统计出问题的脏记录，并按明确的规则修。
 * 判定规则全在 utils/health.js（纯函数，逐条可测）；这里只负责读库、写库、报告做了什么。
 */
import * as maintenanceRepo from '../db/repository/maintenance.js'
import * as txRepo from '../db/repository/tx.js'
import * as budgetRepo from '../db/repository/budget.js'
import * as fixedRepo from '../db/repository/fixed.js'
import * as categoryRepo from '../db/repository/category.js'
import { seedIfEmpty } from './category.js'
import { seedDefaultIfEmpty } from './account.js'
import { pickOverAlertKeys } from '../utils/budget.js'
import { clearNotifyTray } from '../utils/notify.js'
import { scanHealth, collectFixes } from '../utils/health.js'
import { AUTO_BACKUP_LAST_KEY } from '../utils/backup.js'

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

/* ---------------- 数据体检（T4.6） ---------------- */

/** 上次自动备份时间（App 端才有；H5 读不到就是 0 = 从未备份） */
export function lastBackupAt() {
  try {
    return Number(uni.getStorageSync(AUTO_BACKUP_LAST_KEY)) || 0
  } catch (e) {
    return 0
  }
}

/**
 * 扫描整库，返回问题清单。
 * @param {number} [nowTs] 当前时间（测试注入）
 */
export async function scanDataHealth(nowTs) {
  const tables = await maintenanceRepo.dumpAll()
  return scanHealth({ tables: tables, lastBackupAt: lastBackupAt(), nowTs: nowTs })
}

/**
 * 执行修复。顺序是有讲究的：
 * 1. 先"改"（把孤儿指向补回合法值）—— 改只有唯一正确答案，失败也不会让数据更糟；
 * 2. 再"删"（预算是配置、固定支出是配置）—— 删配置不影响流水；
 * 3. 最后才软删流水 —— 最不可逆的一步放最后，前面的失败不会留下"删了但没改"的半吊子状态。
 *
 * 软删除而不是物理删除：删错了还能从备份里找回来（数据铁律 3）。
 *
 * @returns {Promise<{changed:number, summary:string[]}>}
 */
export async function repairDataHealth(scan) {
  const plan = collectFixes(scan)
  let changed = 0

  for (const p of plan.txPatches) {
    await txRepo.update(p.id, p.patch)
    changed += 1
  }
  for (const p of plan.categoryPatches) {
    await categoryRepo.update(p.id, p.patch)
    changed += 1
  }
  for (const b of plan.budgetDeletes) {
    await budgetRepo.remove(b.account_id, b.category_id)
    changed += 1
  }
  for (const id of plan.fixedDeletes) {
    await fixedRepo.remove(id)
    changed += 1
  }
  for (const id of plan.txDeletes) {
    await txRepo.softDelete(id)
    changed += 1
  }

  return { changed: changed, summary: plan.summary }
}
