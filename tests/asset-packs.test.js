import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import {
  PACKS, ACTIVE_PACK, MOODS, pack, packSrc, packFiles
} from '../src/utils/asset-packs.js'
import { DECO_MOODS, decoSrc } from '../src/components/mascot-deco/spec.js'
import { hasSlot, slot as slotOf } from '../src/utils/asset-slots.js'

/**
 * 素材包（分组）契约。
 *
 * 用户要求：「完全保留原有表情包图片资源、路径与显示逻辑不变，
 * 把新上传的作为**新增**内容整合进来，不替换不删除任何已有图片」。
 *
 * 拆成四条可断言的硬约束：
 * 1. **原图零改动** → 逐文件比对 git blob hash（不是比大小，是比内容哈希）
 * 2. **原图零删除** → 9 个文件一个不少，且不在 .gitignore 里
 * 3. **原路径显示逻辑不变** → ACTIVE_PACK='milo' 时拼出的路径与改造前逐字一致
 * 4. **新增可独立寻址** → meme 包 9 个文件都在，且与原图零命名冲突
 *
 * 这份测试的价值：任何人误改/误删原图，`npm test` 立刻红。
 */
const SRC = path.resolve(process.cwd(), 'src/static')
const MILO_DIR = path.join(SRC, 'milo')
const MEME_DIR = path.join(SRC, 'meme')

/** 取某文件在 git 中的 blob hash（拿不到返回 null，测试里据此跳过而不是误报） */
function gitBlob(relPath, ref) {
  try {
    return execFileSync('git', ['rev-parse', ref + ':' + relPath], {
      cwd: process.cwd(), encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore']
    }).trim()
  } catch (e) {
    return null
  }
}

function sha256(file) {
  return execFileSync('git', ['hash-object', file], {
    cwd: process.cwd(), encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore']
  }).trim()
}

