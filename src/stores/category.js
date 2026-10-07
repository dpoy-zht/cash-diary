import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import * as categoryService from '../services/category.js'

export const useCategoryStore = defineStore('category', function () {
  const list = ref([])
  let ready = false

  /**
   * 初始化（有 ready 守卫，与其他 store 风格一致）：
   * App 启动 / 页面 onShow 重复调用只查一次库。
   * 「重置数据」「从备份恢复」后必须走 reload()，光调 init() 是不生效的。
   */
  async function init() {
    if (ready) return
    ready = true
    await reload()
  }

  /**
   * 重新读取分类（可重复调用）：整库替换（重置/恢复）后强制刷新用。
   *
   * `migrateCategoryTree()` 放在 seed 之后：空库由 seed 直接建成两级，
   * 老库（一级平铺）由迁移一次性补父级。两者都是幂等的，重复调用无副作用。
   * ⚠️ 顺序不能反 —— seed 只在空表生效，先跑迁移会在空库上白跑一遍。
   */
  async function reload() {
    await categoryService.seedIfEmpty()
    await categoryService.migrateCategoryTree()
    list.value = await categoryService.listAll()
  }

  /** 某类型的全部分类（含一级与二级），扁平 */
  function flatOf(type) {
    return list.value.filter(function (c) { return c.type === type })
  }

  const expenseCats = computed(function () { return flatOf('expense') })
  const incomeCats = computed(function () { return flatOf('income') })

  /** 某类型的**一级**分类（记一笔宫格 / 预算列表用） */
  const expenseTops = computed(function () { return categoryService.topLevelOf(list.value, 'expense') })
  const incomeTops = computed(function () { return categoryService.topLevelOf(list.value, 'income') })

  /** 两级树（一级 + children），统计与管理页用 */
  const expenseTree = computed(function () { return categoryService.buildTree(list.value, 'expense') })
  const incomeTree = computed(function () { return categoryService.buildTree(list.value, 'income') })

  /** 按 id 取分类（找不到返回 null） */
  function byId(id) {
    return list.value.find(function (c) { return c.id === Number(id) }) || null
  }

  /** 取某个一级下的二级列表 */
  function childrenOf(parentId) {
    return categoryService.childrenOf(list.value, parentId)
  }

  return {
    list,
    init,
    reload,
    expenseCats,
    incomeCats,
    expenseTops,
    incomeTops,
    expenseTree,
    incomeTree,
    byId,
    childrenOf
  }
})
