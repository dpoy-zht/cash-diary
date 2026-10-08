/**
 * 备份文件的落盘与读取（平台差异都收在这个文件里）。
 *
 * - H5：导出走浏览器下载；恢复走 <input type="file">
 * - App：导出写到应用私有文档目录 `_doc/`；恢复从该目录列出的备份里选
 *   （不依赖系统文件选择器，个人自用场景够用）
 *
 * ⚠️ App 端分支用的是 plus.io，**只能在真机验证**；H5 分支已做端到端验证。
 */

/** App 文档目录下备份文件的扩展名 */
const EXT = '.json'

/**
 * 从一批文件名里筛出备份文件并倒序排列（纯函数，可单测）。
 *
 * App 端 FileEntry.file 是方法不是属性，`entry.file.lastModified` 恒为 undefined，
 * 拿不到真实修改时间；而备份文件名里带定长数字时间戳（如 奶蛙记账-自动备份-2026-09-28-0012.json），
 * **字典序即时间序**——所以时间序靠文件名保证，这也是导出命名用定长格式的原因。
 */
export function sortedBackupNames(names, ext) {
  const suffix = String(ext || EXT)
  if (!Array.isArray(names)) return []
  return names
    .filter(function (n) { return typeof n === 'string' && n.slice(-suffix.length) === suffix })
    .sort(function (a, b) { return a < b ? 1 : a > b ? -1 : 0 })
}

/* ---------------- 导出：写文件 ---------------- */

/**
 * 把文本写成文件。
 * @param {string} fileName 目标文件名（扩展名决定浏览器的下载类型）
 * @param {string} text 文件内容
 * @param {string} [mime] MIME 类型，默认 application/json（备份）；导出 CSV 时传 text/csv
 */
