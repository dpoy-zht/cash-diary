import { describe, it, expect } from 'vitest'
import { topNodeOf, selectionOf, nextOnPickTop } from '../src/utils/category-ui.js'

/**
 * 两级分类选择态推导（v7）。
 * tree 的形状与 services/category.js: buildTree() 一致：[{ cat, children }]
 */
function tree() {
  return [
    {
      cat: { id: 1, name: '餐饮', type: 'expense', icon: 'food', sort: 1, parent_id: null },
      children: [
        { id: 11, name: '早餐', type: 'expense', icon: 'breakfast', sort: 1, parent_id: 1 },
        { id: 12, name: '午餐', type: 'expense', icon: 'lunch', sort: 2, parent_id: 1 }
      ]
    },
    {
      cat: { id: 2, name: '交通', type: 'expense', icon: 'traffic', sort: 2, parent_id: null },
      children: [
        { id: 21, name: '公交', type: 'expense', icon: 'bus', sort: 1, parent_id: 2 }
      ]
    },
    {
      cat: { id: 3, name: '其他', type: 'expense', icon: 'more', sort: 3, parent_id: null },
      children: []
    }
  ]
}

describe('topNodeOf —— 找选中项所属的一级节点', () => {
  it('一级 id → 它自己那个节点', () => {
    expect(topNodeOf(tree(), 1).cat.name).toBe('餐饮')
    expect(topNodeOf(tree(), 3).cat.name).toBe('其他')
  })

  it('二级 id → 所属的一级节点', () => {
    expect(topNodeOf(tree(), 11).cat.name).toBe('餐饮')
    expect(topNodeOf(tree(), 21).cat.name).toBe('交通')
  })

  it('字符串 id 也能命中', () => {
    expect(topNodeOf(tree(), '12').cat.name).toBe('餐饮')
  })

  it('找不到 / 非法 id → null', () => {
    expect(topNodeOf(tree(), 999)).toBe(null)
    expect(topNodeOf(tree(), null)).toBe(null)
    expect(topNodeOf(tree(), '')).toBe(null)
    expect(topNodeOf(tree(), 'abc')).toBe(null)
    expect(topNodeOf(null, 1)).toBe(null)
    expect(topNodeOf([null, undefined, {}], 1)).toBe(null)
  })
})

describe('selectionOf —— 组件照着渲染的选择态', () => {
  it('选中二级：top 是它的一级，isTopSelected=false', () => {
    const s = selectionOf(tree(), 11)
    expect(s.top.name).toBe('餐饮')
    expect(s.topId).toBe(1)
    expect(s.children.length).toBe(2)
    expect(s.isTopSelected).toBe(false)
    expect(s.selected).toBe(11)
  })

  it('选中一级：isTopSelected=true，children 仍然给出来（好让用户继续细化）', () => {
    const s = selectionOf(tree(), 1)
    expect(s.isTopSelected).toBe(true)
    expect(s.children.map(function (c) { return c.name })).toEqual(['早餐', '午餐'])
    expect(s.selected).toBe(1)
  })

  it('选中的一级没有子类 → children 为空（二级条不渲染）', () => {
    const s = selectionOf(tree(), 3)
    expect(s.children).toEqual([])
    expect(s.isTopSelected).toBe(true)
  })

  it('空选择 / 找不到 → 全空态，组件据此隐藏二级条', () => {
    const empty = selectionOf(tree(), null)
    expect(empty.top).toBe(null)
    expect(empty.topId).toBe(null)
    expect(empty.children).toEqual([])
    expect(empty.isTopSelected).toBe(false)

    expect(selectionOf(tree(), 999).top).toBe(null)
    expect(selectionOf(null, 1).topId).toBe(null)
  })
})

describe('nextOnPickTop —— 点一级时的选中规则', () => {
  it('点了**别的**一级 → 落到那个一级本身', () => {
    const s = selectionOf(tree(), 11) // 当前选中「早餐」（属于餐饮）
    expect(nextOnPickTop(s, 2)).toBe(2)
  })

  it('点了**同一个**一级 → 返回 null（保持不动，不把已选好的二级顶掉）', () => {
    const s = selectionOf(tree(), 11)
    expect(nextOnPickTop(s, 1)).toBe(null)
    // 选的就是这个一级本身时也一样：保持不动
    const s2 = selectionOf(tree(), 1)
    expect(nextOnPickTop(s2, 1)).toBe(null)
  })

  it('当前没有选中项 → 点谁选谁', () => {
    expect(nextOnPickTop(selectionOf(tree(), null), 1)).toBe(1)
  })

  it('非法 topId → null（调用方据此不做任何事）', () => {
    const s = selectionOf(tree(), 1)
    expect(nextOnPickTop(s, null)).toBe(null)
    expect(nextOnPickTop(s, 'abc')).toBe(null)
    expect(nextOnPickTop(null, 1)).toBe(1)
  })
})
