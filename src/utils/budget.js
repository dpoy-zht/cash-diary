/**
 * 预算判断（纯函数，方便单测）。
 *
 * 语义约定：
 * - 不设预算（limitCents = 0）= "没打算管"，不算超支，也不提示
 * - 已花 ≥ 限额 → over（真超支）
 * - 已花 ≥ 80% 限额 → warn（快超了）
 * - 其余 → safe
 */

/** 提醒阈值：花到限额的 80% 就该提醒一句 */
export const WARN_RATIO = 0.8

/**
 * 按**分类子树**汇总支出（纯函数）。
 *
 * 为什么必须有它：两级分类下，用户可能给一级「餐饮」设预算、却天天记在二级「早餐」上。
 * 如果只按 `category_id` 精确匹配，餐饮的已花会永远是 0、预算形同虚设。
 * 所以一级的已花必须**把挂在它下面的二级流水也算进来**。
 *
 * 返回的 Map 里，每个分类 id（无论一级还是二级）都有值：
 * - 二级 = 它自己的直接合计
 * - 一级 = 自己的直接合计 + 所有直接子级的合计
 *
 * 只处理两层（结构上也只有两层）。`parent_id` 指向不存在的分类时静默忽略。
 *
 * @param {Array} records 流水（含 type / category_id / amount_cents）
 * @param {Array} categories 分类表（含 id / parent_id）
 * @returns {Map<number, number>} 分类 id → 子树支出合计（分）
 */
export function spentBySubtree(records, categories) {
  const direct = new Map()
  for (const r of (Array.isArray(records) ? records : [])) {
    if (!r || r.type !== 'expense') continue
    const id = Number(r.category_id)
    if (!Number.isFinite(id)) continue
    direct.set(id, (direct.get(id) || 0) + (Number(r.amount_cents) || 0))
  }
  const out = new Map(direct)
  const cats = Array.isArray(categories) ? categories : []
  for (const c of cats) {
    if (!c || c.parent_id == null) continue
    const mine = out.get(Number(c.id)) || 0
    if (!mine) continue
    const pid = Number(c.parent_id)
    out.set(pid, (out.get(pid) || 0) + mine)
  }
  return out
}

/**
 * @param {number} limitCents 预算（分），0 表示未设置
 * @param {number} spentCents 已花（分）
 * @returns {{hasLimit:boolean, limitCents:number, spentCents:number, remainCents:number, ratio:number, level:'none'|'safe'|'warn'|'over'}}
 */
export function budgetStatus(limitCents, spentCents) {
  const limit = Math.max(0, Math.floor(Number(limitCents) || 0))
  const spent = Math.max(0, Math.floor(Number(spentCents) || 0))

  if (!limit) {
    return {
      hasLimit: false,
      limitCents: 0,
      spentCents: spent,
      remainCents: 0,
      ratio: 0,
      level: 'none'
    }
  }

  const ratio = spent / limit
  let level = 'safe'
  if (spent >= limit) level = 'over'
  else if (ratio >= WARN_RATIO) level = 'warn'

  return {
    hasLimit: true,
    limitCents: limit,
    spentCents: spent,
    remainCents: limit - spent,
    ratio: ratio,
    level: level
  }
}

/**
 * 进度条宽度百分比（0–100，超出也封顶 100）。
 */
export function progressPercent(limitCents, spentCents) {
  const limit = Math.max(0, Math.floor(Number(limitCents) || 0))
  if (!limit) return 0
  const spent = Math.max(0, Math.floor(Number(spentCents) || 0))
  return Math.min(100, Math.round((spent / limit) * 100))
}

/**
 * 超支时的一句人话（页面直接用，避免各处自己拼）。
 * 未超支返回空串。
 */
export function overText(limitCents, spentCents) {
  const s = budgetStatus(limitCents, spentCents)
  if (s.level !== 'over') return ''
  return '超支了 ¥' + (Math.abs(s.remainCents) / 100).toFixed(2)
}

/**
 * 超支提醒的去重键：每账本每月最多提醒一次。
 * 应用内弹窗与系统通知共用同一个键 —— 弹过（发过）就都不再来第二次。
 * 纯函数方便单测；格式变更 = 老用户会收到一次重复提醒，别随手改。
 */
export function overAlertKey(ym, accountId) {
  const y = /^\d{4}-\d{2}$/.test(String(ym || '')) ? String(ym) : 'unknown'
  const a = Math.max(1, Math.floor(Number(accountId) || 1))
  return 'cashDiary.overAlerted.' + y + '.' + a
}

/** 去重键前缀（与 overAlertKey 保持一致，勿单独改动） */
export const OVER_ALERT_PREFIX = 'cashDiary.overAlerted.'

/**
 * 从一批 storage 键里挑出"超支提醒去重键"，供「重置数据」清除用。
 * 重置 = 全新的账本，去重键必须跟着失效，否则重置后的新超支会被误判为已提醒过。
 * 纯函数可单测；uni.getStorageInfoSync 的枚举在 maintenance.js 里做（有平台差异）。
 */
export function pickOverAlertKeys(allKeys) {
  const list = Array.isArray(allKeys) ? allKeys : []
  return list.filter(function (k) {
    return typeof k === 'string' && k.indexOf(OVER_ALERT_PREFIX) === 0
  })
}
