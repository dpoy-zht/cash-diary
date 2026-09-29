import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { UI_PRIMARY, UI_DANGER } from '../src/utils/constant.js'

/**
 * T3.11 —— 设计令牌收敛的守门测试。
 *
 * 约定（App.vue 顶部注释）：色值的唯一来源是 App.vue 的 --cd-* 令牌，
 * 页面与组件一律 var(--cd-*)。这里把这条约定变成会失败的测试，
 * 否则过两周又会有新的字面色值悄悄长回来。
 */
const SRC = join(process.cwd(), 'src')

/** 已收敛进令牌的色值：不允许再出现在任何页面/组件的源码里 */
const BANNED = [
  '#8a7450', // → --cd-icon
  '#b89968', // → --cd-icon-2
  '#d4c4a0', // → --cd-icon-3
  '#e8a317', // → --cd-gold-ink
  '#ffe082', // → --cd-primary-mid
  '#a5d6a7', // → --cd-income-lt
  '#ffc93c', // → --cd-primary-deep
  '#b93b39', // → --cd-danger-ink / UI_DANGER
  '#ffd93d', // → --cd-primary / UI_PRIMARY
  '#ffe9a8', // → --cd-primary-lt
  '#ffffff' // → --cd-surface
]

function vueFiles(dir) {
  return readdirSync(dir).flatMap(function (name) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return vueFiles(full)
    return full.endsWith('.vue') ? [full] : []
  })
}

describe('T3.11 —— 硬编码色值收敛', () => {
  it('页面与组件里不再出现散落的十六进制主题色（App.vue 的令牌定义除外）', () => {
    const offenders = []
    vueFiles(SRC).forEach(function (file) {
      // App.vue 是令牌定义处，字面量本来就该在那里
      if (file.endsWith('App.vue')) return
      const text = readFileSync(file, 'utf8').toLowerCase()
      BANNED.forEach(function (hex) {
        if (text.indexOf(hex) !== -1) {
          offenders.push(file.replace(SRC, 'src').replace(/\\/g, '/') + ' 含 ' + hex)
        }
      })
    })
    expect(offenders).toEqual([])
  })

  it('JS 侧常量与 App.vue 的 CSS 令牌取值保持一致', () => {
    const app = readFileSync(join(SRC, 'App.vue'), 'utf8')
    expect(app).toContain('--cd-primary: ' + UI_PRIMARY)
    expect(app).toContain('--cd-danger-ink: ' + UI_DANGER)
  })

  it('新增的图标/次级色令牌都已定义在 App.vue', () => {
    const app = readFileSync(join(SRC, 'App.vue'), 'utf8')
    const tokens = [
      '--cd-icon',
      '--cd-icon-2',
      '--cd-icon-3',
      '--cd-gold-ink',
      '--cd-primary-mid',
      '--cd-income-lt'
    ]
    tokens.forEach(function (t) {
      // 必须是定义（带冒号），不能只是被引用
      expect(app.indexOf(t + ':') !== -1, t + ' 未定义').toBe(true)
    })
  })
})
