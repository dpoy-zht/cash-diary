/**
 * 吸顶导航的"档位"判定。
 *
 * 为什么单独抽出来：档位判定是纯逻辑（支持性 + 无障碍偏好 + 硬件信号 + 实测帧率），
 * 与 uni-app / DOM 无关，抽成纯函数就能在 vitest 里把所有分支跑一遍——
 * 这类"降级逻辑"最怕的就是某个分支永远没被测到、上线才发现退不回去。
 *
 * 两档：
 *   SOLID 不透明纯色 —— 永远可读的保底档，也是所有降级路径的终点
 *   BLUR  半透明 + backdrop blur —— 仅在全部条件满足时启用
 */

export const NAV_TIER = {
  BLUR: 'blur',
  SOLID: 'solid'
}

/** 帧间隔阈值(ms)：p75 超过它就认为这台机器吃不住毛玻璃。28ms ≈ 36fps */
export const FRAME_BUDGET_MS = 28

/**
 * 取分位数（p ∈ [0,1]）。不要求入参有序。
 * 用 p75 而不是平均值：一次偶发卡顿不该把整台机器判成低端。
 * @returns {number|null} 样本为空时返回 null
 */
export function percentile(samples, p) {
  if (!Array.isArray(samples) || samples.length === 0) return null
  const sorted = samples.slice().sort(function (a, b) { return a - b })
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)))
  return sorted[idx]
}

/**
 * 帧间隔样本是否可接受。
 * 样本不足时返回 true —— "证据不够"不等于"有问题"，不该据此降级。
 */
export function isFrameBudgetOk(samples, budget) {
  const p75 = percentile(samples, 0.75)
  if (p75 == null) return true
  return p75 <= (budget || FRAME_BUDGET_MS)
}

/**
 * 极低端机的静态信号。
 * 阈值刻意取很保守（≤2 核 或 ≤2GB）：只用来"先别开"，避免把中端机误伤成纯色。
 * 真正拿主意的是滚动时的实测帧率。
 */
export function isLowEndHint(hardwareConcurrency, deviceMemory) {
  const cores = typeof hardwareConcurrency === 'number' ? hardwareConcurrency : 8
  const mem = typeof deviceMemory === 'number' ? deviceMemory : 4
  return cores <= 2 || mem <= 2
}

/**
 * 决定导航采用哪一档。
 *
 * 判定顺序（自上而下，命中即返回）：
 *   1. 用户/记忆显式指定 → 听它的
 *   2. 不支持 backdrop-filter → 纯色
 *   3. 系统开了「减弱透明度」→ 纯色
 *   4. 硬件信号过弱 → 纯色
 *   5. 实测帧率不达标 → 纯色
 *   6. 以上全过 → 毛玻璃
 *
 * @param {object} input
 * @param {'auto'|'blur'|'solid'} [input.pref]
 * @param {boolean} [input.supportsBlur]
 * @param {boolean} [input.reduceTransparency]
 * @param {boolean} [input.lowEnd]
 * @param {boolean} [input.perfOk]  滚动实测是否达标（未测时传 true）
 * @returns {'blur'|'solid'}
 */
export function decideNavTier(input) {
  const o = input || {}
  if (o.pref === 'solid') return NAV_TIER.SOLID
  if (o.pref === 'blur') return NAV_TIER.BLUR
  if (!o.supportsBlur) return NAV_TIER.SOLID
  if (o.reduceTransparency) return NAV_TIER.SOLID
  if (o.lowEnd) return NAV_TIER.SOLID
  if (o.perfOk === false) return NAV_TIER.SOLID
  return NAV_TIER.BLUR
}

/* ==========================================================================
   运行时探测：需要浏览器/uni 环境，故与上面的纯逻辑分开。
   ========================================================================== */

/** 档位偏好的持久化键（'auto' / 'blur' / 'solid'） */
export const NAV_PREF_KEY = 'cashDiary.navTier.pref'
/** 实测降级记忆：一旦某台机器吃不住，就别让它每次重受一遍 */
export const NAV_PERF_KEY = 'cashDiary.navTier.perfOk'

/** 探测三项能力/偏好，任何一项取不到都按"不支持"处理，落到纯色档 */
export function detectCapability() {
  let supportsBlur = false
  let reduceTransparency = false
  let lowEnd = false

  try {
    supportsBlur = typeof CSS !== 'undefined' && !!CSS.supports &&
      (CSS.supports('backdrop-filter', 'blur(1px)') ||
        CSS.supports('-webkit-backdrop-filter', 'blur(1px)'))
  } catch (e) { /* 保守处理 */ }

  try {
    reduceTransparency = typeof matchMedia === 'function' &&
      matchMedia('(prefers-reduced-transparency: reduce)').matches
  } catch (e) { /* 保守处理 */ }

  try {
    lowEnd = isLowEndHint(
      typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : undefined,
      typeof navigator !== 'undefined' ? navigator.deviceMemory : undefined
    )
  } catch (e) { /* 保守处理 */ }

  return { supportsBlur: supportsBlur, reduceTransparency: reduceTransparency, lowEnd: lowEnd }
}

function safeGet(key) {
  try {
    return uni.getStorageSync(key)
  } catch (e) {
    return ''
  }
}

function safeSet(key, value) {
  try {
    uni.setStorageSync(key, value)
  } catch (e) { /* 存储不可用时忽略，本次会话仍然生效 */ }
}

export function loadNavPref() {
  const v = safeGet(NAV_PREF_KEY)
  return v === 'blur' || v === 'solid' ? v : 'auto'
}

export function saveNavPref(pref) {
  safeSet(NAV_PREF_KEY, pref)
}

/** 读取"上次实测吃不住"的记忆；读不到一律当作达标 */
export function loadPerfOk() {
  return safeGet(NAV_PERF_KEY) !== 'fail'
}

export function savePerfOk(ok) {
  safeSet(NAV_PERF_KEY, ok ? 'ok' : 'fail')
}

/** 清掉降级记忆（用户手动指定毛玻璃时调用） */
export function clearPerfMemory() {
  safeSet(NAV_PERF_KEY, 'ok')
}
