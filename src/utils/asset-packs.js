/**
 * 表情包**分组清单** —— 两套素材共存，用一个常量决定 App 用哪一套。
 *
 * ## 为什么要分组而不是直接替换
 * 用户要求「完全保留原有表情包图片资源、路径与显示逻辑不变，把新上传的作为新增内容整合」。
 * 所以：
 * - **原图 `src/static/milo/*.webp` 一个字节都不动**（blob 已校验，见 tests/asset-slots.test.js）
 * - 新图放在独立目录 `src/static/meme/meme-*.webp`，**文件名带 `meme-` 前缀，与原图零命名冲突**
 * - 切换只改下面这个 `ACTIVE_PACK` 常量，**不碰任何页面与组件**
 *
 * ## 为什么切换能只改一个常量
 * 素材路径在运行时才拼接（`spec.js: decoSrc()` / `asset-slot.vue: src`），
 * 页面传的是 `mood`（表情 key）而不是路径。所以：
 *   ACTIVE_PACK = 'milo' → '/static/milo/milo-<key>.webp'
 *   ACTIVE_PACK = 'meme' → '/static/meme/meme-milo-<key>.webp'
 * 同一套 `mood` 键在两套素材里一一对应，切换后**显示逻辑与排版完全不变**。
 *
 * ## 两套素材的差异（接入前须知）
 * | 维度 | milo（原图） | meme（新增） |
 * |---|---|---|
 * | 形象 | 奶龙（第七印象，**仅个人自用**） | 用户自制抖音 meme（同一只黄色龙形） |
 * | 底色 | 7 张自带场景底、2 张抠透明 | 9 张全部抠透明 |
 * | 适合 | 彩色卡片（自带底不突兀） | 任意背景（无白边、无矩形残留） |
 * | 授权 | ⚠️ 上架前必须替换 | 用户自有 |
 */

/** 可选素材包。第一项是默认（当前生效）。 */
export const PACKS = Object.freeze(['milo', 'meme'])

/** 当前启用的素材包。改成 'meme' 即全站切到新图，改回 'milo' 即恢复原图。 */
export const ACTIVE_PACK = 'milo'

/**
 * 各素材包的信息（人话描述，给调试与文档用）。
 *
 * ⚠️ `prefix` 是**该包自己的完整文件名前缀**，不含扩展名、不含表情名：
 *   milo 包 → 'milo-'   （所以基础形象是 'milo-' + 'milo' = 'milo-milo'？不对，见下）
 * 这里把 prefix 定义成**包级命名空间**，基础形象是特例，单独处理：
 *   milo 包: dir='/static/milo/',  base='milo'   → 'milo.webp'       / 'milo-waving.webp'
 *   meme 包: dir='/static/meme/', base='meme-milo' → 'meme-milo.webp' / 'meme-milo-waving.webp'
 * 所以用 `base` 而不是 `prefix`，避免基础形象被拼成 'milo-milo'。
 */
export const PACK_INFO = Object.freeze({
  milo: {
    id: 'milo',
    label: '奶龙（原有）',
    dir: '/static/milo/',
    base: 'milo',
    note: '⚠️ 形象版权归第七印象文化传媒，仅限个人自用；上架前必须替换为已授权素材。'
  },
  meme: {
    id: 'meme',
    label: '自制 meme（新增）',
    dir: '/static/meme/',
    base: 'meme-milo',
    note: '用户自制抖音 meme，作者自有；9 张全部抠透明，贴任意背景无白边。'
  }
})

/**
 * 解析素材包 id → 目录信息。未知 id 抛错而非静默回落 ——
 * 拼错包名会 404 出空白图，静默回落会让人误判成"图变了"。
 */
export function pack(id) {
  const key = id || ACTIVE_PACK
  if (PACKS.indexOf(key) === -1) {
    throw new Error('未知素材包：' + key + '（可选：' + PACKS.join(' / ') + '）')
  }
  return PACK_INFO[key]
}

/**
 * 拼出某个表情在指定素材包下的运行时路径。
 *
 * ⚠️ 命名不齐是**两套素材共有的历史事实**：基础形象没有表情后缀，
 *   其余才是 `<base>-<表情>`。所以基础形象要单独处理（mood==='milo' 时不接 '-<mood>'）。
 *   别"顺手统一命名" —— 一改就和已入库文件对不上，且只有真机看得到空白图。
 *
 * @param {string} mood  表情 key，如 milo / waving / sad …
 * @param {string} [packId] 素材包，默认 ACTIVE_PACK
 * @returns {string} 形如 '/static/meme/meme-milo-waving.webp'
 */
export function packSrc(mood, packId) {
  const p = pack(packId)
  return p.dir + (mood === 'milo' ? p.base : p.base + '-' + mood) + '.webp'
}

/** 当前包里的文件是否已入库（启动时自检，缺图早发现，别等真机看空白） */
export function packFiles(packId) {
  const p = pack(packId)
  return MOODS.map(function (m) { return packSrc(m, p.id) })
}

/** 9 个表情 key，与 spec.js 的 DECO_MOODS 一致（这里独立列一份避免循环依赖） */
export const MOODS = Object.freeze([
  'milo', 'waving', 'innocent', 'sad', 'jump', 'caishen', 'gold', 'rich', 'happy'
])

/**
 * 启动自检：确认当前包的 9 张图都在。
 *
 * 为什么需要自检：缺图在 H5 上可能只是空白框、在真机上要等用户滚到那一页才发现，
 * 反馈链路太长。这里在 App 启动时就用 `uni.getFileSystemManager` 之类探测一次，
 * 缺图立刻在控制台报警 —— 不打扰用户，但开发者一定看得到。
 *
 * ⚠️ uni-app 没有跨端的"文件是否存在"同步 API，所以这个检查只能在
 * **有文件系统 API 的端**（App）跑；H5 返回 'skip'。
 *
 * @returns {Promise<{ok:boolean, pack:string, missing:string[]}>}
 */
export function verifyActivePack() {
  const p = pack()
  const files = packFiles()
  const missing = []

  // #ifdef H5
  // H5 拿不到文件系统状态（图片走 URL），交给构建产物与真机验
  return Promise.resolve({ ok: true, pack: p.id, missing: missing, skipped: 'H5' })
  // #endif

  // #ifdef APP-PLUS
  return new Promise(function (resolve) {
    // 逐个 stat：任一缺失就记下来，最后一次性报告
    let left = files.length
    if (!left) return resolve({ ok: true, pack: p.id, missing: missing })
    files.forEach(function (url) {
      plus.io.resolveLocalFileSystemURL(
        url,
        function () { done() },
        function () { missing.push(url); done() }
      )
    })
    function done() {
      left -= 1
      if (left === 0) resolve({ ok: missing.length === 0, pack: p.id, missing: missing })
    }
  })
  // #endif
}
