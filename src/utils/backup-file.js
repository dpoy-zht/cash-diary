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
  const names = await listBackupFiles()
  if (!names.length) throw new Error('应用目录里还没有备份文件，请先导出一份')
  const idx = await pickFromList(names.map(function (n) { return n.name }))
  const chosen = names[idx]
  const text = await readDocFile(chosen.name)
  return { name: chosen.name, text: text }
  // #endif
}

// #ifndef H5
/** 列出应用文档目录里的备份文件（按文件名倒序 = 时间倒序，见 sortedBackupNames） */
function listBackupFiles() {
  return new Promise(function (resolve, reject) {
    plus.io.requestFileSystem(
      plus.io.PRIVATE_DOC,
      function (fs) {
        fs.root.createReader().readEntries(
          function (entries) {
            const files = sortedBackupNames(
              entries
                .filter(function (e) { return e.isFile })
                .map(function (e) { return e.name })
            ).map(function (n) { return { name: n } })
            resolve(files)
          },
          function () { reject(new Error('读取目录失败')) }
        )
      },
      function () { reject(new Error('无法访问应用文件目录')) }
    )
  })
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

// 自动备份文件名前缀。**新旧两个都要认**：只认新前缀会让改名前写的自动备份
// 在「数据体检」里查不到、也永远不被清理，用户以为备份丢了。
// 与 utils/backup.js 里的同名常量保持一致（那边负责写，这里负责读）。
const AUTO_BACKUP_PREFIX = '奶蛙记账-自动备份-'
const AUTO_BACKUP_PREFIX_LEGACY = '奶龙记账-自动备份-'

/** 列出应用目录里的自动备份文件名（仅带自动前缀的；H5 返回空数组） */
export async function listAutoBackupNames() {
  // #ifdef H5
  return []
  // #endif

  // #ifndef H5
  try {
    if (typeof plus === 'undefined') return []
    const files = await listBackupFiles()
    // ⚠️ 新旧前缀都要认：只认新的会让改名前写的自动备份"消失"（体检查不到、
    // 清理也跳过），用户以为备份丢了。见 utils/backup.js 的前缀兼容说明。
    return files
      .map(function (f) { return f.name })
      .filter(function (n) {
        return n.indexOf(AUTO_BACKUP_PREFIX) === 0 || n.indexOf(AUTO_BACKUP_PREFIX_LEGACY) === 0
      })
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
