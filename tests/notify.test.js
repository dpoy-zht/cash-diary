import { describe, it, expect, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  REMIND_PREF_KEY,
  normalizeRemindEnabled,
  haptic,
  listenPushClick,
  notifyLocal,
  pushRouteFor,
  PAYLOAD_OVER_BUDGET,
  PAYLOAD_DAILY,
  PAYLOAD_FIXED,
  parsePermissionResult
} from '../src/utils/notify.js'

/**
 * notifyLocal 只在有 plus 的环境下真的发通知，所以测 payload 要自己装一个假的 plus。
 * （正常运行时 plus 由 uni-app 运行时注入）
 */
function fakePlus() {
  const calls = []
  globalThis.plus = {
    push: {
      createMessage: function (content, payload, opts) {
        calls.push({ content: content, payload: payload, opts: opts })
      }
    }
  }
  return calls
}

afterEach(() => {
  delete globalThis.plus
})

describe('normalizeRemindEnabled —— 超支提醒开关归一化', () => {
  it('存储键固定（me 页写入与 home 页读取必须一致）', () => {
    expect(REMIND_PREF_KEY).toBe('cashDiary.remind.enabled')
  })

  it('默认开启：没存过 / null / undefined 都视为开', () => {
    expect(normalizeRemindEnabled(undefined)).toBe(true)
    expect(normalizeRemindEnabled(null)).toBe(true)
    expect(normalizeRemindEnabled('')).toBe(true)
  })

  it('明确的"关"值才关：false / 0 / "0" / "false"', () => {
    expect(normalizeRemindEnabled(false)).toBe(false)
    expect(normalizeRemindEnabled(0)).toBe(false)
    expect(normalizeRemindEnabled('0')).toBe(false)
    expect(normalizeRemindEnabled('false')).toBe(false)
  })

  it('true 及其他真值都视为开（脏数据不会静默关掉提醒）', () => {
    expect(normalizeRemindEnabled(true)).toBe(true)
    expect(normalizeRemindEnabled(1)).toBe(true)
    expect(normalizeRemindEnabled('1')).toBe(true)
    expect(normalizeRemindEnabled({})).toBe(true)
  })
})

describe('haptic / listenPushClick —— 测试环境下安全降级', () => {
  it('无 plus / navigator.vibrate 时 haptic 静默返回 false', () => {
    expect(haptic()).toBe(false)
    expect(haptic(30)).toBe(false)
  })

  it('无 plus.push 时 listenPushClick 返回 false，不抛错', () => {
    expect(listenPushClick(function () {})).toBe(false)
    expect(listenPushClick(null)).toBe(false)
  })
})

describe('T4.1 —— 通知 payload 与点击路由', () => {
  it('notifyLocal 默认 payload 仍是 over-budget（老调用点无需改动）', () => {
    const calls = fakePlus()
    expect(notifyLocal('标题', '正文')).toBe(true)
    expect(calls[0].payload).toBe(PAYLOAD_OVER_BUDGET)
    expect(calls[0].content).toBe('正文')
    expect(calls[0].opts).toEqual({ cover: false, title: '标题' })
  })

  it('notifyLocal 可以传自定义 payload（每日提醒 / 缴费提醒）', () => {
    const calls = fakePlus()
    notifyLocal('t', 'c', PAYLOAD_DAILY)
    notifyLocal('t', 'c', PAYLOAD_FIXED)
    expect(calls.map(function (x) { return x.payload })).toEqual([PAYLOAD_DAILY, PAYLOAD_FIXED])
  })

  it('payload 为 null/未定义时回落 over-budget，不写出空字符串', () => {
    const calls = fakePlus()
    notifyLocal('t', 'c', null)
    notifyLocal('t', 'c', undefined)
    expect(calls.map(function (x) { return x.payload })).toEqual([PAYLOAD_OVER_BUDGET, PAYLOAD_OVER_BUDGET])
  })

  it('pushRouteFor：三种 payload 各自路由，未知 payload 返回空串（不跳转）', () => {
    expect(pushRouteFor(PAYLOAD_OVER_BUDGET)).toBe('/pages/budget/budget')
    expect(pushRouteFor(PAYLOAD_DAILY)).toBe('/pages/add/add')
    expect(pushRouteFor(PAYLOAD_FIXED)).toBe('/pages/fixed/fixed')
    expect(pushRouteFor('')).toBe('')
    expect(pushRouteFor('unknown')).toBe('')
    expect(pushRouteFor(null)).toBe('')
    expect(pushRouteFor(undefined)).toBe('')
  })

  it('路由表里的路由都在 pages.json 注册过（防写错路径导致点击通知落回首页）', () => {
    const pages = JSON.parse(readFileSync(join(process.cwd(), 'src/pages.json'), 'utf8'))
    const registered = pages.pages.map(function (p) { return '/' + p.path })
    ;[PAYLOAD_OVER_BUDGET, PAYLOAD_DAILY, PAYLOAD_FIXED].forEach(function (p) {
      expect(registered).toContain(pushRouteFor(p))
    })
  })
})

describe('parsePermissionResult —— 通知权限回执解析（T4.1 真机补充）', () => {
  const P = 'android.permission.POST_NOTIFICATIONS'

  it('允许：granted 数组里有该权限', () => {
    expect(parsePermissionResult({ granted: [P], deniedPresent: [], deniedAlways: [] }))
      .toEqual({ granted: true, deniedAlways: false })
  })

  it('本次拒绝：进了 deniedPresent', () => {
    expect(parsePermissionResult({ granted: [], deniedPresent: [P], deniedAlways: [] }))
      .toEqual({ granted: false, deniedAlways: false })
  })

  it('永久拒绝：进了 deniedAlways，且判定优先级高于 granted', () => {
    // 真机实测（小米 14 Pro / Android 16）：用户选过「拒绝且不再询问」后，
    // 系统不再弹窗、直接返回 deniedAlways —— 此时界面必须能提示去系统设置，
    // 否则开关看着是开的，通知永远不会来。
    expect(parsePermissionResult({ granted: [], deniedPresent: [], deniedAlways: [P] }))
      .toEqual({ granted: false, deniedAlways: true })
    expect(parsePermissionResult({ granted: [P], deniedAlways: [P] }))
      .toEqual({ granted: false, deniedAlways: true })
  })

  it('异常 / 空回执不崩，一律按「没拿到」处理', () => {
    expect(parsePermissionResult(null)).toEqual({ granted: false, deniedAlways: false })
    expect(parsePermissionResult(undefined)).toEqual({ granted: false, deniedAlways: false })
    expect(parsePermissionResult({})).toEqual({ granted: false, deniedAlways: false })
    expect(parsePermissionResult({ granted: null, deniedAlways: null }))
      .toEqual({ granted: false, deniedAlways: false })
  })
})
