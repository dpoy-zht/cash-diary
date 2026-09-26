/**
 * 账本业务层：默认账本种子、列表（带统计）、新建/改名/删除。
 *
 * 设计口径：
 * - **默认账本 id 恒为 1**（流水表 account_id 的 DEFAULT 也是 1），
 *   老数据在迁移时自动落到它名下，因此不需要清库。
 * - 删除账本**不删流水**：只有"一笔记录都没有"的账本才允许删，
 *   避免误删数据（宁可让用户先去处理记录）。
 */
import * as accountRepo from '../db/repository/account.js'
import { DEFAULT_ACCOUNT_ID } from '../utils/constant.js'

export const DEFAULT_ACCOUNT_NAME = '日常账本'

/** 幂等：没有任何账本时写入默认账本（两个适配器都走这里，逻辑一致）。
    显式指定 id = DEFAULT_ACCOUNT_ID，保证"默认账本 id 恒为 1"这条口径在两个适配器上一致。 */
export async function seedDefaultIfEmpty() {
  const n = await accountRepo.count()
  if (n > 0) return
  await accountRepo.insert({
    id: DEFAULT_ACCOUNT_ID,
    name: DEFAULT_ACCOUNT_NAME,
    created_at: Date.now()
  })
}

/**
 * 账本列表 + 每个账本的统计（笔数 / 累计收支 / 结余 / 最近一笔时间）。
 * 没有任何记录的账本，统计为 0 值。
 */
export async function listWithStats() {
  const [list, stats] = await Promise.all([accountRepo.listAll(), accountRepo.statsMap()])
  return list.map(function (a) {
    const s = stats.get(a.id) || { count: 0, incomeCents: 0, expenseCents: 0, lastAt: null }
    return {
      id: a.id,
      name: a.name,
      created_at: a.created_at,
      count: s.count,
      incomeCents: s.incomeCents,
      expenseCents: s.expenseCents,
      balanceCents: s.incomeCents - s.expenseCents,
      lastAt: s.lastAt
    }
  })
}

function cleanName(name) {
  const n = String(name == null ? '' : name).trim()
  if (!n) throw new Error('账本名字不能为空')
  if (n.length > 12) throw new Error('账本名字最多 12 个字')
  return n
}

export async function create(name) {
  const n = cleanName(name)
  return accountRepo.insert({ name: n, created_at: Date.now() })
}

export async function rename(id, name) {
  const n = cleanName(name)
  await accountRepo.rename(id, n)
}

/** 只允许删除空账本；有记录时抛错并说明还有多少笔 */
export async function removeIfEmpty(id) {
  const stats = await accountRepo.statsMap()
  const s = stats.get(Number(id))
  if (s && s.count > 0) {
    throw new Error('这个账本里还有 ' + s.count + ' 笔记录，先处理掉再删')
  }
  await accountRepo.remove(id)
}
