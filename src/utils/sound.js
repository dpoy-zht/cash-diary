/**
 * 记账音效引擎（批次 2，2026-10-06）。
 *
 * 职责：把「什么时候该响」与「怎么响」分开，让前者可单测、后者只在真机跑。
 *
 * ## 三条硬约束（对应需求）
 * 1. **首次交互后才播** —— 浏览器与 App 都禁止无用户手势的自动播放。
 *    实现 `armed` 门闩：首次 touchstart/click 时置 true；之前调用静默跳过、
 *    **不抛错不阻塞**（音效是增强，绝不能因为它让记账流程失败）。
 * 2. **可静音且持久化** —— 存储键 `cashDiary.sound.enabled`，默认 **开**
 *    （音效是加分项，用户主动关才是需求）。
 * 3. **单例池化** —— audioContext 建一次后常驻复用。**不要每次播放都新建**：
 *    反复创建会累积原生实例、拖慢启动，占内存。
 *
 * ## 为什么用 WAV 不用 MP3
 * 短音效（< 0.5s）WAV 可免解码、延迟最低；体积差对 15MB 的包可忽略。
 * 转 AMR 反而在 App 端兼容性更差。
 *
 * ## 为什么不引第三方库
 * 项目依赖为零，引入音效库要 +30~80KB，与"离线优先、极致轻量"定位冲突。
 * `uni.createInnerAudioContext()` 是内置能力，够用。
 */

/** 存储键：音效开关（默认开）。导出供测试断言，避免"改键名没人发现"。 */
export const ENABLED_KEY = 'cashDiary.sound.enabled'

/** 音量：记账 App 不该刺耳。导出供测试断言 —— 音量是产品决策，不该是隐形数字。 */
export const VOLUME = 0.6

/** 可用音效表。路径相对打包产物根，改名要同步这里。 */
export const SFX = Object.freeze({
  success: '/static/sfx/success.wav',
  del: '/static/sfx/delete.wav'
})

/* ---------------- 可单测的纯逻辑（不碰任何平台 API） ---------------- */

/** 静音开关读值。存储不可用时返回 true（默认开，别因存储故障关掉音效）。 */
export function isSoundEnabled(readStorage) {
  try {
    const v = readStorage()
    // 显式 false 才算关闭；undefined/null/0 之外的值都当开启
    return v === false || v === 'false' ? false : true
  } catch (e) {
    return true
  }
}

/**
 * 首次交互门闩的纯逻辑。
 * @param {boolean} armed 当前是否已就绪
 * @param {boolean} isFirstTouch 本次事件是否是首次用户交互
 * @returns {boolean} 新的 armed 状态
 */
export function nextArmed(armed, isFirstTouch) {
  return armed || isFirstTouch
}

/* ---------------- 平台相关（真机才跑，H5/测试环境下静默） ---------------- */

let ctx = null // 单例 audioContext
let armed = false // 首次交互前为 false
let listenersBound = false

/** 惰性创建 audioContext：只有真要播时才建，不占启动时间。 */
function ensureCtx() {
  if (ctx) return ctx
  if (typeof uni === 'undefined' || !uni.createInnerAudioContext) return null
  try {
    ctx = uni.createInnerAudioContext()
    ctx.volume = VOLUME
    return ctx
  } catch (e) {
    ctx = null
    return null
  }
}

/**
 * 绑定首次交互监听（只绑一次）。
 * 之后任何一次 touchstart/click 都会把 armed 置 true。
 */
export function armOnFirstInteraction() {
  if (listenersBound) return
  if (typeof document === 'undefined' || !document.addEventListener) return
  listenersBound = true
  const fire = function () { armed = true }
  // passive 避免在滚动时阻塞手势；capture 保证第一个被触发
  document.addEventListener('touchstart', fire, { passive: true, capture: true })
  document.addEventListener('click', fire, { passive: true, capture: true })
}

function readStorage() {
  if (typeof uni === 'undefined' || !uni.getStorageSync) return undefined
  return uni.getStorageSync(ENABLED_KEY)
}

/**
 * 播放一个音效。三重保护，任一不满足就**静默返回**：
 * 未交互过 / 用户静音 / 平台不支持（都直接 return，不抛错）
 *
 * @param {keyof typeof SFX} name
 * @param {{readStorage?: () => any}} [opts] 注入存储读取（单测用）
 * @returns {boolean} 是否真的尝试播放
 */
export function playSfx(name, opts) {
  try {
    if (!SFX[name]) return false
    if (!armed) return false // 未交互 → 静默跳过
    if (!isSoundEnabled((opts && opts.readStorage) || readStorage)) return false
    const c = ensureCtx()
    if (!c) return false
    c.stop() // 同一时刻只播一个，重播前先停
    c.src = SFX[name]
    c.play()
    return true
  } catch (e) {
    // 音效永远不能影响主流程
    return false
  }
}

/** 切换静音状态（供「我的」页开关调用），返回切换后的状态 */
export function toggleSound() {
  const next = !isSoundEnabled(readStorage)
  try {
    if (typeof uni !== 'undefined' && uni.setStorageSync) {
      uni.setStorageSync(ENABLED_KEY, next)
    }
  } catch (e) { /* 存不了就只在本次会话生效 */ }
  return next
}

/**
 * 强制置位 armed（不等真实交互）。
 *
 * 用在哪：「我的」页开启音效时立刻试听 —— 用户是从别的页进来的，
 * 可能还没发生过任何 touch/click，门闩还是关的，开启就听不到声音，
 * 会以为"开关没用"。这里在**用户主动点击开关**的前提下直接置位是安全的
 * （这次点击本身就是用户手势，符合自动播放策略）。
 */
export function armSound() {
  armed = true
}

/** 当前静音状态（供 UI 绑定） */
export function soundEnabled() {
  return isSoundEnabled(readStorage)
}

/** 仅测试用：重置模块内部状态 */
export function __resetForTest() {
  ctx = null
  armed = false
  listenersBound = false
}
