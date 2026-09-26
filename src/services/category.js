/**
 * 分类业务层：内置分类种子（幂等初始化）+ 读取。
 */
import * as categoryRepo from '../db/repository/category.js'

/**
 * 内置分类：12 支出 + 8 收入（对齐 v2.0 参考包的 20 个分类）。
 * `icon` 字段存的是参考包的分类 key（不是 emoji），供 utils/palette.js 取配色与图标；
 * 注意支出与收入里都有「红包」「其他」，所以取色必须按 key 而不是按名字。
 */
export const DEFAULT_CATEGORIES = [
  { name: '早餐', icon: 'breakfast', type: 'expense', sort: 1 },
  { name: '午餐', icon: 'lunch', type: 'expense', sort: 2 },
  { name: '零食', icon: 'snack', type: 'expense', sort: 3 },
  { name: '奶茶', icon: 'milktea', type: 'expense', sort: 4 },
  { name: '公交', icon: 'bus', type: 'expense', sort: 5 },
  { name: '打车', icon: 'taxi', type: 'expense', sort: 6 },
  { name: '购物', icon: 'shop', type: 'expense', sort: 7 },
  { name: '住房', icon: 'home', type: 'expense', sort: 8 },
  { name: '娱乐', icon: 'fun', type: 'expense', sort: 9 },
  { name: '医疗', icon: 'med', type: 'expense', sort: 10 },
  { name: '红包', icon: 'gift', type: 'expense', sort: 11 },
  { name: '其他', icon: 'more', type: 'expense', sort: 12 },
  { name: '工资', icon: 'salary', type: 'income', sort: 1 },
  { name: '奖金', icon: 'bonus', type: 'income', sort: 2 },
  { name: '兼职', icon: 'part', type: 'income', sort: 3 },
  { name: '理财', icon: 'invest', type: 'income', sort: 4 },
  { name: '红包', icon: 'redbag', type: 'income', sort: 5 },
  { name: '报销', icon: 'reimb', type: 'income', sort: 6 },
  { name: '二手', icon: 'sell', type: 'income', sort: 7 },
  { name: '其他', icon: 'more', type: 'income', sort: 8 }
]

/** 幂等：首次启动写入内置分类，已有数据则跳过（换分类体系需清库或写迁移） */
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