describe('素材包 · 分组结构', () => {
  describe('原图零改动（核心约束）', () => {
    it('9 个原图文件都在', () => {
      MOODS.forEach(function (m) {
        const f = path.join(MILO_DIR, packSrc(m, 'milo').split('/').pop())
        expect(fs.existsSync(f), '缺文件：' + f).toBe(true)
      })
    })

    it('每个原图的内容与 git 里的 blob 完全一致（逐文件比对哈希）', () => {
      // 用 caf88fb（引入素材包体系之前的最后一个提交）为基准
      const REF = 'caf88fb'
      const bad = []
      MOODS.forEach(function (m) {
        const name = packSrc(m, 'milo').split('/').pop()
        const want = gitBlob('src/static/milo/' + name, REF)
        if (!want) return // git 不可用（如未 clone）→ 跳过，不误报
        const got = sha256(path.join(MILO_DIR, name))
        if (got !== want) bad.push(name + ' 内容被改动了')
      })
      expect(bad).toEqual([])
    })

    it('原图目录没有被 .gitignore 吃掉（否则等于"事实删除"）', () => {
      // `git check-ignore` 在"未被忽略"时 exit 1，所以要 try/catch 而不是直接 execFileSync
      // —— 后者会把"通过"当成"失败"抛出来（踩过一次）。
      let ignored
      try {
        execFileSync('git', ['check-ignore', '-q', 'src/static/milo/milo.webp'], {
          cwd: process.cwd(), stdio: 'ignore'
        })
        ignored = true
      } catch (e) {
        ignored = false // exit 1 = 未被忽略，正是期望结果
      }
      expect(ignored).toBe(false)
    })

    it('原图目录没有多余/缺失文件（仍是原来那 9 个）', () => {
      const files = fs.readdirSync(MILO_DIR).filter(function (f) { return f.endsWith('.webp') })
      expect(files.length).toBe(9)
    })
  })

  describe('原路径与显示逻辑不变', () => {
    it('ACTIVE_PACK 默认是 milo（即默认走原图，行为与改造前一致）', () => {
      expect(ACTIVE_PACK).toBe('milo')
    })

    it('milo 包拼出的路径与改造前逐字一致', () => {
      // 这几条是改造前 spec.js 里写死的路径，逐字断言，防止"顺手改路径"
      expect(packSrc('milo', 'milo')).toBe('/static/milo/milo.webp')
      expect(packSrc('waving', 'milo')).toBe('/static/milo/milo-waving.webp')
      expect(packSrc('sad', 'milo')).toBe('/static/milo/milo-sad.webp')
      expect(packSrc('gold', 'milo')).toBe('/static/milo/milo-gold.webp')
    })

    it('spec.js 的 decoSrc 走清单后，默认结果不变（组件行为无差异）', () => {
      expect(decoSrc('milo')).toBe('/static/milo/milo.webp')
      expect(decoSrc('waving')).toBe('/static/milo/milo-waving.webp')
    })

    it('9 个表情在两套素材里都有一一对应（换包不会 404）', () => {
      PACKS.forEach(function (pid) {
        expect(packFiles(pid).length).toBe(9)
        MOODS.forEach(function (m) {
          expect(packSrc(m, pid)).toMatch(/^\/static\//)
        })
      })
    })
  })

  describe('新增素材（meme 包）', () => {
    it('9 个新图都已入库', () => {
      MOODS.forEach(function (m) {
        const f = path.join(MEME_DIR, packSrc(m, 'meme').split('/').pop())
        expect(fs.existsSync(f), '缺文件：' + f).toBe(true)
      })
    })

    it('文件名带 meme- 前缀，与原图零命名冲突', () => {
      const meme = fs.readdirSync(MEME_DIR)
      const milo = fs.readdirSync(MILO_DIR)
      const collide = meme.filter(function (f) { return milo.indexOf(f) !== -1 })
      expect(collide).toEqual([])
    })

    it('新图与原图内容确实不同（不是同一批文件的副本）', () => {
      // 若内容相同，说明只是复制了原图，那"新增"就是假的
      const a = sha256(path.join(MILO_DIR, 'milo.webp'))
      const b = sha256(path.join(MEME_DIR, 'meme-milo.webp'))
      expect(a).not.toBe(b)
    })

    it('新图非 0 字节', () => {
      MOODS.forEach(function (m) {
        const f = path.join(MEME_DIR, packSrc(m, 'meme').split('/').pop())
        expect(fs.statSync(f).size).toBeGreaterThan(0)
      })
    })
  })

  describe('清单本身的正确性', () => {
    it('PACKS 至少含 milo 与 meme', () => {
      expect(PACKS).toContain('milo')
      expect(PACKS).toContain('meme')
    })

    it('ACTIVE_PACK 必须在 PACKS 里（拼错包名会 404 出空白图）', () => {
      expect(PACKS).toContain(ACTIVE_PACK)
    })

    it('每个包都带授权说明（别让"能用"和"能发布"混淆）', () => {
      PACKS.forEach(function (pid) {
        const info = pack(pid)
        expect(!!info.label).toBe(true)
        expect(!!info.note).toBe(true)
        // 原图必须写明版权风险
        if (pid === 'milo') expect(info.note).toMatch(/版权/)
      })
    })

    it('未知包直接抛错，不静默回落（静默回落会让人误判"图没变"）', () => {
      expect(function () { pack('no-such-pack') }).toThrow(/未知素材包/)
      expect(function () { packSrc('milo', 'no-such-pack') }).toThrow(/未知素材包/)
    })

    it('MOODS 与 spec.js 的 DECO_MOODS 一致（两处独立列的清单不能漂移）', () => {
      expect(MOODS.slice().sort()).toEqual(DECO_MOODS.slice().sort())
    })

    it('两套素材目录名不同（避免同名文件互相覆盖）', () => {
      expect(pack('milo').dir).not.toBe(pack('meme').dir)
      expect(pack('milo').base).not.toBe(pack('meme').base)
    })
  })
})

/**
 * 新增插槽（meme 包）专项。
 *
 * 这批插槽是 2026-10-05 新加的「空数据占位插画」，
 * 关键约束是**不覆盖任何原有元素** —— 全部是原本就无图的空态位置。
 */
describe('新增 meme 插槽', () => {
  const NEW = ['meme.ledger.empty', 'meme.report.top', 'meme.me.empty']

  it('3 个新插槽都已登记', () => {
    NEW.forEach(function (id) {
      expect(hasSlot(id), '未登记：' + id).toBe(true)
    })
  })

  it('新插槽都锁定 meme 包（不受 ACTIVE_PACK 影响，原图零改动的前提）', () => {
    NEW.forEach(function (id) {
      const s = slotOf(id)
      expect(s.pack, id + ' 应锁定 meme 包').toBe('meme')
      // file 字段带 meme- 前缀 → 运行时不会被解析成当前包
      expect(s.file.startsWith('meme-milo'), id + ' 文件名应带 meme- 前缀').toBe(true)
    })
  })

  it('新插槽的素材文件真实存在', () => {
    NEW.forEach(function (id) {
      const s = slotOf(id)
      const name = s.file
      const f = path.join(process.cwd(), 'src/static/meme', name)
      expect(fs.existsSync(f), '缺文件：' + f).toBe(true)
    })
  })

  it('新插槽尺寸都是正数且有明确用途标注（便于对照界面排查）', () => {
    NEW.forEach(function (id) {
      const s = slotOf(id)
      expect(s.w).toBeGreaterThan(0)
      expect(s.h).toBeGreaterThan(0)
      expect(!!s.where).toBe(true)
      expect(!!s.note).toBe(true)
    })
  })

  it('新插槽都是小尺寸（不挤压版面、兼顾性能）', () => {
    NEW.forEach(function (id) {
      const s = slotOf(id)
      expect(Math.max(s.w, s.h), id + ' 边长应 ≤96').toBeLessThanOrEqual(96)
    })
  })
})
