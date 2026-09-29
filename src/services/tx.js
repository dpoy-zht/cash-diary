/**
 * 记账业务层：校验 + 构造记录（纯函数可单测）+ 编排落库。
 * 页面/Store 不得直接构造记录对象，必须经此层。
 */
import * as txRepo from '../db/repository/tx.js'
import * as categoryRepo from '../db/repository/category.js'
import { parseAmountToCents } from '../utils/money.js'
import { replaceDateKeepTime } from '../utils/date.js'
import { normalizeFilters, hasAnyFilter } from '../utils/search.js'

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
  if (input.ts !== undefined) patch.occurred_at = Number(input.ts)
  if (Object.keys(patch).length) patch.updated_at = Date.now()
  return patch
}

/**
 * 编辑弹层的输入（页面字段）→ buildPatch 需要的 DTO。
 *
 * 与 buildAddInput 同思路：字段映射只存在一处，页面不自己拼时间戳。
 * 差别在日期：编辑是"改已有记录的日期"，必须保留原记录的时/分/秒（见 replaceDateKeepTime），
 * 不传 dateStr 时不改发生时间。
 *
 * @param {{ amountStr:*, categoryId:*, note?:string, type?:string, dateStr?:string }} input
 * @param {number} originalTs 被编辑记录的原始 occurred_at
 * @returns {{ amountStr:*, categoryId:*, note:*, type:*, ts?:number }}
 */
export function buildEditInput(input, originalTs) {
  const src = input || {}
  const out = {
    amountStr: src.amountStr,
    categoryId: src.categoryId,
    note: src.note,
    type: src.type
  }
  if (src.dateStr) out.ts = replaceDateKeepTime(originalTs, src.dateStr)
  return out
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

/** 搜索返回条数上限（防止关键词太短时撑爆列表） */
export const SEARCH_LIMIT = 100

/**
 * 流水搜索：关键词命中**备注**或**分类名**（都不区分大小写），
 * 叠加可选筛选（T4.3：类型 / 分类多选 / 金额区间 / 日期区间）。
 * 跨所有月份，按发生时间倒序，上限 SEARCH_LIMIT 条。
 *
 * - 关键词与筛选可以只用其一：只给筛选（不输关键词）也要能查
 * - 两者都没有才返回空数组（避免无意中做全表扫描）
 * - 分类名命中转成分类 id 交给存储层查，SQLite 端一条 SQL 完成，不把全表捞到 JS
 * - 筛选条件在这里经 normalizeFilters 归一化：**存储层拿到的永远是规整对象**，
 *   两个适配器因此不需要各自再做一遍脏值防御
 */
export async function search(keyword, accountId, filters) {
  const kw = String(keyword == null ? '' : keyword).trim()
  const f = normalizeFilters(filters)
  if (!kw && !hasAnyFilter(f)) return []
  let ids = []
  if (kw) {
    const lower = kw.toLowerCase()
    const cats = await categoryRepo.listAll()
    ids = cats
      .filter(function (c) { return c.name && String(c.name).toLowerCase().indexOf(lower) !== -1 })
      .map(function (c) { return c.id })
  }
  return txRepo.search(kw, ids, accountId, SEARCH_LIMIT, f)
}
