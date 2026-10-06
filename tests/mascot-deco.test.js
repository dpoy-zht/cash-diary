import { describe, it, expect } from 'vitest'
import {
  DECO_MOODS,
  DECO_SIZE_TIERS,
  decoSrc,
  decoStyle,
  decoMode
} from '../src/components/mascot-deco/spec.js'

/**
 * 奶蛙 IP 装饰件的规格计算。
 *
 * 这条约束是硬需求，不是审美偏好：**IP 装饰只能"加氛围"，不能挡内容、不能抢点击、
 * 不能把版面挤变形**。所以尺寸/透明度/裁切方式必须由纯函数统一算出来，
 * 页面不允许各自写死 —— 否则某个页面随手写个 160px 就能把标题压掉。
 *
 * 同构先例：`db/tx-search-sql.js` 把 SQL 拼装抽成纯函数，也是为了让
 * "转义无注入"能在 Node 单测里逐字断言。vitest 跑不了 .vue 的 scoped 样式，
 * 但能跑纯函数，所以规格逻辑必须落在这里。
 */
describe('mascot-deco 规格', () => {
  describe('素材路径', () => {
    it('9 种形象全部映射到包内已入库的 webp，不新增素材文件', () => {
      expect(DECO_MOODS.length).toBe(9)
      const expected = [
        'milo', 'waving', 'happy', 'sad', 'innocent',
        'jump', 'caishen', 'gold', 'rich'
      ]
      expect(DECO_MOODS.slice().sort()).toEqual(expected.slice().sort())
    })

    it('基础形象是 milo.webp（无连字符前缀），其余才是 milo-xxx.webp', () => {
      // 历史命名不齐：现有 home/stats 都写死 /static/milo/milo.webp，
      // 改这里会让已入库的 9 个文件对不上，且只有真机看得到空白图
      expect(decoSrc('milo')).toBe('/static/milo/milo.webp')
      expect(decoSrc('waving')).toBe('/static/milo/milo-waving.webp')
      expect(decoSrc('caishen')).toBe('/static/milo/milo-caishen.webp')
    })

    it('未知形象直接抛错，不能静默出一张裂图', () => {
      expect(function () { decoSrc('not-exist') }).toThrow(/未知奶蛙形象/)
      expect(function () { decoSrc('') }).toThrow()
    })
  })

  describe('尺寸档', () => {
    it('三档分别是 44 / 44 / 96，hero 明显大于行内档', () => {
      expect(DECO_SIZE_TIERS.inline).toBe(44)
      expect(DECO_SIZE_TIERS.corner).toBe(44)
      expect(DECO_SIZE_TIERS.hero).toBe(96)
      expect(DECO_SIZE_TIERS.hero).toBeGreaterThan(DECO_SIZE_TIERS.inline)
    })

    it('按档取缺省尺寸', () => {
      expect(decoStyle({ tier: 'inline' }).width).toBe('44px')
      expect(decoStyle({ tier: 'hero' }).width).toBe('96px')
    })

    it('显式 size 覆盖档缺省', () => {
      expect(decoStyle({ tier: 'hero', size: 58 }).width).toBe('58px')
      expect(decoStyle({ tier: 'hero', size: 58 }).height).toBe('58px')
    })

    it('size 为 0 / 负数 / 非数字时回落到档缺省，不产生 0px 塌陷', () => {
      // 0px 会让元素彻底消失，负数会被浏览器忽略 —— 两种都必须挡住
      expect(decoStyle({ tier: 'inline', size: 0 }).width).toBe('44px')
      expect(decoStyle({ tier: 'inline', size: -20 }).width).toBe('44px')
      expect(decoStyle({ tier: 'hero', size: NaN }).width).toBe('96px')
    })

    it('宽高永远相等，避免非正方形把角色压扁', () => {
      const s = decoStyle({ tier: 'hero', size: 66 })
      expect(s.width).toBe(s.height)
    })
  })

  describe('透明度：不喧宾夺主', () => {
    it('边角档默认半透明，正文档默认完全不透明', () => {
      expect(decoStyle({ tier: 'corner' }).opacity).toBe(0.5)
      expect(decoStyle({ tier: 'inline' }).opacity).toBe(1)
      expect(decoStyle({ tier: 'hero' }).opacity).toBe(1)
    })

    it('显式 opacity 覆盖缺省', () => {
      expect(decoStyle({ tier: 'corner', opacity: 0.9 }).opacity).toBe(0.9)
      expect(decoStyle({ tier: 'hero', opacity: 0.35 }).opacity).toBe(0.35)
    })
  })

  describe('圆形裁切', () => {
    it('circle 走 aspectFill + 999px，不裁走 aspectFit（否则被压成椭圆）', () => {
      expect(decoMode({ circle: true })).toBe('aspectFill')
      expect(decoStyle({ circle: true }).borderRadius).toBe('999px')
    })

    it('不裁时保持原比例 + 小圆角，与卡片语言一致', () => {
      expect(decoMode({ circle: false })).toBe('aspectFit')
      expect(decoStyle({}).borderRadius).toBe('var(--cd-r-sm)')
    })
  })

  describe('边界防御', () => {
    it('不传参数不抛错（组件在 H5 首帧可能拿到 undefined）', () => {
      expect(function () { decoStyle() }).not.toThrow()
      expect(function () { decoMode() }).not.toThrow()
      expect(decoStyle().width).toBe('44px')
    })

    it('尺寸档非法时回落到 inline，不产生 NaN', () => {
      const s = decoStyle({ tier: 'no-such-tier' })
      expect(s.width).toBe('44px')
      expect(String(s.width)).not.toContain('undefined')
    })
  })
})
