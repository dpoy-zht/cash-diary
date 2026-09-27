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
 *
 * ⚠️ 入参是**页面输入字段**（amountStr / categoryId / ts），不是数据库字段名。
 * 曾因为页面直接传 amount_cents / category_id / occurred_at 而静默失败（点击无反应），
 * 所以这里额外区分"用户没输"和"调用方字段名写错"，后者要能一眼看出来。
 */
export function buildTx(input) {
  const cents = parseAmountToCents(input.amountStr)
  if (!cents) {
    if (input.amountStr === undefined) {
      throw new Error('内部错误：缺少 amountStr（调用方应传页面输入，而不是数据库字段名）')
    }
    throw new Error('金额无效')
  }
  if (!input.categoryId) throw new Error('请选择分类')
  const now = Date.now()
  return {
    account_id: input.accountId,
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

/**
 * 把「记一笔」页面的输入整理成 buildTx 需要的 DTO。
 *
 * 单独抽出来是为了让"页面字段 → 服务字段"的映射**只存在一处**，并且能被单测覆盖 ——
 * 之前页面自己拼字段名拼成了数据库字段名，测试全绿但真机一点就炸。
 */
export function buildAddInput(input) {
  return {
    amountStr: input.amountText,
    categoryId: input.categoryId,
    type: input.type,
    note: input.note,
    ts: input.ts
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

export async function listByMonth(ym, accountId) {
  return txRepo.listByMonth(ym, accountId)
}

export async function monthSummary(ym, accountId) {
  return txRepo.monthSummary(ym, accountId)
}

/** 全量概览：累计笔数与收支、最早/最近一笔时间（账本页 / 我的页用） */
export async function overview(accountId) {
  return txRepo.overview(accountId)
}

/** 某时间点之后的流水时间戳（我的页算连续记账天数用） */
export async function recentTimestamps(sinceTs, accountId) {
  return txRepo.recentTimestamps(sinceTs, accountId)
}

/** 时间区间内的流水（趋势图用；按发生时间正序） */
export async function listByRange(startTs, endTs, accountId) {
  return txRepo.listByRange(startTs, endTs, accountId)
}
