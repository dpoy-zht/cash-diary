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
 * 拿不到真实修改时间；而备份文件名里带定长数字时间戳（如 奶龙记账-自动备份-2026-09-28-0012.json），
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

export async function saveTextFile(fileName, text) {
  // #ifdef H5
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' })
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

/** 列出应用目录里的自动备份文件名（仅带自动前缀的；H5 返回空数组） */
export async function listAutoBackupNames() {
  // #ifdef H5
  return []
  // #endif

  // #ifndef H5
  try {
    if (typeof plus === 'undefined') return []
    const files = await listBackupFiles()
    return files
      .map(function (f) { return f.name })
      .filter(function (n) { return n.indexOf('奶龙记账-自动备份-') === 0 })
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
