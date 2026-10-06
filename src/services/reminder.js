/**
 * 提醒服务（T4.1）—— utils/reminder.js 纯逻辑的「真机外壳」。
 *
 * 这一层只做三件事，一行判断逻辑都不写：
 *   1. 从 uni storage 读/写提醒配置与「已提醒」记录；
 *   2. 从固定支出服务取当前账本的缴费配置；
 *   3. 把引擎算出来的 { kind, id } 拼成通知文案，交给 utils/notify.js 发出去。
 *
 * 关于「缴费提醒」的开关：**不额外加开关**，直接跟随每笔固定支出自己的 enabled ——
 * 停用某笔固定支出，它的提醒自然就没了；少一个开关就少一处状态可以不一致。
 */
import * as fixedService from './fixed.js'
import {
  notifyLocal,
  requestNotifyPermission,
  PAYLOAD_DAILY,
  PAYLOAD_FIXED
} from '../utils/notify.js'
import { formatCents } from '../utils/money.js'
import {
  DAILY_CFG_KEY,
  REMIND_FIRED_KEY,
  normalizeDailyConfig,
  normalizeFired,
  createReminderEngine
} from '../utils/reminder.js'

/* ---------------- 存储读写（读失败一律回退默认值，绝不让提醒把 App 拖垮） ---------------- */

function readRaw(key) {
  try {
    return uni.getStorageSync(key)
  } catch (e) {
    return null
  }
}

function writeRaw(key, value) {
  try {
    uni.setStorageSync(key, value)
    return true
  } catch (e) {
    return false
  }
}

/** 当前每日提醒配置（已归一化） */
export function getDailyConfig() {
  return normalizeDailyConfig(readRaw(DAILY_CFG_KEY))
}

/**
 * 保存每日提醒配置（局部更新：只覆盖传进来的字段）。
 * @param {{enabled?:boolean, hm?:string}} patch
 */
export function saveDailyConfig(patch) {
  const cur = getDailyConfig()
  const next = normalizeDailyConfig(Object.assign({}, cur, patch || {}))
  const ok = writeRaw(DAILY_CFG_KEY, next)
  refreshReminders() // 设置改了就立刻按新设置重排，不必等下一次启动
  return ok ? next : null
}

function readFired() {
  return normalizeFired(readRaw(REMIND_FIRED_KEY))
}

function writeFired(fired) {
  return writeRaw(REMIND_FIRED_KEY, normalizeFired(fired))
}

/* ---------------- 通知文案 ---------------- */

/**
 * 把引擎给出的 { kind, id } 拼成通知内容。
 * kind 未知时返回 null，调用方跳过（防御未来新增类型时的旧版兼容）。
 */
export function reminderMessage(item, ctx) {
  const it = item || {}
  if (it.kind === 'daily') {
    return {
      title: '奶蛙记账 · 今天记账了吗？',
      content: '花 30 秒记完今天的小花费，连续记账别断哦~',
      payload: PAYLOAD_DAILY
    }
  }
  if (it.kind === 'fixed') {
    const list = (ctx && ctx.list) || []
    const f = list.filter(function (x) { return Number(x.id) === Number(it.id) })[0] || {}
    const name = String(f.note || '').trim() || '固定支出'
    const amount = Number(f.amount_cents) || 0
    return {
      title: '奶蛙记账 · 缴费提醒',
      content: '今天是「' + name + '」的记账日（¥' + formatCents(amount) + '），别忘了哦~',
      payload: PAYLOAD_FIXED
    }
  }
  return null
}

/** 发一条提醒（App 端才真的有通知，其他端静默返回 false） */
export function fireReminder(item, ctx) {
  const msg = reminderMessage(item, ctx)
  if (!msg) return false
  try {
    requestNotifyPermission()
  } catch (e) { /* 权限申请失败只影响系统通知，不影响记账 */ }
  return notifyLocal(msg.title, msg.content, msg.payload)
}

/* ---------------- 引擎单例 ---------------- */

let engine = null
let accountIdGetter = function () { return null }

/**
 * 启动提醒引擎（App.vue 的 onLaunch 在数据就绪后调用）。
 * 重复调用只做一次 refresh，不会堆出多个定时器。
 * @param {() => number} [getAccountId] 取当前账本 id；由调用方传 store 的 getter，
 *   这样切了账本下一个 tick 自动读新账本，不需要重启引擎。
 */
export function startReminders(getAccountId) {
  if (typeof getAccountId === 'function') accountIdGetter = getAccountId
  if (engine) return engine.refresh()
  engine = createReminderEngine({
    load: function () {
      return Promise.resolve()
        .then(function () { return fixedService.listFixed(accountIdGetter()) })
        .catch(function () { return [] })
        .then(function (list) {
          return { config: getDailyConfig(), list: list, fired: readFired() }
        })
    },
    fire: fireReminder,
    saveFired: writeFired
  })
  return engine.start()
}

/** 状态变了（切账本 / 改设置 / 增删固定支出 / 回前台补发）就重排一轮 */
export function refreshReminders() {
  return engine ? engine.refresh() : null
}

/** 停止并释放定时器（重置数据 / 测试用） */
export function stopReminders() {
  if (engine) {
    engine.stop()
    engine = null
  }
}
