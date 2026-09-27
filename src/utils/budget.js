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
