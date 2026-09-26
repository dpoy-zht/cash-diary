/**
 * 流水仓储：唯一持有流水 SQL/存储语义的地方。
 * SQLite 返回的字段值可能是字符串，统一在此归一化为正确类型。
 */
import { getStorage } from '../index.js'
import { monthRange } from '../../utils/date.js'

function normalizeTx(row) {
  return {
    id: Number(row.id),
    category_id: Number(row.category_id),
    type: row.type,
    amount_cents: Number(row.amount_cents),
    note: row.note || '',
    occurred_at: Number(row.occurred_at),
    created_at: Number(row.created_at),
    updated_at: Number(row.updated_at),
    deleted_at: row.deleted_at == null ? null : Number(row.deleted_at)
  }
}

function rangeOf(ym) {
  const parts = ym.split('-').map(Number)
  return monthRange(parts[0], parts[1])
}

/** 当月份有效流水（软删除 excluded），按发生时间倒序 */
export async function listByMonth(ym) {
  const [start, end] = rangeOf(ym)
  const rows = await getStorage().txListByMonth(start, end)
  return rows.map(normalizeTx)
}

/** 当月 { expenseCents, incomeCents } —— 由存储层 SUM 聚合，绝不在 JS 循环累加 */
export async function monthSummary(ym) {
  const [start, end] = rangeOf(ym)
  const rows = await getStorage().txMonthSummary(start, end)
  const summary = { expenseCents: 0, incomeCents: 0 }
  rows.forEach(function (r) {
    if (r.type === 'expense') summary.expenseCents = Number(r.total)
    else if (r.type === 'income') summary.incomeCents = Number(r.total)
  })
  return summary
}

export async function insert(rec) {
  return getStorage().txInsert(rec)
}

export async function update(id, patch) {
  return getStorage().txUpdate(id, patch)
}

export async function softDelete(id) {
  return getStorage().txSoftDelete(id)
}

/**
 * 全量概览（未删除）：笔数 / 累计收支 / 最早与最近一笔的时间。
 * 空库时笔数与金额为 0，时间为 null。
 */
export async function overview() {
  const row = await getStorage().txOverview()
  function num(v) {
    return v == null ? 0 : Number(v)
  }
  return {
    totalCount: num(row.c),
    incomeCents: num(row.inc),
    expenseCents: num(row.exp),
    firstAt: row.firstAt == null ? null : Number(row.firstAt),
    lastAt: row.lastAt == null ? null : Number(row.lastAt)
  }
}
