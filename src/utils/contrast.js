/**
 * WCAG 对比度计算（纯函数，可单测）。
 *
 * 为什么要单列一个工具：深色模式最容易翻车的地方不是"好不好看"，
 * 而是"这行灰字在深底上到底看不看得清"。肉眼判断在深色上尤其不准
 * —— 深底会把中灰读成"还行"，实际只有 2.x:1。
 * 把对比度变成可计算的数字，配色才有据可依。
 *
 * 公式来源：WCAG 2.1 · 1.4.3（AA 正文 4.5:1）、1.4.11（非文本 3:1）
 * 相对亮度：先把 sRGB 分量线性化，再按 0.2126R + 0.7152G + 0.0722B 加权。
 */

/** 十六进制色值 → {r,g,b}（0-255）。支持 #rgb / #rrggbb / 带不带 # */
export function parseHex(hex) {
  let h = String(hex || '').trim().replace(/^#/, '')
  if (h.length === 3) {
    h = h.split('').map(function (c) { return c + c }).join('')
  }
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16)
  }
}

/** 单个通道线性化（WCAG 定义：≤0.03928 走线性段，否则用 2.4 次幂） */
function linearize(channel) {
  const c = channel / 255
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

/** 相对亮度，0（纯黑）~ 1（纯白） */
export function relativeLuminance(hex) {
  const rgb = parseHex(hex)
  if (!rgb) return null
  return (
    0.2126 * linearize(rgb.r) +
    0.7152 * linearize(rgb.g) +
    0.0722 * linearize(rgb.b)
  )
}

/**
 * 两色的对比度，返回值 1~21。
 * 顺序无关（内部按亮度大小排序），换前景/背景不影响结果。
 */
export function contrastRatio(a, b) {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  if (la === null || lb === null) return null
  const hi = Math.max(la, lb)
  const lo = Math.min(la, lb)
  return (hi + 0.05) / (lo + 0.05)
}

/** 保留一位小数，便于断言与日志 */
export function ratioText(a, b) {
  const r = contrastRatio(a, b)
  return r === null ? 'n/a' : r.toFixed(2) + ':1'
}

/**
 * 从 CSS 文本里抽出某个选择器块内的 `--cd-x: #hex` 令牌。
 *
 * 只做工具用（测试与选色脚本），不参与运行时。
 *
 * ⚠️ 解析前**必须先剥掉注释**：令牌块的说明里常常出现
 * `... { --cd-*: ... }` 这样的示例片段，直接找第一个 `{`
 * 会落进注释内部，取到的块是空的（实现时实测踩过，表现为
 * "深色令牌一个都读不到"）。剥注释同时也能规避注释里出现的 `.cd-dark` 字样。
 *
 * @param {string} css 整份 CSS 文本
 * @param {string} selector 选择器，如 '.cd-dark'
 * @returns {Object<string,string>} 形如 { '--cd-bg': '#17130e' }
 */
export function extractTokenBlock(css, selector) {
  const out = {}
  if (!css) return out
  // 剥注释：整块替换成等长空白，尽量保持位置关系（这里其实不依赖位置，但更稳）
  const clean = String(css).replace(/\/\*[\s\S]*?\*\//g, function (m) {
    return ' '.repeat(m.length)
  })
  const idx = clean.indexOf(selector)
  if (idx < 0) return out
  const open = clean.indexOf('{', idx)
  if (open < 0) return out
  // 从 open 往后配对花括号，取到匹配的 }
  let depth = 0
  let end = -1
  for (let i = open; i < clean.length; i += 1) {
    if (clean[i] === '{') depth += 1
    else if (clean[i] === '}') {
      depth -= 1
      if (depth === 0) { end = i; break }
    }
  }
  if (end < 0) return out
  const block = clean.slice(open + 1, end)
  const re = /(--cd-[a-z0-9-]+)\s*:\s*([^;]+);/gi
  let m = re.exec(block)
  while (m) {
    const value = m[2].trim()
    // 只收纯色值；渐变/阴影这类多值令牌不参与对比度计算
    if (/^#[0-9a-fA-F]{3,8}$/.test(value)) out[m[1]] = value
    m = re.exec(block)
  }
  return out
}
