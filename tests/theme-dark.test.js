import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  parseHex,
  relativeLuminance,
  contrastRatio,
  extractTokenBlock
} from '../src/utils/contrast.js'

/**
 * 深色模式对比度守门测试。
 *
 * 为什么要有这个文件：
 * 深色模式最容易在"看起来还行"里翻车 —— 深底会把中灰读成合格，
 * 实际只有 2.x:1。肉眼看不出差别，但色弱用户和户外强光下就是看不清。
 * 这里把对比度变成断言，改色改坏了测试会红，不依赖任何人的眼睛。
 *
 * 阈值依据 WCAG 2.1：
 *   · 1.4.3  正文文字 ≥ 4.5:1（AA）
 *   · 1.4.11 非文本（图标/组件边界）≥ 3:1
 *   · 装饰性分隔线不强制，但必须可见 —— 这里取 ≥1.5:1
 */

const SRC = join(process.cwd(), 'src')

function cssText(rel) {
  return readFileSync(join(SRC, rel), 'utf8')
}

const darkTokens = extractTokenBlock(cssText('styles/theme-dark.css'), '.cd-dark')
const lightTokens = extractTokenBlock(cssText('App.vue'), ':root')

/** 逐个用例断言，失败时把两色与实测值一起打出来，方便直接调色 */
function expectRatio(label, fg, bg, need) {
  const r = contrastRatio(fg, bg)
  expect(r, label + ' 缺少色值（' + fg + ' / ' + bg + '）').not.toBeNull()
  expect(
    r,
    label + ' 实测 ' + r.toFixed(2) + ':1（' + fg + ' on ' + bg + '），要求 ≥' + need
  ).toBeGreaterThanOrEqual(need)
}

describe('contrast 工具本身', () => {
  it('parseHex 支持 3 位 / 6 位 / 带不带 #', () => {
    expect(parseHex('#fff')).toEqual({ r: 255, g: 255, b: 255 })
    expect(parseHex('ffd93d')).toEqual({ r: 255, g: 217, b: 61 })
    expect(parseHex('#FFD93D')).toEqual({ r: 255, g: 217, b: 61 })
    expect(parseHex('#zzzzzz')).toBeNull()
    expect(parseHex('')).toBeNull()
  })

  it('相对亮度：纯黑 0、纯白 1', () => {
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 5)
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 5)
  })

  it('黑白对比度是 21:1，且与顺序无关', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1)
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 1)
  })

  it('同色对比度恒为 1:1', () => {
    expect(contrastRatio('#1c1710', '#1c1710')).toBeCloseTo(1, 5)
  })

  it('extractTokenBlock 只收纯色值，跳过渐变与阴影', () => {
    const css = '.cd-dark { --cd-bg: #0e0b08; --cd-grad: linear-gradient(#fff, #000); }'
    const t = extractTokenBlock(css, '.cd-dark')
    expect(t['--cd-bg']).toBe('#0e0b08')
    expect(t['--cd-grad']).toBeUndefined()
  })

  it('extractTokenBlock 不被注释里的花括号/选择器干扰', () => {
    // 真实场景：令牌块的说明里写 `... { --cd-*: ... }` 这种示例，
    // 直接找第一个 { 会落进注释，解析出空块（实现时踩过）
    const css = [
      '/* 说明：形如 :root, page { --cd-x: #fff; } 这样 */',
      '/* 也提到 .cd-dark 这个类名 */',
      'html.cd-dark,',
      'html.cd-dark page { --cd-bg: #0e0b08; --cd-ink: #f6f0e6; }'
    ].join('\n')
    const t = extractTokenBlock(css, '.cd-dark')
    expect(t['--cd-bg']).toBe('#0e0b08')
    expect(t['--cd-ink']).toBe('#f6f0e6')
    expect(Object.keys(t).length).toBe(2)
  })
})

