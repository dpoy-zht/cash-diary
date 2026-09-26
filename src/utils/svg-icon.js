/**
 * 把 24×24 SVG path 转成 CSS mask 样式对象（白色 glyph 的标准渲染法）。
 * 元素本身给 background，mask 裁出图标形状；跨 H5 / App(webview) 稳定。
 * @param {string} d SVG path data
 * @returns {object} 可直接绑到 :style
 */
export function svgMaskStyle(d) {
  const svg =
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'>" +
    "<path fill='%23fff' d='" + d + "'/></svg>"
  const uri = 'url("data:image/svg+xml;utf8,' + encodeURIComponent(svg) + '")'
  return {
    '-webkit-mask-image': uri,
    'mask-image': uri,
    '-webkit-mask-repeat': 'no-repeat',
    'mask-repeat': 'no-repeat',
    '-webkit-mask-position': 'center',
    'mask-position': 'center',
    '-webkit-mask-size': 'contain',
    'mask-size': 'contain'
  }
}
