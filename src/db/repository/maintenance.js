/**
 * 维护仓储：跨表的破坏性操作。
 * 单独一个文件，避免把「清空两表」这种跨表语义塞进某一张表的仓储里。
 */
import { getStorage } from '../index.js'

/** 清空全部业务数据（流水 + 分类）。表结构与迁移记录保留。 */
export async function clearAll() {
  await getStorage().clearAll()
}
