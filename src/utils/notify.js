/**
 * 系统通知（App 端本地通知，阶段 2 收尾项）。
 *
 * 能力边界（方案已与用户确认）：
 * - 本项目无服务器，做不了真正的离线推送；本地通知只在 App 进程活着时能发，
 *   定位是「用户打开过 App 之后的补充提醒」，与首页超支弹窗共用去重键。
 * - plus.push.createMessage 是 HTML5+ 的**本地通知**（不需要推送服务，Android 离线可用）。
 * - Android 13+ 通知是运行时权限，发之前先申请一次（申请过系统会记住，不重复弹）。
 * - H5 / 小程序端没有 plus：notifyLocal 直接返回 false，调用方保持原有应用内提示即可。
 */

/** 当前环境能不能发本地通知（H5 下恒为 false，页面据此走降级路径） */
export function notifySupported() {
  try {
    return typeof plus !== 'undefined' && !!plus.push && typeof plus.push.createMessage === 'function'
  } catch (e) {
    return false
  }
}

/** 「超支提醒」系统通知开关的存储键（me 页写入并展示，home 页发送通知前读取） */
export const REMIND_PREF_KEY = 'cashDiary.remind.enabled'

/* ---------------------------------------------------------------------------
   通知 payload（T4.1）：点击通知后据此决定跳到哪个页面。
   同一条 payload 由 notifyLocal 写入、由 listenPushClick 读回，两端必须一致，
   因此常量与路由表都放在本文件，改一处就改这一份。
   --------------------------------------------------------------------------- */
export const PAYLOAD_OVER_BUDGET = 'over-budget' // 超预算（首页触发）
export const PAYLOAD_DAILY = 'daily-remind' // 每日记账提醒
export const PAYLOAD_FIXED = 'fixed-due' // 固定支出缴费提醒

/** payload → 目标页面路由；未知 payload 返回空串（调用方不跳转） */
export const PUSH_ROUTES = {
  [PAYLOAD_OVER_BUDGET]: '/pages/budget/budget',
  [PAYLOAD_DAILY]: '/pages/add/add',
  [PAYLOAD_FIXED]: '/pages/fixed/fixed'
}

/**
 * payload 到路由的映射（纯函数，可单测）。
 * 每日提醒直达「记一笔」（提升打开率就是让它离记账只有一步）；
 * 缴费提醒去固定支出页（用户要看是哪一笔、要不要改配置）。
 */
export function pushRouteFor(payload) {
  return PUSH_ROUTES[String(payload == null ? '' : payload)] || ''
}

/**
 * 归一化提醒开关：**默认开启**（没存过 = 开）。
 * 只把明确的"关"值当关，其余一律视为开 —— 防止存储异常/脏数据把提醒静默关掉。
 * 纯函数可单测。
 */
export function normalizeRemindEnabled(raw) {
  return !(raw === false || raw === 0 || raw === '0' || raw === 'false')
}

/**
 * 申请 Android 13+ 的通知权限（POST_NOTIFICATIONS）。
 * - 非 Android / 低版本 / 无 plus 环境：直接返回 true（默认视为可用）。
 * - 每个启动周期最多调用一次真实申请（模块级守卫）；系统会记住用户的选择。
 * - 全程 try/catch：权限失败不阻塞主流程，最坏情况是通知发不出来（静默）。
 */
let permRequested = false
export function requestNotifyPermission() {
  try {
    if (typeof plus === 'undefined' || !plus.os || !plus.android) return true
    if (plus.os.name !== 'Android') return true
    const major = parseInt(plus.os.version, 10)
    if (!(major >= 13)) return true
    if (permRequested) return true
    permRequested = true
    plus.android.requestPermissions(
      ['android.permission.POST_NOTIFICATIONS'],
      function () { /* 用户允许或已授予，无需处理 */ },
      function () { /* 用户拒绝：保持静默，通知可能发不出来，不阻塞页面 */ }
    )
    return true
  } catch (e) {
    return false
  }
}

/**
 * 发一条本地系统通知。App 端返回 true；其他端 / 异常返回 false（调用方无需兜底提示，
 * 因为通知永远与应用内提醒同时出现，用户至少能看到应用内的那份）。
 *
 * @param {string} title 通知标题
 * @param {string} content 通知正文
 * @param {string} [payload] 点击后用于路由的标记（见 PAYLOAD_* / pushRouteFor）；
 *   不传保持历史行为 'over-budget'，老调用点（首页超支）无需改动。
 */
export function notifyLocal(title, content, payload) {
  try {
    if (!notifySupported()) return false
    const opts = { cover: false }
    if (title) opts.title = String(title)
    const tag = payload == null ? PAYLOAD_OVER_BUDGET : String(payload)
    plus.push.createMessage(String(content || ''), tag, opts)
    return true
  } catch (e) {
    return false
  }
}

/**
 * 清空通知栏（重置数据时调用）：
 * 本地通知不会自动过期，重置后残留的「超预算」通知会误导用户以为又超支了。
 * 仅 App 端有效，其他端 no-op。
 */
export function clearNotifyTray() {
  try {
    if (typeof plus === 'undefined' || !plus.push || typeof plus.push.clear !== 'function') return false
    plus.push.clear()
    return true
  } catch (e) {
    return false
  }
}

/**
 * 监听系统通知的点击（仅 App 端）。
 * 点击本地通知会唤醒/前置 App，payload 由 notifyLocal 写入（如 'over-budget'），
 * 调用方据此决定跳转到哪个页面。回调异常内部消化，绝不让通知点击把 App 搞崩。
 * @returns {boolean} 是否成功注册监听
 */
export function listenPushClick(handler) {
  try {
    if (typeof plus === 'undefined' || !plus.push || typeof plus.push.addEventListener !== 'function') {
      return false
    }
    plus.push.addEventListener('click', function (msg) {
      try {
        const payload = msg && msg.payload
        if (typeof handler === 'function') handler(payload)
      } catch (e) { /* 回调异常不外抛 */ }
    }, false)
    return true
  } catch (e) {
    return false
  }
}

/**
 * 轻触反馈：App 端设备振动，H5 走浏览器 Vibration API，都不支持时静默。
 * 用于记账键盘按键、保存成功等需要"确认感"的瞬间。
 * @param {number} [ms] 振动时长毫秒，默认 15
 * @returns {boolean} 是否实际触发了振动
 */
export function haptic(ms) {
  const t = Math.max(1, Math.floor(Number(ms) || 15))
  try {
    if (typeof plus !== 'undefined' && plus.device && typeof plus.device.vibrate === 'function') {
      plus.device.vibrate(t)
      return true
    }
  } catch (e) { /* 继续尝试浏览器通道 */ }
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(t)
      return true
    }
  } catch (e) { /* 都不支持就静默 */ }
  return false
}