export async function saveTextFile(fileName, text, mime) {
  // #ifdef H5
  const blob = new Blob([text], { type: mime || 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(function () { URL.revokeObjectURL(url) }, 1000)
  return '已保存到浏览器的下载目录'
  // #endif

  // #ifndef H5
  return await new Promise(function (resolve, reject) {
    plus.io.requestFileSystem(
      plus.io.PRIVATE_DOC,
      function (fs) {
        fs.root.getFile(
          fileName,
          { create: true },
          function (entry) {
            entry.createWriter(
              function (writer) {
                writer.onwrite = function () { resolve('已保存到：' + entry.fullPath) }
                writer.onerror = function () { reject(new Error('写入备份文件失败')) }
                writer.write(text)
              },
              function () { reject(new Error('无法创建备份文件')) }
            )
          },
          function () { reject(new Error('无法创建备份文件')) }
        )
      },
      function () { reject(new Error('无法访问应用文件目录')) }
    )
  })
  // #endif
}

/* ---------------- 恢复：挑哪些文件给用户选（纯函数，可单测） ---------------- */

/** 备份文件名前缀：新的奶蛙 + 改名前的奶龙，两个都要认 */
export const BACKUP_NAME_PREFIXES = ['奶蛙记账-', '奶龙记账-']

/** 是不是本 App 的备份文件名（公共目录里可能有别人的 json，必须按前缀筛） */
export function isBackupName(name) {
  const n = String(name || '')
  if (n.slice(-5) !== '.json') return false
  return BACKUP_NAME_PREFIXES.some(function (p) { return n.indexOf(p) === 0 })
}

/** 是不是自动备份（自动备份优先让位给用户手动导出的） */
export function isAutoBackupName(name) {
  const n = String(name || '')
  return n.indexOf('奶蛙记账-自动备份-') === 0 || n.indexOf('奶龙记账-自动备份-') === 0
}

/**
 * 该把哪些备份文件列给用户选（纯函数，可单测）。
 *
 * 为什么不能一股脑全列出来（这是「备份后无法恢复」的一个真因）：
 * - **列表会爆**：自动备份每6 小时写一份，用久了私有目录里几十个，
 *   `uni.showActionSheet` 在部分 ROM 上超过 6~8 项就点不动/报不出来。
 * - **公共目录会有别人的文件**：导出时复制到 Download/文档目录，
 *   同目录里用户的其他 json 也会被扫到。
 * - 所以：按前缀过滤 → 手动备份优先（那是用户特意导出的）→ 剩下的位置给自动备份，
 *   最多 `limit` 个，多了如实告诉用户被截掉多少。
 *
 * @param {string[]} names 候选文件名（一般已按时间倒序）
 * @param {Object} [opts] { limit = 6 }
 * @returns {{shown: string[], total: number, manualCount: number, autoCount: number, truncated: boolean}}
 */
export function selectRestoreNames(names, opts) {
  const o = opts || {}
  const limit = typeof o.limit === 'number' && o.limit > 0 ? Math.floor(o.limit) : 6
  const all = (Array.isArray(names) ? names : [])
    .filter(function (n) { return isBackupName(n) })
    .slice()
    .sort(function (a, b) { return a < b ? 1 : a > b ? -1 : 0 })
  const manual = all.filter(function (n) { return !isAutoBackupName(n) })
  const auto = all.filter(isAutoBackupName)
  const shown = []
  for (let i = 0; i < limit; i += 1) {
    if (i < manual.length) shown.push(manual[i])
    else if (auto.length) shown.push(auto[i - manual.length])
  }
  return {
    shown: shown,
    total: all.length,
    manualCount: manual.length,
    autoCount: auto.length,
    truncated: all.length > shown.length
  }
}

/** 给用户看的一句话（列表被截断时说明白，别让人以为备份丢了） */
export function restoreListHint(sel) {
  if (!sel || !sel.total) return ''
  const auto = sel.autoCount > 0 ? '，其中自动备份 ' + sel.autoCount + ' 份' : ''
  const cut = sel.truncated
    ? '。这里只列出最近 ' + sel.shown.length + ' 份（共 ' + sel.total + ' 份），旧的可以在「数据体检」里清理'
    : ''
  return '找到 ' + sel.total + ' 份备份' + auto + cut
}

/** listBackupFiles 的读取超时（毫秒）。某些 ROM 上 createReader 会永久挂起。 */
export const LIST_TIMEOUT_MS = 4000

/**
 * 给 plus.io 的异步调用套个超时（纯函数，可单测）。
 * createReader 在部分 ROM（实测 vivo/OriginOS 系）会既不 success 也不 error，
 * Promise 永久挂起 → 表现就是「点了恢复没反应」。有了超时会明确报错。
 */
export function withTimeout(promise, ms, message) {
  const limit = typeof ms === 'number' && ms > 0 ? ms : LIST_TIMEOUT_MS
  return new Promise(function (resolve, reject) {
    let settled = false
    const timer = setTimeout(function () {
      if (settled) return
      settled = true
      reject(new Error(message || '读取文件超时，可能是系统限制了应用访问自己的目录'))
    }, limit)
    Promise.resolve(promise).then(
      function (v) {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(v)
      },
      function (e) {
        if (settled) return
        settled = true
        clearTimeout(timer)
        reject(e)
      }
    )
  })
}

/* ---------------- 导出：把文件送到用户拿得到的地方（T3.6） ---------------- */

/**
 * 把应用私有目录里的备份文件复制到**用户能取到的公共目录**（下载 / 文档）。
 *
 * 为什么不能只写私有目录：`_doc/` 是应用私有空间，用户既看不见也发不出去，
 * 备份等于锁死在手机里 —— 换手机或重装就白备份了。
 *
 * 落点不猜测：Android 各版本/ROM 对公共目录的映射不同（分区存储会把 PUBLIC_DOWNLOADS
 * 映射到应用专属目录），所以复制成功后把 plus.io 给出的**真实路径**回显给用户，
 * 让他知道去哪儿取，插电脑时也能按路径找到。
 *
 * @param {string} name 应用目录里的备份文件名
 * @returns {Promise<string|null>} 真实路径；null = H5（浏览器已自行下载，无需再复制）；空串 = App 端复制失败
 */
export async function exportDocFileToUser(name) {
  // #ifdef H5
  return null
  // #endif

  // #ifndef H5
  try {
    if (typeof plus === 'undefined' || !name) return ''
    const targets = [plus.io.PUBLIC_DOWNLOADS, plus.io.PUBLIC_DOCUMENTS]
    for (const fsType of targets) {
      const path = await copyDocTo(name, fsType)
      if (path) return path
    }
    return ''
  } catch (e) {
    return ''
  }
  // #endif
}

// #ifndef H5
/** 私有目录 → 目标公共目录 的整文件复制；失败 resolve('')，不抛错（换下一个候选目录） */
function copyDocTo(name, fsType) {
  return new Promise(function (resolve) {
    plus.io.requestFileSystem(
      fsType,
      function (destFs) {
        plus.io.requestFileSystem(
          plus.io.PRIVATE_DOC,
          function (srcFs) {
            srcFs.root.getFile(
              name,
              { create: false },
              function (entry) {
                entry.copyTo(
                  destFs.root,
                  name,
                  function (copied) {
                    // fullPath 是 _downloads/xxx 这类虚拟路径，用户看不懂 → 换成真实路径
                    try {
                      resolve(plus.io.convertLocalFileSystemURL(copied.fullPath) || copied.fullPath || '')
                    } catch (e) {
                      resolve(copied.fullPath || '')
                    }
                  },
                  function () { resolve('') }
                )
              },
              function () { resolve('') }
            )
          },
          function () { resolve('') }
        )
      },
      function () { resolve('') }
    )
  })
}
// #endif

/**
 * 导出结果 → 给用户看的提示（纯函数，可单测）。
 *
 * 契约（T3.6）：任何一条路径都不能让用户"什么都没有"——
 * 拿不到文件时必须提供剪贴板兜底，否则备份形同虚设。
 *
 * @param {{ mode?: 'browser-download', outPath?: string }} result
 *        mode='browser-download' 表示 H5（浏览器已下载）；outPath 为 App 端复制到的真实路径
 * @param {string} [what] 导出的东西叫什么，默认「备份文件」（导出 CSV 时传「账单文件」）
 * @returns {{ title: string, content: string, fallbackClipboard: boolean }}
 */
export function exportResultMessage(result, what) {
  const r = result || {}
  const label = what || '备份文件'
  if (r.mode === 'browser-download') {
    return {
      title: '导出成功',
      content: label + '已保存到浏览器的下载目录。',
      fallbackClipboard: false
    }
  }
  if (r.outPath) {
    return {
      title: '导出成功',
      content: label + '已复制到：\n' + r.outPath + '\n\n用手机的文件管理器，或者连电脑按这个路径就能取到。',
      fallbackClipboard: false
    }
  }
  return {
    title: '没有找到能放文件的公共目录',
    content: label + '已经存在应用自己目录里。要不要把内容复制到剪贴板？粘贴到微信、备忘录就能长久保存。',
    fallbackClipboard: true
  }
}

/* ---------------- 恢复：读文件 ---------------- */

/**
 * 让用户挑一个备份文件并读出文本。
 * @returns {Promise<{name:string, text:string}>} 用户取消时 reject 一个带 cancelled 标记的错误
 */
export async function pickBackupText() {
  // #ifdef H5
  return await new Promise(function (resolve, reject) {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,application/json'
    input.style.display = 'none'
    document.body.appendChild(input)
    input.onchange = function () {
      const file = input.files && input.files[0]
      document.body.removeChild(input)
      if (!file) {
        const e = new Error('没有选择文件')
        e.cancelled = true
        reject(e)
        return
      }
      const reader = new FileReader()
      reader.onload = function () { resolve({ name: file.name, text: String(reader.result || '') }) }
      reader.onerror = function () { reject(new Error('读取文件失败')) }
      reader.readAsText(file)
    }
    // 用户直接关掉选择框时不会有事件，靠页面自己兜底（这里不 reject，避免误报）
    input.click()
  })
  // #endif

  // #ifndef H5
  const privateNames = await listBackupFiles()
  const publicNames = await listPublicBackupNames().catch(function () { return [] })
  const picked = selectRestoreNames(privateNames.concat(publicNames), { limit: 6 })
  if (!picked.shown.length) {
    throw new Error('没找到备份文件。导出会写到「下载 / 文档」目录，' +
      '请在文件管理里搜「奶蛙记账」确认文件还在，再点一次恢复')
  }
  const hint = restoreListHint(picked)
  if (picked.truncated) {
    const go = await confirmTooMany(picked, hint)
    if (!go) throw cancelledError()
  }
  const idx = await pickFromList(picked.shown)
  const name = picked.shown[idx]
  // 公共目录里的文件不在私有目录，读法不一样
  const text = publicNames.indexOf(name) >= 0 && privateNames.indexOf(name) < 0
    ? await readPublicDocFile(name)
    : await readDocFile(name)
  return { name: name, text: text }
  // #endif
}

/** 列表太长时先问一句（老备份可能是用户特意留的，别默默替他决定） */
function confirmTooMany(picked, hint) {
  return new Promise(function (resolve) {
    uni.showModal({
      title: '备份有点多',
      content: hint + '。\n\n只列出最近 ' + picked.shown.length + ' 份继续？',
      confirmText: '继续',
      cancelText: '返回',
      success: function (r) { resolve(!!r.confirm) },
      fail: function () { resolve(false) }
    })
  })
}

function cancelledError() {
  const e = new Error('已取消')
  e.cancelled = true
  return e
}

// #ifndef H5
/**
 * 列出**公共目录**（下载 / 文档）里的备份文件名。
 *
 * 为什么必须扫公共目录 —— 这是「导出成功但恢复说没有」的真正原因：
 * `doExport` 会把备份**复制**一份到公共目录（否则用户根本拿不到文件），
 * 但老实现的恢复只列应用私有目录 `_doc/`。于是：
 * 用户把备份发到微信 / 存进「下载」，换机或清数据后恢复 → **列不出来**，
 * 表现就是「备份功能无效、导出了却恢复不了」。
 *
 * 公共目录里可能有用户的其他 json，所以只收本 App 前缀的（isBackupName）。
 * 扫不到就算了（分区存储下某些公共目录不可读），不影响私有目录那条路。
 */
function listPublicBackupNames() {
  const targets = [plus.io.PUBLIC_DOWNLOADS, plus.io.PUBLIC_DOCUMENTS]
  return targets.reduce(function (chain, fsType) {
    return chain.then(function (acc) {
      return readDirNames(fsType).then(function (names) {
        return acc.concat(names.filter(isBackupName))
      }).catch(function () { return acc })
    })
  }, Promise.resolve([]))
}

/** 读某个 plus.io 文件系统类型下根目录的文件名（失败 resolve([])，不抛错） */
function readDirNames(fsType) {
  return withTimeout(new Promise(function (resolve) {
    plus.io.requestFileSystem(
      fsType,
      function (fs) {
        // ⚠️ createReader 在部分 ROM（实测 vivo/OriginOS 系）会既不 success 也不 error
        // → Promise 永久挂起。所以外面必须套 withTimeout。
        fs.root.createReader().readEntries(
          function (entries) {
            resolve(entries.filter(function (e) { return e.isFile }).map(function (e) { return e.name }))
          },
          function () { resolve([]) }
        )
      },
      function () { resolve([]) }
    )
  }), LIST_TIMEOUT_MS).catch(function () { return [] })
}

/** 从公共目录读一个文件（用于恢复列表里选中的公共备份） */
function readPublicDocFile(name) {
  const targets = [plus.io.PUBLIC_DOWNLOADS, plus.io.PUBLIC_DOCUMENTS]
  return targets.reduce(function (chain, fsType) {
    return chain.then(function (txt) {
      if (txt) return txt
      return readFileFromFs(fsType, name).catch(function () { return '' })
    })
  }, Promise.resolve('')).then(function (txt) {
    if (!txt) throw new Error('读取备份文件失败：' + name)
    return txt
  })
}

/** 读某个应用文件系统里 root 下的一个文件文本 */
function readFileFromFs(fsType, name) {
  return new Promise(function (resolve, reject) {
    plus.io.requestFileSystem(
      fsType,
      function (fs) {
        fs.root.getFile(
          name,
          { create: false },
          function (entry) {
            entry.file(
              function (file) {
                const reader = new plus.io.FileReader()
                reader.onload = function (e) { resolve(String(e.target.result || '')) }
                reader.onerror = function () { reject(new Error('读取文件失败')) }
                reader.readAsText(file, 'utf-8')
              },
              function () { reject(new Error('读取文件失败')) }
            )
          },
          function () { reject(new Error('文件不存在')) }
        )
      },
      function () { reject(new Error('无法访问目录')) }
    )
  })
}

/** 列出应用私有文档目录里的备份文件名（时间倒序，见 sortedBackupNames） */
function listBackupFiles() {
  return withTimeout(new Promise(function (resolve, reject) {
    plus.io.requestFileSystem(
      plus.io.PRIVATE_DOC,
      function (fs) {
        fs.root.createReader().readEntries(
          function (entries) {
            resolve(entries.filter(function (e) { return e.isFile }).map(function (e) { return e.name }))
          },
          function () { reject(new Error('读取目录失败')) }
        )
      },
      function () { reject(new Error('无法访问应用文件目录')) }
    )
  }), LIST_TIMEOUT_MS)
}

function pickFromList(items) {
  return new Promise(function (resolve, reject) {
    uni.showActionSheet({
      itemList: items,
      success: function (res) { resolve(res.tapIndex) },
      fail: function () {
        const e = new Error('没有选择文件')
        e.cancelled = true
        reject(e)
      }
    })
  })
}

function readDocFile(name) {
  return new Promise(function (resolve, reject) {
    plus.io.requestFileSystem(
      plus.io.PRIVATE_DOC,
      function (fs) {
        fs.root.getFile(
          name,
          { create: false },
          function (entry) {
            entry.file(
              function (file) {
                const reader = new plus.io.FileReader()
                reader.onload = function (e) { resolve(String(e.target.result || '')) }
                reader.onerror = function () { reject(new Error('读取备份文件失败')) }
                reader.readAsText(file, 'utf-8')
              },
              function () { reject(new Error('读取备份文件失败')) }
            )
          },
          function () { reject(new Error('备份文件不存在')) }
        )
      },
      function () { reject(new Error('无法访问应用文件目录')) }
    )
  })
}

// #endif

/* ---------------- 自动备份的清理（App 端私有目录；H5 无文件系统，全部空操作） ---------------- */

// 自动备份的识别规则在 isAutoBackupName（前面的"恢复"小节）。
// ⚠️ 新旧两个前缀都要认：只认新前缀会让改名前写的自动备份在「数据体检」里
// 查不到、也永远不被清理，用户以为备份丢了。与 utils/backup.js 保持一致。

/** 列出应用目录里的自动备份文件名（仅带自动前缀的；H5 返回空数组） */
export async function listAutoBackupNames() {
  // #ifdef H5
  return []
  // #endif

  // #ifndef H5
  try {
    if (typeof plus === 'undefined') return []
    const names = await listBackupFiles()
    // ⚠️ 新旧前缀都要认：只认新的会让改名前写的自动备份"消失"（体检查不到、
    // 清理也跳过），用户以为备份丢了。见 utils/backup.js 的前缀兼容说明。
    return names.filter(isAutoBackupName)
  } catch (e) {
    return []
  }
  // #endif
}

/** 删除应用文档目录里的指定文件。删不掉（不存在/占用）返回 false，不抛错。 */
export async function removeDocFile(name) {
  // #ifdef H5
  return false
  // #endif

  // #ifndef H5
  try {
    if (typeof plus === 'undefined' || !name) return false
    return await new Promise(function (resolve) {
      plus.io.requestFileSystem(
        plus.io.PRIVATE_DOC,
        function (fs) {
          fs.root.getFile(
            name,
            { create: false },
            function (entry) {
              entry.remove(function () { resolve(true) }, function () { resolve(false) })
            },
            function () { resolve(false) }
          )
        },
        function () { resolve(false) }
      )
    })
  } catch (e) {
    return false
  }
  // #endif
}
