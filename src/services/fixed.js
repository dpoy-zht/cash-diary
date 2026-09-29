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

/* ---------------- 补记日期计算（纯函数，可单测） ---------------- */

/** 'YYYY-MM' → [year, month]；非法返回 null */
function parseYm(ym) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(ym || ''))
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  return (mo >= 1 && mo <= 12) ? [y, mo] : null
}

/** 某月的下一个月，'YYYY-MM' → 'YYYY-MM'（非法输入返回空串） */
export function nextYm(ym) {
  const p = parseYm(ym)
  if (!p) return ''
  return p[1] === 12 ? (p[0] + 1) + '-01' : p[0] + '-' + String(p[1] + 1).padStart(2, '0')
}

/**
 * 目标月应记的时间戳：该月 day 号的**本地 12:00**（中性时刻，避免蹭到月首月末边界）。
 * day 超出该月天数时钳制到月末（配置限 1~28，但备份恢复可能带进 29~31，兜底处理）。
 */
export function postTsFor(ym, day) {
  const p = parseYm(ym)
  if (!p) return null
  const lastDay = new Date(p[0], p[1], 0).getDate()
  const d = Math.min(Math.max(1, Math.floor(Number(day) || 1)), lastDay)
  return new Date(p[0], p[1] - 1, d, 12, 0, 0, 0).getTime()
}

/**
 * 应补记的月份列表（'YYYY-MM' 数组）：从 last_posted_ym 的**下一个月**起逐月补到当前月。
 * - last_posted 为空 / 非法 → 只补当前月（首次启用不倒灌无限历史）
 * - last_posted ≥ 当前月 → 空数组（设备时钟回拨时随 last_posted_ym 更新自我修复）
 * - 最多回看 60 个月，防御异常 last_posted_ym 把账目灌爆
 */
export function missedMonths(lastPostedYm, currentYm) {
  const cur = parseYm(currentYm)
  if (!cur) return []
  const curKey = cur[0] + '-' + String(cur[1]).padStart(2, '0')
  if (!parseYm(lastPostedYm)) return [curKey]
  const out = []
  let cursor = nextYm(lastPostedYm)
  while (cursor && cursor <= curKey && out.length < 60) {
    out.push(cursor)
    cursor = nextYm(cursor)
  }
  return out
}

/**
 * 补记到期的固定支出（**核心入口**，首页 onShow 调用）。
 *
 * 日期口径（T2.3）：每笔补记的 occurred_at = **应记月份的 day_of_month 号本地 12:00**，
 * 不是"打开 App 的此刻"——月中/跨月未打开时，账必须落在它应属的月份；
 * 跨了 N 个月就补 N 笔（从 last_posted_ym 的下一个月起逐月补），不让任何月份永久缺失。
 * 全部补完后 last_posted_ym 一次性更新为当前月。
 */
export async function postDueFixed(accountId, nowTs) {
  const now = nowTs == null ? Date.now() : nowTs
  const ym = ymOf(now)
  const list = await fixedRepo.list(accountId)
  const due = dueFixedExpenses(list, ym)
  const items = []
  for (const f of due) {
    const months = missedMonths(f.last_posted_ym, ym)
    for (const m of months) {
      await txRepo.insert({
        account_id: accountId,
        category_id: f.category_id,
        type: 'expense',
        amount_cents: f.amount_cents,
        note: f.note || '',
        occurred_at: postTsFor(m, f.day_of_month),
        created_at: now,
        updated_at: now,
        deleted_at: null
      })
      items.push({
        id: f.id,
        category_id: f.category_id,
        amount_cents: f.amount_cents,
        note: f.note || '',
        ym: m
      })
    }
    await fixedRepo.update(f.id, { last_posted_ym: ym })
  }
  return { posted: items.length, items: items }
}
