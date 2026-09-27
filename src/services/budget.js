/**
 * 预算业务层：读取（总预算 + 各分类预算）与设置。
 *
 * 约定：
 * - 预算按账本存（多账本各自独立）
 * - 输入统一走 parseAmountToCents（与记账同一套校验：只能是正的两位小数）
 * - 输入空/0 视为**清除**该条预算（"不设预算"是合法状态，不该拦着用户）
 */
import * as budgetRepo from '../db/repository/budget.js'
import { parseAmountToCents } from '../utils/money.js'

/** 总预算的 category_id 用 null 表示 */
export const TOTAL_CATEGORY_ID = null

/**
 * 取某账本的全部预算。
 * @returns {{totalCents:number, byCategory:Object<string,number>}}
 */
export async function getAll(accountId) {
  const rows = await budgetRepo.listByAccount(accountId)
  const out = { totalCents: 0, byCategory: {} }
  rows.forEach(function (r) {
    if (r.category_id == null) out.totalCents = r.limit_cents
    else out.byCategory[String(r.category_id)] = r.limit_cents
  })
  return out
}

/** 解析用户输入的金额字符串；返回 0 表示"清除" */
function parseLimit(amountStr) {
  const raw = String(amountStr == null ? '' : amountStr).trim()
  if (!raw) return 0
  // 「0」= 取消预算。注意 0 作为**记账金额**是无效的（不能记 0 元的账），
  // 但对预算来说是合法语义，所以要在走 parseAmountToCents 之前先拦下来。
  if (/^0+(\.0*)?$/.test(raw)) return 0
  const cents = parseAmountToCents(raw)
  if (!cents) throw new Error('金额无效')
  return cents
}

/** 设置/清除总预算 */
export async function setTotal(accountId, amountStr) {
  const cents = parseLimit(amountStr)
  if (!cents) {
    await budgetRepo.remove(accountId, TOTAL_CATEGORY_ID)
    return 0
  }
  await budgetRepo.upsert(accountId, TOTAL_CATEGORY_ID, cents)
  return cents
}

/** 设置/清除某个分类的预算 */
export async function setCategory(accountId, categoryId, amountStr) {
  if (!categoryId) throw new Error('请选择分类')
  const cents = parseLimit(amountStr)
  if (!cents) {
    await budgetRepo.remove(accountId, categoryId)
    return 0
  }
  await budgetRepo.upsert(accountId, categoryId, cents)
  return cents
}
