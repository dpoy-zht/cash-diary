/**
 * 固定支出业务层：每月固定要记的账（房租 / 会员费 / 视频网站……）。
 *
 * 工作方式（「打开 App 时补记」方案，无需后台推送）：
 * - 用户配置：分类 + 金额 + 每月几号（1~28）+ 备注
 * - App 启动 / 回首页时调用 postDueFixed()：
 *   当月还没记过的（last_posted_ym !== 当前月）就自动补记一笔支出，
 *   然后把 last_posted_ym 更新为当月 —— 同一个月内绝不会重复记
 * - 创建配置时 last_posted_ym 直接置为当前月：**从下个月开始自动记账**，
 *   避免月中添加时把用户已经手动记过的账再补一遍
 */
import * as fixedRepo from '../db/repository/fixed.js'
import * as txRepo from '../db/repository/tx.js'
import { parseAmountToCents } from '../utils/money.js'
import { ymOf } from '../utils/date.js'

/** 是否到期该补记：启用中，且本月还没记过 */
export function isDue(f, ym) {
  return !!f && !!f.enabled && String(f.last_posted_ym || '') !== String(ym)
}

/** 从一批配置里挑出到期的（顺序保持传入顺序） */
export function dueFixedExpenses(list, ym) {
  return (Array.isArray(list) ? list : []).filter(function (f) { return isDue(f, ym) })
}

/** 当前账本的配置列表 */
export async function listFixed(accountId) {
  return fixedRepo.list(accountId)
}

/**
 * 新增配置。校验失败抛错（人话）。
 * 金额传 amountStr（页面输入），内部转整数分；记账日限 1~28。
 */
export async function addFixed(input, accountId, nowTs) {
  const cents = parseAmountToCents(input && input.amountStr)
  if (!cents) throw new Error('金额无效')
  const day = Math.floor(Number(input && input.dayOfMonth))
  if (!(day >= 1 && day <= 28)) throw new Error('记账日要选 1~28 号（29~31 号有些月份没有）')
  if (!input.categoryId) throw new Error('选一个分类嘛~')
  const now = nowTs == null ? Date.now() : nowTs
  return fixedRepo.insert({
    category_id: input.categoryId,
    amount_cents: cents,
    note: String(input.note || '').trim(),
    day_of_month: day,
    // 置为当前月：本月不自动补记（避免与用户已手动记的重复），下月开始生效
    last_posted_ym: ymOf(now),
    enabled: true,
    created_at: now,
    updated_at: now
  }, accountId)
}

/** 修改：只接受显式传入的字段 */
export async function updateFixed(id, patch) {
  const p = {}
  if (patch.amountStr !== undefined) {
    const cents = parseAmountToCents(patch.amountStr)
    if (!cents) throw new Error('金额无效')
    p.amount_cents = cents
  }
  if (patch.dayOfMonth !== undefined) {
    const day = Math.floor(Number(patch.dayOfMonth))
    if (!(day >= 1 && day <= 28)) throw new Error('记账日要选 1~28 号')
    p.day_of_month = day
  }
  if (patch.categoryId !== undefined) {
    if (!patch.categoryId) throw new Error('分类不能为空')
    p.category_id = patch.categoryId
  }
  if (patch.note !== undefined) p.note = String(patch.note).trim()
  if (patch.enabled !== undefined) p.enabled = !!patch.enabled
  await fixedRepo.update(id, p)
}

export async function removeFixed(id) {
  await fixedRepo.remove(id)
}

export async function toggleFixed(id, enabled) {
  await fixedRepo.update(id, { enabled: !!enabled })
}

/**
 * 补记当月到期的固定支出（**核心入口**，首页 onShow 调用）。
 * 每个到期配置补一笔支出（occurred_at = 当前时刻），并把 last_posted_ym 更新为当月。
 *
 * @param {number} accountId 当前账本
 * @param {number} [nowTs] 当前时间（测试注入用）
 * @returns {Promise<{posted:number, items:Array<{id:number, category_id:number, amount_cents:number, note:string}>}>}
 */
export async function postDueFixed(accountId, nowTs) {
  const now = nowTs == null ? Date.now() : nowTs
  const ym = ymOf(now)
  const list = await fixedRepo.list(accountId)
  const due = dueFixedExpenses(list, ym)
  const items = []
  for (const f of due) {
    await txRepo.insert({
      account_id: accountId,
      category_id: f.category_id,
      type: 'expense',
      amount_cents: f.amount_cents,
      note: f.note || '',
      occurred_at: now,
      created_at: now,
      updated_at: now,
      deleted_at: null
    })
    await fixedRepo.update(f.id, { last_posted_ym: ym })
    items.push({
      id: f.id,
      category_id: f.category_id,
      amount_cents: f.amount_cents,
      note: f.note || ''
    })
  }
  return { posted: items.length, items: items }
}
