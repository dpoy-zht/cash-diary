/**
 * 标签仓储（T5.1，v6 新表）。
 * 与其他仓储同一规矩：方法签名在 sqlite / memory 两适配器间严格一致。
 *
 * 这里只做「取数 + 形状归一化」，业务规则（重名拒绝、上限、被引用不许删）
 * 一律留在 services/tag.js —— 仓储不做判断，否则两个适配器要各写一份规则。
 */
import { getStorage } from '../index.js'
import { aid } from '../../utils/constant.js'

function normalizeTag(row) {
  return {
    id: Number(row.id),
    account_id: aid(Number(row.account_id)),
    name: row.name || '',
    color: row.color || '',
    sort: Number(row.sort) || 0,
    created_at: Number(row.created_at) || 0,
    updated_at: Number(row.updated_at) || 0
  }
}

/** 当前账本的标签（按 sort、id 升序） */
export async function list(accountId) {
  const rows = await getStorage().tagList(aid(accountId))
  return rows.map(normalizeTag)
}

export async function insert(rec) {
  return getStorage().tagInsert({
    account_id: aid(rec.account_id),
    name: rec.name,
    color: rec.color || '',
    sort: Number(rec.sort) || 0,
    created_at: Number(rec.created_at),
    updated_at: Number(rec.updated_at)
  })
}

export async function update(id, patch) {
  const clean = {}
  if (patch && patch.name !== undefined) clean.name = patch.name
  if (patch && patch.color !== undefined) clean.color = patch.color
  if (patch && patch.sort !== undefined) clean.sort = Number(patch.sort) || 0
  if (patch && patch.updated_at !== undefined) clean.updated_at = Number(patch.updated_at)
  if (!Object.keys(clean).length) return
  return getStorage().tagUpdate(Number(id), clean)
}

/** 删标签（连同关联）。调用方必须先用 refCount 确认没有流水在引用 */
export async function remove(id) {
  return getStorage().tagDelete(Number(id))
}

/** 被多少笔未删除的流水引用 */
export async function refCount(tagId) {
  return getStorage().tagRefCount(Number(tagId))
}

/** 一次拿到本账本每个标签的引用笔数：{ [tagId]: count }（标签管理页用，避免逐个查） */
export async function usageCounts(accountId) {
  const rows = await getStorage().tagUsageCounts(aid(accountId))
  const map = {}
  ;(rows || []).forEach(function (r) {
    map[Number(r.tag_id)] = Number(r.c) || 0
  })
  return map
}

/** 覆写一笔流水的标签集合 */
export async function setTagsForTx(txId, tagIds) {
  return getStorage().txTagSetForTx(Number(txId), tagIds)
}

/** 一批流水的标签关联（原始行，交给 utils/tag.groupTagIdsByTx 分组） */
export async function tagRowsByTxs(txIds) {
  return getStorage().txTagRowsByTxs(txIds)
}
