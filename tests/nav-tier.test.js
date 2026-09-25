import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  NAV_TIER,
  FRAME_BUDGET_MS,
  percentile,
  isFrameBudgetOk,
  isLowEndHint,
  decideNavTier,
  detectCapability,
  loadNavPref,
  saveNavPref,
  loadPerfOk,
  savePerfOk,
  clearPerfMemory,
  NAV_PREF_KEY,
  NAV_PERF_KEY
} from '../src/utils/nav-tier.js'

/**
 * 降级逻辑最怕"某个分支永远没被走到"——上线才发现退不回去。
 * 这里把 decideNavTier 的每个分支都钉住。
 */

describe('percentile —— 分位数', () => {
  it('空样本返回 null（而不是 0，避免被当成"很快"）', () => {
    expect(percentile([], 0.75)).toBeNull()
    expect(percentile(null, 0.75)).toBeNull()
    expect(percentile(undefined, 0.5)).toBeNull()
  })

  it('单样本任意分位都返回它自己', () => {
    expect(percentile([16], 0)).toBe(16)
    expect(percentile([16], 0.5)).toBe(16)
    expect(percentile([16], 1)).toBe(16)
  })

  it('入参无需有序', () => {
    const a = [40, 10, 30, 20]
    expect(percentile(a, 0)).toBe(10)
    expect(percentile(a, 1)).toBe(40)
    // 不修改原数组
    expect(a).toEqual([40, 10, 30, 20])
  })

  it('p75 只被"持续卡顿"触发，单帧尖峰不误判', () => {
    // 8 帧里只有 1 帧卡到 60ms → p75 仍是 16，滚动主观上是顺的，不该降级
    expect(percentile([16, 16, 16, 16, 16, 16, 16, 60], 0.75)).toBe(16)
    // 8 帧里有 5 帧都是 40ms → p75 落到 40，这才是真的吃不住
    expect(percentile([16, 16, 16, 40, 40, 40, 40, 40], 0.75)).toBe(40)
  })
})

describe('isFrameBudgetOk —— 帧率是否达标', () => {
  it('全部 16.7ms（60fps）→ 达标', () => {
    expect(isFrameBudgetOk([16.7, 16.7, 16.7, 16.7, 16.7, 16.7, 16.7, 16.7])).toBe(true)
  })

  it('p75 恰好等于阈值 → 达标（阈值是上界，不是排他）', () => {
    const samples = [FRAME_BUDGET_MS, FRAME_BUDGET_MS, FRAME_BUDGET_MS, FRAME_BUDGET_MS]
    expect(isFrameBudgetOk(samples)).toBe(true)
  })

  it('p75 超过阈值 → 不达标', () => {
    const samples = [16, 16, 16, 40, 45, 50, 55, 60]
    expect(isFrameBudgetOk(samples)).toBe(false)
  })

  it('样本不足时返回 true —— 证据不够不等于有问题，不该据此降级', () => {
    expect(isFrameBudgetOk([])).toBe(true)
    expect(isFrameBudgetOk([16, 16])).toBe(true)
  })

  it('持续卡顿会被 isFrameBudgetOk 判为不达标', () => {
    expect(isFrameBudgetOk([16, 16, 16, 40, 40, 40, 40, 40])).toBe(false)
  })

  it('支持自定义阈值', () => {
    expect(isFrameBudgetOk([4, 4, 4, 4], 5)).toBe(true)
    expect(isFrameBudgetOk([10, 10, 10, 10], 5)).toBe(false)
  })
})

describe('isLowEndHint —— 低端机静态信号', () => {
  it('核数 ≤2 或内存 ≤2GB 才算低端', () => {
    expect(isLowEndHint(1, 8)).toBe(true)
    expect(isLowEndHint(2, 8)).toBe(true)
    expect(isLowEndHint(4, 1)).toBe(true)
    expect(isLowEndHint(4, 2)).toBe(true)
  })

  it('中端机不被误伤（这是阈值保守的意义）', () => {
    expect(isLowEndHint(4, 4)).toBe(false)
    expect(isLowEndHint(8, 6)).toBe(false)
    expect(isLowEndHint(8, undefined)).toBe(false)
  })

  it('取不到值时按"不低端"处理（默认放行）', () => {
    expect(isLowEndHint(undefined, undefined)).toBe(false)
    expect(isLowEndHint(null, null)).toBe(false)
    expect(isLowEndHint('8', 8)).toBe(false)
  })
})