describe('深色令牌 —— 完整性', () => {
  /**
   * 刻意不随主题翻转的令牌。
   *
   * `--cd-face-*` 是吉祥物（奶蛙形象）自身的配色：头顶绒毛、眼睛、嘴、高光。
   * 它是一张固定插画，不是界面外壳 —— 深色模式下保持原来的暖黄形象才认得出，
   * 强行翻成深色会把角色改掉。界面元素的令牌则必须全部覆盖。
   */
  const THEME_FIXED = [
    '--cd-face-head',
    '--cd-face-tuft',
    '--cd-face-ink',
    '--cd-face-mouth',
    '--cd-face-glint'
  ]

  it('亮色里定义的每个界面颜色令牌，深色都必须覆盖', () => {
    const missing = Object.keys(lightTokens).filter(function (k) {
      if (THEME_FIXED.indexOf(k) >= 0) return false
      return darkTokens[k] === undefined
    })
    expect(missing).toEqual([])
  })

  it('深色令牌块能被解析到，且数量合理', () => {
    expect(Object.keys(darkTokens).length).toBeGreaterThan(15)
  })
})

describe('深色令牌 —— 对比度达标', () => {
  const ink = darkTokens['--cd-ink']
  const ink2 = darkTokens['--cd-ink-2']
  const surface = darkTokens['--cd-surface']
  const surface2 = darkTokens['--cd-surface-2']
  const bg = darkTokens['--cd-bg']
  const line = darkTokens['--cd-line']
  const lineSoft = darkTokens['--cd-line-soft']
  const primary = darkTokens['--cd-primary']
  const primaryLt = darkTokens['--cd-primary-lt']
  const btnInk = darkTokens['--cd-btn-ink']
  const income = darkTokens['--cd-income']
  const danger = darkTokens['--cd-danger-ink']
  const icon = darkTokens['--cd-icon']
  const icon2 = darkTokens['--cd-icon-2']

  it('正文文字在三种底上都 ≥4.5:1', () => {
    expectRatio('正文/卡片', ink, surface, 4.5)
    expectRatio('正文/抬升面', ink, surface2, 4.5)
    expectRatio('正文/页面底', ink, bg, 4.5)
  })

  it('次文字在三种底上都 ≥4.5:1', () => {
    expectRatio('次文字/卡片', ink2, surface, 4.5)
    expectRatio('次文字/抬升面', ink2, surface2, 4.5)
    expectRatio('次文字/页面底', ink2, bg, 4.5)
  })

  it('压在深黄面板上的文字 ≥4.5:1', () => {
    expectRatio('正文/深黄面板', ink, primaryLt, 4.5)
    expectRatio('次文字/深黄面板', ink2, primaryLt, 4.5)
  })

  it('蛋黄主按钮上的字 ≥4.5:1（深色模式必须用深字）', () => {
    expectRatio('按钮字/蛋黄', btnInk, primary, 4.5)
  })

  it('语义色（收入绿 / 危险红）≥4.5:1', () => {
    expectRatio('收入绿/卡片', income, surface, 4.5)
    expectRatio('危险红/卡片', danger, surface, 4.5)
  })

  it('结构边线 ≥3:1（WCAG 1.4.11 非文本对比度）', () => {
    expectRatio('边线/卡片', line, surface, 3)
    expectRatio('边线/抬升面', line, surface2, 3)
    expectRatio('边线/页面底', line, bg, 3)
  })

  it('密集分隔线 ≥1.5:1（可见但不喧宾夺主）', () => {
    expectRatio('柔和分隔线/卡片', lineSoft, surface, 1.5)
  })

  it('图标 ≥3:1', () => {
    expectRatio('图标/卡片', icon, surface, 3)
    expectRatio('次级图标/卡片', icon2, surface, 3)
  })

  it('层次可分：卡片与页面底、抬升面与卡片都不是同一个色', () => {
    expect(contrastRatio(surface, bg)).toBeGreaterThan(1.05)
    expect(contrastRatio(surface2, surface)).toBeGreaterThan(1.05)
  })
})
