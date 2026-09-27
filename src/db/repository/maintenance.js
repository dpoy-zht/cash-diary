/**
 * 维护仓储：跨表的破坏性 / 整库级操作。
 * 单独一个文件，避免把「清空全部」「整库导出/恢复」这种跨表语义塞进某一张表的仓储里。
 */
import { getStorage } from '../index.js'

/** 清空全部业务数据（流水 + 分类 + 账本 + 预算）。表结构与迁移记录保留。 */
export async function clearAll() {
  await getStorage().clearAll()
}

/** 整库导出：四张表原样导出（含软删除记录） */
export async function dumpAll() {
  return getStorage().dumpAll()
}

/** 整库恢复：按原样写回（调用方必须先校验过数据） */
export async function restoreAll(tables) {
  return getStorage().restoreAll(tables)
}
