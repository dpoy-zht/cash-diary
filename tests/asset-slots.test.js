import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { SLOTS, USAGE, REQUIRED_ICONS, slot, hasSlot, uniqueFiles } from '../src/utils/asset-slots.js'
import { placeholderStyle, placeholderLabel, showHint, cropToMode, cropToRadius, TONE_VARS } from '../src/components/asset-slot/ph.js'
import { DECO_MOODS, decoSrc } from '../src/components/mascot-deco/spec.js'

/**
 * 素材占位契约。
 *
 * 用户要求：「先预留占位、不嵌真图，上传素材后直接替换、不影响排版」。
 * 这条要求拆成三个可断言的硬约束：
 *
 * 1. **占位与真图共用同一个盒子** → 尺寸写在 slots.js 一处，占位框从那里算，
 *    页面与组件都不许自己写死宽高。否则替换素材必然位移。
 * 2. **每处素材都有用途与位置标注** → 缺 usage / where 的插槽让上传者无从下手。
 * 3. **素材可去重** → 24 个插槽只对应 12 个文件（原图 9 + 新增 meme 3），不必备 24 张图。
 *
 * 这份测试的价值在于：它跑在 Node 里，不需要构建、不需要真机，
 * 属于"素材还没到位就能发现问题"的那一层防线。
 */
