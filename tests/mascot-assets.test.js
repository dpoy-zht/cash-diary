import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { DECO_MOODS, decoSrc } from '../src/components/mascot-deco/spec.js'

/**
 * 素材契约：装饰件声明的每个 mood 都必须真有对应文件。
 *
 * 背景：src/static/milo/*.webp 是**已随包入库**的第三方 IP 素材（奶龙=第七印象），
 * 换机器/重新 clone 后如果漏拷，图片会静默变空白 —— 编译不报错、单测也发现不了，
 * 只有真机看得到空白框。这条测试把"素材缺失"提前到 CI 阶段暴露。
 */
const SRC_DIR = path.resolve(process.cwd(), 'src')
const MILO_DIR = path.join(SRC_DIR, 'static/milo')

/**
 * 把 spec 返回的运行时路径（'/static/milo/milo-xxx.webp'）换算成仓库里的真实文件。
 * 注意 runtime 路径以 /static 开头（Vite 会映射到 src/static），仓库里对应 src/static，
 * 所以要在前面补 'src'。
 */
function assetFile(mood) {
  return path.join(SRC_DIR, decoSrc(mood).slice(1))
}

describe('奶龙素材契约', () => {
  it('src/static/milo 目录存在', () => {
    expect(fs.existsSync(MILO_DIR)).toBe(true)
  })

  it('每个 mood 都有对应的 webp 文件', () => {
    const missing = []
    DECO_MOODS.forEach(function (m) {
      if (!fs.existsSync(assetFile(m))) missing.push(m + ' → ' + decoSrc(m))
    })
    expect(missing).toEqual([])
  })

  it('目录里没有多余的 webp（避免 spec 漏登记新素材）', () => {
    const files = fs.readdirSync(MILO_DIR).filter(function (f) {
      return f.endsWith('.webp')
    })
    expect(files.length).toBe(DECO_MOODS.length)
  })

  it('素材文件非空（防 0 字节占位）', () => {
    const empty = []
    DECO_MOODS.forEach(function (m) {
      const file = assetFile(m)
      if (fs.existsSync(file) && fs.statSync(file).size === 0) empty.push(m)
    })
    expect(empty).toEqual([])
  })
})
