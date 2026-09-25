/**
 * 分类业务层：内置分类种子（幂等初始化）+ 读取。
 */
import * as categoryRepo from '../db/repository/category.js'

/** 内置分类：8 支出 + 4 收入（与 demo/index.html 原型一致） */
export const DEFAULT_CATEGORIES = [
  { name: '餐饮', icon: '🍜', type: 'expense', sort: 1 },
  { name: '交通', icon: '🚌', type: 'expense', sort: 2 },
  { name: '购物', icon: '🛍️', type: 'expense', sort: 3 },
  { name: '住房', icon: '🏠', type: 'expense', sort: 4 },
  { name: '通讯', icon: '📱', type: 'expense', sort: 5 },
  { name: '娱乐', icon: '🎮', type: 'expense', sort: 6 },
  { name: '医疗', icon: '💊', type: 'expense', sort: 7 },
  { name: '其他支出', icon: '📦', type: 'expense', sort: 8 },
  { name: '工资', icon: '💼', type: 'income', sort: 1 },
  { name: '兼职', icon: '🧧', type: 'income', sort: 2 },
  { name: '红包', icon: '🎁', type: 'income', sort: 3 },
  { name: '其他收入', icon: '💰', type: 'income', sort: 4 }
]

/** 幂等：首次启动写入内置分类，已有数据则跳过 */
export async function seedIfEmpty() {
  const n = await categoryRepo.count()
  if (n > 0) return
  for (const c of DEFAULT_CATEGORIES) {
    await categoryRepo.insert(c)
  }
}

export async function listAll() {
  return categoryRepo.listAll()
}