describe('素材插槽登记表', () => {
  describe('结构完整性', () => {
    it('24 个插槽全部有 id / usage / where / 尺寸 / 文件名', () => {
      const bad = []
      SLOTS.forEach(function (s) {
        ;['id', 'usage', 'where', 'w', 'h', 'ratio', 'size', 'crop', 'file'].forEach(function (k) {
          if (s[k] === undefined || s[k] === '') bad.push(s.id + ' 缺 ' + k)
        })
      })
      expect(bad).toEqual([])
    })

    it('id 唯一，不允许重复登记（重复会让 slot() 取到错的规格）', () => {
      const ids = SLOTS.map(function (s) { return s.id })
      const dup = ids.filter(function (v, i) { return ids.indexOf(v) !== i })
      expect(dup).toEqual([])
    })

    it('usage 全部是已定义的枚举值（否则 USAGE_TONE 取不到色）', () => {
      const known = Object.keys(USAGE)
      const bad = SLOTS.filter(function (s) { return known.indexOf(s.usage) === -1 })
        .map(function (s) { return s.id + '=' + s.usage })
      expect(bad).toEqual([])
    })

    it('尺寸都是正整数（0 或负数会让占位框塌陷成不可见）', () => {
      const bad = SLOTS.filter(function (s) {
        return !(Number.isInteger(s.w) && s.w > 0 && Number.isInteger(s.h) && s.h > 0)
      }).map(function (s) { return s.id + ' ' + s.w + '×' + s.h })
      expect(bad).toEqual([])
    })
  })

  describe('slot() 查表', () => {
    it('按 id 能查到，查不到直接抛错而非静默 undefined', () => {
      expect(slot('home.balance').w).toBe(72)
      expect(hasSlot('home.balance')).toBe(true)
      // 静默返回 undefined 会变成"一个没框的空位"，比报错更难查
      expect(function () { slot('no.such.slot') }).toThrow(/未登记的图片插槽/)
    })
  })

  describe('素材去重：用户不必备 24 张图', () => {
    it('去重后 12 个文件，覆盖 24 个插槽', () => {
      const u = uniqueFiles()
      expect(u.length).toBe(12)
      expect(SLOTS.length).toBe(24)
    })

    it('每个文件都被至少一个插槽用到（登记表不能有孤儿素材）', () => {
      const unused = uniqueFiles().filter(function (f) { return f.usedBy.length === 0 })
      expect(unused).toEqual([])
    })

    it('登记表里的文件都在已入库素材之内（不引用不存在的文件）', () => {
      // 两套素材包：milo 包 9 张 + meme 包 9 张，登记表只允许引用这两者
      const known = DECO_MOODS.map(function (m) { return decoSrc(m).split('/').pop() })
        .concat(DECO_MOODS.map(function (m) { return 'meme-' + decoSrc(m).split('/').pop() }))
      const bad = uniqueFiles().map(function (f) { return f.file })
        .filter(function (file) { return known.indexOf(file) === -1 })
      expect(bad).toEqual([])
    })

    it('带 meme- 前缀的插槽都锁定 pack=meme（原图零改动的前提）', () => {
      const memes = SLOTS.filter(function (s) { return s.file.indexOf('meme-') === 0 })
      expect(memes.length).toBe(3)
      const bad = memes.filter(function (s) { return s.pack !== 'meme' })
        .map(function (s) { return s.id })
      expect(bad).toEqual([])
    })

    it('两套素材的引用数：milo 21 处 + meme 3 处 = 24', () => {
      const memes = SLOTS.filter(function (s) { return s.file.indexOf('meme-') === 0 }).length
      expect(memes).toBe(3)
      expect(SLOTS.length - memes).toBe(21)
    })
  })

  describe('加载方式：装饰件一律不 lazy', () => {
    it('全站 24 处都是 lazy=false', () => {
      // 这些图都是首屏必见的主视觉/装饰/空态，lazy 只会在真机上造成晚一拍闪烁
      const lazyOnes = SLOTS.filter(function (s) { return s.lazy === true })
        .map(function (s) { return s.id })
      expect(lazyOnes).toEqual([])
    })

    it('lazy 不是 undefined 而是显式 false（避免将来被当成"忘了写"）', () => {
      const noLazy = SLOTS.filter(function (s) { return s.lazy !== false })
        .map(function (s) { return s.id })
      expect(noLazy).toEqual([])
    })
  })

  describe('必配图标', () => {
    it('应用图标与启动页已登记（缺了发版会被 HBuilderX 拦）', () => {
      const ids = REQUIRED_ICONS.map(function (i) { return i.id })
      expect(ids).toContain('app.icon')
      expect(ids).toContain('splash.logo')
      REQUIRED_ICONS.forEach(function (i) {
        expect(!!i.size).toBe(true)
        expect(!!i.file).toBe(true)
      })
    })
  })

  describe('清单文档与代码一致（防文档漂移）', () => {
    const DOC = path.resolve(process.cwd(), 'docs/asset-checklist.md')

    it('清单文档已生成', () => {
      expect(fs.existsSync(DOC)).toBe(true)
    })

    it('每个插槽 id 都出现在文档里（漏了用户就找不到对应位置）', () => {
      const doc = fs.readFileSync(DOC, 'utf-8')
      const missing = SLOTS.filter(function (s) { return doc.indexOf(s.id) === -1 })
        .map(function (s) { return s.id })
      expect(missing).toEqual([])
    })

    it('每个去重后的文件名都出现在文档里', () => {
      const doc = fs.readFileSync(DOC, 'utf-8')
      const missing = uniqueFiles().filter(function (f) {
        return doc.indexOf(f.file) === -1
      })
      expect(missing).toEqual([])
    })

    it('文档里的位置总数与登记表一致（改登记表忘了重生成 → 这里报错）', () => {
      const doc = fs.readFileSync(DOC, 'utf-8')
      // 文档里的明细表用「| N | `slot.id` |」开头，统计这种行数
      const rows = doc.split('\n').filter(function (l) {
        return /^\| \d+ \| `/.test(l)
      })
      expect(rows.length).toBe(SLOTS.length)
    })
  })
})

describe('占位框渲染计算', () => {
  describe('盒子 = 真图盒子（这是"替换不位移"的核心）', () => {
    it('宽高严格取自登记表', () => {
      const s = placeholderStyle({ w: 72, h: 90 })
      expect(s.width).toBe('72px')
      expect(s.height).toBe('90px')
    })

    it('每个插槽算出的占位框尺寸都等于它自己的登记尺寸', () => {
      const bad = []
      SLOTS.forEach(function (s) {
        const st = placeholderStyle({ w: s.w, h: s.h, crop: s.crop })
        if (st.width !== s.w + 'px' || st.height !== s.h + 'px') {
          bad.push(s.id + ' 占位 ' + st.width + st.height + ' ≠ 登记 ' + s.w + '×' + s.h)
        }
      })
      expect(bad).toEqual([])
    })

    it('圆角沿用真图裁切方式（圆形裁切必须 999px，否则被压成椭圆）', () => {
      expect(cropToRadius('fill-circle')).toBe('999px')
      expect(cropToRadius('fit')).toBe('0')
      expect(cropToRadius('fill', '16px')).toBe('16px')
    })

    it('圆形/铺满裁切都配 aspectFill，完整显示用 aspectFit', () => {
      expect(cropToMode('fill-circle')).toBe('aspectFill')
      expect(cropToMode('fill')).toBe('aspectFill')
      expect(cropToMode('fit')).toBe('aspectFit')
    })

    it('圆形裁切的插槽必须用 aspectFill —— 否则角色变形', () => {
      const bad = SLOTS.filter(function (s) {
        return s.crop === 'fill-circle' && cropToMode(s.crop) !== 'aspectFill'
      })
      expect(bad).toEqual([])
    })
  })

  describe('颜色语义', () => {
    it('用途 → 色值全部走项目已有令牌，不引入新色', () => {
      Object.values(TONE_VARS).forEach(function (v) {
        expect(String(v)).toMatch(/^var\(--cd-/)
      })
    })

    it('非法 tone 回落到 ghost，不产出 undefined（否则边框色丢失）', () => {
      const s = placeholderStyle({ w: 40, h: 40, tone: 'no-such' })
      expect(s.borderColor).toBe(TONE_VARS.ghost)
    })
  })

  describe('说明文字', () => {
    it('标注用途 + 尺寸，便于对照界面上传', () => {
      expect(placeholderLabel({ w: 140, h: 140, usage: '空态插画' })).toBe('空态插画 140×140')
    })

    it('小框不显示建议尺寸（否则文字比框还宽）', () => {
      expect(showHint({ w: 44, size: '180×180' })).toBe(false)
      expect(showHint({ w: 96, size: '320×320' })).toBe(true)
    })
  })

  describe('边界防御：不产出无效 CSS', () => {
    it('不传参数用 96 兜底，不抛错（组件首帧可能拿到 undefined）', () => {
      expect(function () { placeholderStyle() }).not.toThrow()
      expect(placeholderStyle().width).toBe('96px')
    })

    it('NaN / 负数 / 0 全部回落，不产出 NaNpx 或 0px', () => {
      expect(placeholderStyle({ w: NaN }).width).toBe('96px')
      expect(placeholderStyle({ w: -10 }).width).toBe('96px')
      expect(placeholderStyle({ w: 0 }).width).toBe('96px')
      expect(String(placeholderStyle({ w: NaN }).width)).not.toContain('NaN')
    })
  })
})
