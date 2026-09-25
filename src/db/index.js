/**
 * 存储路由器：App 端走 plus.sqlite，H5/Node 测试环境走内存演示存储。
 * 两者暴露完全相同的方法签名，上层（repository/services）无感知。
 */
import * as sqlite from './sqlite.js'
import * as memory from './memory.js'

let cached = null

export function getStorage() {
  if (cached) return cached
  const isApp = typeof plus !== 'undefined' && !!(plus.sqlite)
  cached = isApp ? sqlite : memory
  return cached
}

export async function initDB() {
  await getStorage().init()
}

/** 仅供单元测试：重置路由与内存存储 */
export function resetStorageForTest() {
  cached = null
  memory.reset()
}
