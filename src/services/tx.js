/**
 * 记账业务层：校验 + 构造记录（纯函数可单测）+ 编排落库。
 * 页面/Store 不得直接构造记录对象，必须经此层。
 */
import * as txRepo from '../db/repository/tx.js'
import { parseAmountToCents } from '../utils/money.js'

/**
 * 构造一条待入库流水。校验失败抛错：
 * - 金额必须能解析为正整数分
 * - 分类必选
 */
export function buildTx(input) {
  const cents = parseAmountToCents(input.amountStr)
  if (!cents) throw new Error('金额无效')
  if (!input.categoryId) throw new Error('请选择分类')
  const now = Date.now()
  return {
    category_id: input.categoryId,
    type: input.type,
    amount_cents: cents,
    note: (input.note || '').trim(),
    occurred_at: input.ts || now,
    created_at: now,
    updated_at: now,
    deleted_at: null
  }
}

/** 编辑补丁：只更新传入字段；金额/分类校验同新增 */
export function buildPatch(input) {
  const patch = {}
  if (input.amountStr !== undefined) {
    const cents = parseAmountToCents(input.amountStr)
    if (!cents) throw new Error('金额无效')
    patch.amount_cents = cents
  }
  if (input.categoryId !== undefined) {
    if (!input.categoryId) throw new Error('请选择分类')
    patch.category_id = input.categoryId
  }
  if (input.note !== undefined) patch.note = (input.note || '').trim()
  if (input.type !== undefined) patch.type = input.type
  if (Object.keys(patch).length) patch.updated_at = Date.now()
  return patch
}

export async function addTx(input) {
  const rec = buildTx(input)
  await txRepo.insert(rec)
}

export async function updateTx(id, input) {
  const patch = buildPatch(input)
  if (Object.keys(patch).length) await txRepo.update(id, patch)
}

export async function removeTx(id) {
  await txRepo.softDelete(id)
}

export async function listByMonth(ym) {
  return txRepo.listByMonth(ym)
}

export async function monthSummary(ym) {
  return txRepo.monthSummary(ym)
}

/** 全量概览：累计笔数与收支、最早/最近一笔时间（账本页用） */
export async function overview() {
  return txRepo.overview()
}

/** 某时间点之后的流水时间戳（我的页算连续记账天数用） */
export async function recentTimestamps(sinceTs) {
  return txRepo.recentTimestamps(sinceTs)
}
