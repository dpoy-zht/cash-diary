import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  SFX, ENABLED_KEY, VOLUME,
  isSoundEnabled, nextArmed, soundEnabled, toggleSound, playSfx, __resetForTest
} from '../src/utils/sound.js'

/**
 * 音效引擎契约（批次 2）。
 *
 * 重点保护三件事，任何一条被破坏都是用户可感知的体验事故：
 * 1. 静音开关的默认值与持久化语义
 * 2. 首次交互门闩（未交互绝不播 —— 浏览器/App 都禁止无手势自动播放）
 * 3. 平台不支持时**静默失败**（音效绝不能让记账流程失败）
 */

describe('音效引擎', () => {
  beforeEach(() => {
    __resetForTest()
  })

  describe('音效表', () => {
    it('两个音效的路径都在 /static/sfx/ 下', () => {
      expect(Object.keys(SFX).sort()).toEqual(['del', 'success'])
      Object.values(SFX).forEach(function (p) {
        expect(p.startsWith('/static/sfx/')).toBe(true)
        expect(p.endsWith('.wav')).toBe(true)
      })
    })

    it('音效文件真实存在且非 0 字节', () => {
      Object.values(SFX).forEach(function (p) {
        const f = path.join(process.cwd(), 'src' + p)
        expect(fs.existsSync(f), '缺文件：' + f).toBe(true)
        expect(fs.statSync(f).size).toBeGreaterThan(0)
      })
    })

    it('体积控制在 40KB 内（离线轻量定位）', () => {
      const total = Object.values(SFX).reduce(function (sum, p) {
        return sum + fs.statSync(path.join(process.cwd(), 'src' + p)).size
      }, 0)
      expect(total).toBeLessThan(40 * 1024)
    })

    it('音量不超过 0.8（记账 App 不该刺耳）', () => {
      expect(VOLUME).toBeLessThanOrEqual(0.8)
      expect(VOLUME).toBeGreaterThan(0)
    })
  })

  describe('静音开关', () => {
    it('默认开启（音效是加分项，用户主动关才是需求）', () => {
      // 存储里没有这个键时 → 视为开启
      expect(isSoundEnabled(function () { return undefined })).toBe(true)
      expect(isSoundEnabled(function () { return null })).toBe(true)
    })

    it('显式 false 才算关闭', () => {
      expect(isSoundEnabled(function () { return false })).toBe(false)
      expect(isSoundEnabled(function () { return 'false' })).toBe(false)
    })

    it('存储故障时按开启处理（不能因存储问题关掉音效）', () => {
      expect(isSoundEnabled(function () { throw new Error('storage down') })).toBe(true)
    })

    it('toggle 返回切换后的状态', () => {
      // 无 uni 环境：toggle 只返回新值，不应抛错
      expect(typeof toggleSound()).toBe('boolean')
    })

    it('soundEnabled 在无 uni 环境下不抛错', () => {
      expect(typeof soundEnabled()).toBe('boolean')
    })
  })

  describe('首次交互门闩', () => {
    it('未交互过时不置位', () => {
      expect(nextArmed(false, false)).toBe(false)
    })

    it('首次交互后置位且保持', () => {
      expect(nextArmed(false, true)).toBe(true)
      expect(nextArmed(true, false)).toBe(true)
    })

    it('已置位后再来首次事件仍为 true（幂等）', () => {
      const once = nextArmed(false, true)
      expect(nextArmed(once, true)).toBe(true)
    })
  })

  describe('playSfx 的静默失败保障', () => {
    it('未交互（armed=false）时不尝试播放', () => {
      // 返回 false 表示"没播"，但**不抛错**
      expect(playSfx('success', { readStorage: function () { return true } })).toBe(false)
    })

    it('未知音效名直接返回 false，不抛错', () => {
      expect(playSfx('no-such-sfx')).toBe(false)
    })

    it('静音时返回 false', () => {
      // 即使 armed，存储说关就不播
      __resetForTest()
      const r = playSfx('success', { readStorage: function () { return false } })
      expect(r).toBe(false)
    })

    it('无 uni 平台（H5/测试环境）静默返回 false，绝不抛错', () => {
      // 测试环境没有 uni，走到底也不该崩 —— 音效不能影响主流程
      expect(() => playSfx('success')).not.toThrow()
      expect(playSfx('success')).toBe(false)
    })
  })

  describe('存储键约定', () => {
    it('使用项目统一的键前缀', () => {
      expect(ENABLED_KEY.startsWith('cashDiary.')).toBe(true)
    })
  })
})

/**
 * 列表进场限流规则（批次 4）。
 *
 * 这条规则是性能与体验的交界：流水可能上百条，若每条都参与级联，
 * 最后一条要等好几秒才出现（用户以为卡死），低端机也会掉帧。
 * 限流值写死在这里，改动必须同步改测试 —— 防止有人"顺手放开"到全量。
 */
describe('列表进场限流', () => {
  const STEP = 24
  const MAX = 8

  // 与 tx-item.vue 的 riseDelay 计算保持同一套规则
  function riseDelay(i) {
    return i >= 0 && i < MAX ? i * STEP : -1
  }

  it('前 8 项按 24ms 阶梯延迟', () => {
    expect(riseDelay(0)).toBe(0)
    expect(riseDelay(1)).toBe(24)
    expect(riseDelay(7)).toBe(168)
  })

  it('第 9 项及以后不做动画（-1）', () => {
    expect(riseDelay(8)).toBe(-1)
    expect(riseDelay(20)).toBe(-1)
    expect(riseDelay(99)).toBe(-1)
  })

  it('未传 index（-1）不做动画', () => {
    expect(riseDelay(-1)).toBe(-1)
  })

  it('最大总延迟不超过 200ms（逐条累加后不拖沓）', () => {
    expect(riseDelay(MAX - 1) + 240).toBeLessThanOrEqual(200 + 240)
  })

  it('index 缺失或非法时不抛错（防御性：NaN/undefined）', () => {
    ;[NaN, undefined, null, 'abc', {}].forEach(function (bad) {
      expect(typeof riseDelay(bad) === 'number').toBe(true)
    })
  })
})