describe('decideNavTier —— 档位判定（逐分支）', () => {
  const good = {
    pref: 'auto',
    supportsBlur: true,
    reduceTransparency: false,
    lowEnd: false,
    perfOk: true
  }

  it('全部条件满足 → 毛玻璃', () => {
    expect(decideNavTier(good)).toBe(NAV_TIER.BLUR)
  })

  it('不支持 backdrop-filter → 纯色', () => {
    expect(decideNavTier({ ...good, supportsBlur: false })).toBe(NAV_TIER.SOLID)
  })

  it('系统开启「减弱透明度」→ 纯色', () => {
    expect(decideNavTier({ ...good, reduceTransparency: true })).toBe(NAV_TIER.SOLID)
  })

  it('硬件信号过弱 → 纯色', () => {
    expect(decideNavTier({ ...good, lowEnd: true })).toBe(NAV_TIER.SOLID)
  })

  it('实测帧率不达标 → 纯色', () => {
    expect(decideNavTier({ ...good, perfOk: false })).toBe(NAV_TIER.SOLID)
  })

  it('perfOk 未测（undefined）不阻碍启用 —— 先乐观开启，测到不行再退', () => {
    const o = { ...good }
    delete o.perfOk
    expect(decideNavTier(o)).toBe(NAV_TIER.BLUR)
  })

  it('用户显式指定优先于一切自动判定', () => {
    expect(decideNavTier({ ...good, pref: 'solid' })).toBe(NAV_TIER.SOLID)
    // 即便机器很差，用户要毛玻璃也给（这是他的显式选择）
    expect(decideNavTier({
      pref: 'blur', supportsBlur: false, reduceTransparency: true, lowEnd: true, perfOk: false
    })).toBe(NAV_TIER.BLUR)
  })

  it('入参缺失时保守落到纯色（绝不默认毛玻璃）', () => {
    expect(decideNavTier()).toBe(NAV_TIER.SOLID)
    expect(decideNavTier({})).toBe(NAV_TIER.SOLID)
    expect(decideNavTier(null)).toBe(NAV_TIER.SOLID)
  })
})

describe('detectCapability —— 环境探测', () => {
  it('在无浏览器 API 的环境里也返回三个布尔值（不抛错）', () => {
    const cap = detectCapability()
    expect(typeof cap.supportsBlur).toBe('boolean')
    expect(typeof cap.reduceTransparency).toBe('boolean')
    expect(typeof cap.lowEnd).toBe('boolean')
  })
})

describe('偏好与降级记忆的读写', () => {
  const store = new Map()

  beforeEach(() => {
    store.clear()
    globalThis.uni = {
      getStorageSync: function (k) { return store.has(k) ? store.get(k) : '' },
      setStorageSync: function (k, v) { store.set(k, v) }
    }
  })

  afterEach(() => {
    delete globalThis.uni
  })

  it('默认偏好是 auto', () => {
    expect(loadNavPref()).toBe('auto')
  })

  it('读写往返', () => {
    saveNavPref('solid')
    expect(loadNavPref()).toBe('solid')
    saveNavPref('blur')
    expect(loadNavPref()).toBe('blur')
  })

  it('存储里是脏数据时回落到 auto', () => {
    store.set(NAV_PREF_KEY, 'nonsense')
    expect(loadNavPref()).toBe('auto')
  })

  it('没有降级记忆时视为"达标"', () => {
    expect(loadPerfOk()).toBe(true)
  })

  it('记住"吃不住"之后一直生效，直到手动清除', () => {
    savePerfOk(false)
    expect(loadPerfOk()).toBe(false)
    clearPerfMemory()
    expect(loadPerfOk()).toBe(true)
  })

  it('存储不可用时不抛错（本次会话仍然按默认值工作）', () => {
    globalThis.uni = {
      getStorageSync: function () { throw new Error('storage unavailable') },
      setStorageSync: function () { throw new Error('storage unavailable') }
    }
    expect(loadNavPref()).toBe('auto')
    expect(loadPerfOk()).toBe(true)
    expect(function () { saveNavPref('solid') }).not.toThrow()
    expect(function () { savePerfOk(false) }).not.toThrow()
  })

  it('存储键名固定，改动会静默丢失用户偏好', () => {
    expect(NAV_PREF_KEY).toBe('cashDiary.navTier.pref')
    expect(NAV_PERF_KEY).toBe('cashDiary.navTier.perfOk')
  })
})
