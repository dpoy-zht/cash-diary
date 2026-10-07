<template>
  <view class="page">
    <view class="navbar">
      <view class="icon-btn" hover-class="ib-hover" @click="goBack"><view class="ib" :style="iconBack" /></view>
      <text class="nav-title">分类管理</text>
      <view class="icon-btn" style="visibility:hidden"><view class="ib" /></view>
    </view>

    <!-- 支出 / 收入 -->
    <view class="seg">
      <view
        v-for="t in types"
        :key="t.key"
        class="seg-item"
        :class="{ on: type === t.key }"
        @click="type = t.key"
      >{{ t.name }}（{{ countOf(t.key) }}）</view>
    </view>

    <!-- 分类列表：一级为分组标题，二级缩进挂在下面 -->
    <view class="list-card">
      <block v-for="n in nodes" :key="n.cat.id">
        <view class="row" hover-class="row-hover" hover-stay-time="80" @click="openActions(n.cat, true)">
          <cat-icon :category="n.cat" :size="40" />
          <view class="row-main">
            <text class="row-name">{{ n.cat.name }}</text>
            <text class="row-sub">{{ subTextOf(n) }}</text>
          </view>
          <text class="row-arrow">›</text>
        </view>
        <view
          v-for="c in n.children"
          :key="c.id"
          class="row sub"
          hover-class="row-hover"
          hover-stay-time="80"
          @click="openActions(c, false)"
        >
          <cat-icon :category="c" :size="32" />
          <view class="row-main">
            <text class="row-name sub-name">{{ c.name }}</text>
            <text class="row-sub">{{ c.count ? c.count + ' 笔记录' : '还没有记录' }}</text>
          </view>
          <text class="row-arrow">›</text>
        </view>
      </block>
      <view v-if="!nodes.length" class="row-empty">
        <mascot-deco class="empty-milo" slot-id="deco.category.empty" />
        <text class="row-hint">这一类还没有分类，点下面新建一个</text>
      </view>
    </view>

    <text class="foot">点一行可以改名、换图标、上下移动或删除；点一级分类还能在它下面新建子分类。已经有记录的分类、或下面还挂着子分类的一级，都不能删。</text>

    <view class="create-wrap">
      <view class="create-btn" hover-class="create-hover" @click="openCreate">
        <text class="create-t">+ 新建分类</text>
      </view>
    </view>

    <!-- 新建 / 换图标面板 -->
    <view v-if="panelShow" class="mask" @click="closePanel">
      <view class="panel" @click.stop>
        <text class="panel-title">{{ panelMode === 'create' ? '新建分类' : '换个图标' }}</text>
        <input
          v-if="panelMode === 'create'"
          v-model="form.name"
          class="panel-input"
          placeholder="分类名称（最多 6 个字）"
          maxlength="6"
        />
        <!-- 两级分类：新建时选"作为一级"或挂到某个一级下 -->
        <block v-if="panelMode === 'create'">
          <text class="panel-label">放在哪里</text>
          <scroll-view scroll-x class="parent-bar" :show-scrollbar="false">
            <view class="parent-line">
              <view
                class="pchip"
                :class="{ on: form.parentId == null }"
                @click="form.parentId = null"
              >作为一级分类</view>
              <view
                v-for="n in nodes"
                :key="n.cat.id"
                class="pchip"
                :class="{ on: Number(form.parentId) === Number(n.cat.id) }"
                @click="form.parentId = n.cat.id"
              >{{ n.cat.name }}</view>
            </view>
          </scroll-view>
        </block>
        <text class="panel-label">选个图标</text>
        <scroll-view scroll-y class="icon-scroll">
          <view class="icon-grid">
            <view
              v-for="k in iconKeys"
              :key="k"
              class="icon-cell"
              :class="{ on: form.icon === k }"
              @click="form.icon = k"
            >
              <cat-icon :category="{ icon: k }" :size="40" />
            </view>
          </view>
        </scroll-view>
        <view class="panel-actions">
          <view class="btn-ghost" hover-class="btn-hover" @click="closePanel">取消</view>
          <view class="btn-y" hover-class="btn-hover" @click="submitPanel">保存</view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { useCategoryStore } from '../../stores/category.js'
import * as categoryService from '../../services/category.js'
import { UI_DANGER } from '../../utils/constant.js'
import { svgMaskStyle } from '../../utils/svg-icon.js'

/**
 * 分类管理：支出/收入两组，每组按**两级结构**展示（一级为分组标题，二级缩进挂在下面）。
 * 支持新建（可选挂到某个一级下）、改名、换图标、上下移动、删除。
 *
 * 三条硬规则（都在 services/category.js 里）：
 * - 新分类的图标必须从参考包的 key 里选：配色和图标都按 key 取，乱填会退化成 emoji
 * - 已有记录的分类不让删，避免出现指向不存在分类的孤儿流水
 * - **下面还挂着子分类的一级也不让删**，否则那批二级会一起变成孤儿
 * - 排序只在**同组内**（同类型 + 同父级）生效，二级不会串到别的一级下面去
 */
const categoryStore = useCategoryStore()

const types = [
  { key: 'expense', name: '支出' },
  { key: 'income', name: '收入' }
]
const type = ref('expense')
/** 两种类型的完整树（带 count / total）；列表由本页自己维护，store 那份是给记账/编辑页用的 */
const treeAll = ref([])

/** 当前类型的一级节点（每个节点自带 children） */
const nodes = computed(function () {
  return treeAll.value.filter(function (n) { return n.cat.type === type.value })
})
/** 某类型的分类总数（一级 + 二级） */
function countOf(t) {
  return treeAll.value
    .filter(function (n) { return n.cat.type === t })
    .reduce(function (s, n) { return s + 1 + (n.children ? n.children.length : 0) }, 0)
}
/** 一级行的副标题：自己几笔 + 子分类几个 */
function subTextOf(n) {
  const kids = n.children ? n.children.length : 0
  const own = n.cat.count ? n.cat.count + ' 笔' : '没有记录'
  if (!kids) return own
  return own + ' · ' + kids + ' 个子分类'
}

/**
 * 图标清单随当前类型变化（T3.4）：支出列表里不该出现「工资」这类收入语义的图标。
 * 换图标面板打开时当前列表就是被编辑分类所属类型，所以用同一个 type 即可。
 */
const iconKeys = computed(function () {
  return categoryService.iconOptions(type.value)
})

async function reload() {
  // 一次拿到两种类型的完整树（一级 + children + count/total），页面自己按 type 过滤
  treeAll.value = await categoryService.listTreeWithStats()
  // 同时刷新全局分类（记账宫格、编辑弹层用的是 store 那份）；
  // 这里是写操作后的强制刷新，必须走 reload（init 有 ready 守卫不生效）
  await categoryStore.reload()
}

/* ---- 面板 ---- */
const panelShow = ref(false)
const panelMode = ref('create')
const editingId = ref(null)
/** parentId = null 表示新建一个**一级**分类 */
const form = reactive({ name: '', icon: 'more', parentId: null })

/** 打开新建面板；传 topCat 时默认挂到它下面（从一级行的"新建子分类"进来） */
function openCreate(topCat) {
  panelMode.value = 'create'
  editingId.value = null
  form.name = ''
  form.icon = topCat ? topCat.icon : 'more'
  form.parentId = topCat ? topCat.id : null
  panelShow.value = true
}
function openIcon(c) {
  panelMode.value = 'icon'
  editingId.value = c.id
  form.icon = c.icon
  panelShow.value = true
}
function closePanel() {
  panelShow.value = false
}

async function submitPanel() {
  try {
    if (panelMode.value === 'create') {
      await categoryService.create({
        name: form.name,
        type: type.value,
        icon: form.icon,
        parentId: form.parentId
      })
    } else {
      await categoryService.setIcon(editingId.value, form.icon)
    }
    panelShow.value = false
    await reload()
    uni.showToast({ title: '已保存', icon: 'none' })
  } catch (err) {
    uni.showToast({ title: (err && err.message) || '保存失败', icon: 'none' })
  }
}

/* ---- 行操作 ---- */
/**
 * @param {object} c 分类
 * @param {boolean} isTop 是不是一级（一级多一项"新建子分类"）
 */
function openActions(c, isTop) {
  const items = isTop
    ? ['改名', '换个图标', '新建子分类', '上移', '下移', '删除']
    : ['改名', '换个图标', '上移', '下移', '删除']
  uni.showActionSheet({
    itemList: items,
    success: function (res) {
      if (res.tapIndex === 0) doRename(c)
      else if (res.tapIndex === 1) openIcon(c)
      else if (isTop && res.tapIndex === 2) openCreate(c)
      else {
        const i = isTop ? res.tapIndex - 3 : res.tapIndex - 2
        if (i === 0) doMove(c, -1)
        else if (i === 1) doMove(c, 1)
        else if (i === 2) doRemove(c)
      }
    }
  })
}

function doRename(c) {
  uni.showModal({
    title: '分类改名',
    editable: true,
    content: c.name,
    success: async function (res) {
      if (!res.confirm) return
      try {
        await categoryService.rename(c.id, String(res.content || '').trim())
        await reload()
        uni.showToast({ title: '已改名', icon: 'none' })
      } catch (err) {
        uni.showToast({ title: (err && err.message) || '改名失败', icon: 'none' })
      }
    }
  })
}

async function doMove(c, dir) {
  try {
    const moved = await categoryService.move(c.id, dir)
    if (!moved) {
      uni.showToast({ title: dir < 0 ? '已经是最上面了' : '已经是最下面了', icon: 'none' })
      return
    }
    await reload()
  } catch (err) {
    uni.showToast({ title: (err && err.message) || '移动失败', icon: 'none' })
  }
}

function doRemove(c) {
  uni.showModal({
    title: '删除分类',
    content: '确定删除「' + c.name + '」吗？',
    confirmText: '删除',
    confirmColor: UI_DANGER,
    success: async function (res) {
      if (!res.confirm) return
      try {
        await categoryService.removeIfEmpty(c.id)
        await reload()
        uni.showToast({ title: '已删除', icon: 'none' })
      } catch (err) {
        // 有流水时会被拦下，这里把原因原样告诉用户
        uni.showModal({
          title: '不能删除',
          content: (err && err.message) || '删除失败',
          showCancel: false,
          confirmText: '好'
        })
      }
    }
  })
}

function goBack() {
  uni.navigateBack({
    fail: function () {
      uni.reLaunch({ url: '/pages/me/me' })
    }
  })
}

const iconBack = svgMaskStyle('M15.4 7.4L14 6l-6 6 6 6 1.4-1.4L10.8 12z')

onShow(function () {
  reload()
})
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding-bottom: 40px;
  /* navigationStyle:custom 下页面从 y=0 开始，自己让出状态栏 */
  padding-top: var(--status-bar-height, 0px);
}

.navbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px 4px;
}
.nav-title {
  font-size: 20px;
  font-weight: 800;
  color: var(--cd-ink);
}
.icon-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--cd-primary-lt);
  display: flex;
  align-items: center;
  justify-content: center;
}
.ib-hover {
  background: var(--cd-primary);
}
.ib {
  width: 18px;
  height: 18px;
  background: var(--cd-icon);
}

.seg {
  margin: 8px 16px;
  background: var(--cd-primary-lt);
  border-radius: var(--cd-r-pill);
  padding: 4px;
  display: flex;
}
.seg-item {
  flex: 1;
  text-align: center;
  padding: 8px 0;
  border-radius: var(--cd-r-pill);
  font-size: 14px;
  font-weight: 700;
  color: var(--cd-icon-2);
}
.seg-item.on {
  background: var(--cd-primary);
  color: var(--cd-ink);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
}

.list-card {
  margin: 12px 16px;
  background: var(--cd-surface);
  border-radius: 20px;
  padding: 4px 16px;
}
.row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid var(--cd-line);
}
.row:last-child {
  border-bottom: none;
}
.row-hover {
  background: rgba(255, 233, 168, 0.35);
}
.row-main {
  flex: 1;
  min-width: 0;
}
.row-name {
  font-size: 15px;
  font-weight: 700;
  color: var(--cd-ink);
}
.row-sub {
  display: block;
  font-size: 11px;
  color: var(--cd-ink-2);
  margin-top: 2px;
}
.row-arrow {
  color: var(--cd-icon-3);
  font-size: 18px;
}
/* 二级行：左侧留白 + 竖线做出"挂在上面那个一级下"的层次感。
   不要靠缩进 + 变灰来表达层级 —— 灰字会掉到 4.5:1 以下，文字一律用 --cd-ink。 */
.row.sub {
  padding-left: 26px;
  position: relative;
}
.row.sub::before {
  content: '';
  position: absolute;
  left: 10px;
  top: 8px;
  bottom: 8px;
  width: 2px;
  border-radius: 1px;
  background: var(--cd-line);
}
.sub-name {
  font-weight: 600;
}
/* 一级行与其第一个二级之间不要重复画线，视觉上更像一组 */
.row.sub:first-of-type {
  border-top: none;
}
.row-empty {
  padding: 18px 0;
}
.row-hint {
  font-size: 12px;
  color: var(--cd-ink-2);
}

.foot {
  display: block;
  margin: 14px 20px;
  font-size: 11px;
  line-height: 1.7;
  color: var(--cd-ink-2);
}
.create-wrap {
  margin: 6px 16px 16px;
}
.create-btn {
  background: var(--cd-primary);
  border-radius: var(--cd-r-pill);
  padding: 14px 0;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 6px 14px rgba(255, 201, 60, 0.4);
}
.create-hover {
  opacity: 0.9;
  transform: scale(0.985);
}
.create-t {
  color: var(--cd-btn-ink);
  font-size: 15px;
  font-weight: 700;
}

/* ---- 面板 ---- */
.mask {
  position: fixed;
  inset: 0;
  background: rgba(93, 78, 55, 0.45);
  z-index: 99;
  display: flex;
  align-items: flex-end;
}
.panel {
  width: 100%;
  background: var(--cd-surface);
  border-radius: 28px 28px 0 0;
  padding: 20px 16px calc(20px + env(safe-area-inset-bottom));
  box-sizing: border-box;
}
.panel-title {
  font-size: 17px;
  font-weight: 800;
  color: var(--cd-ink);
}
.panel-input {
  margin-top: 12px;
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--cd-line);
  border-radius: var(--cd-r-sm);
  background: var(--cd-bg);
  padding: 12px 14px;
  font-size: 16px;
  font-weight: 700;
  color: var(--cd-ink);
}
.panel-label {
  display: block;
  margin: 14px 0 8px;
  font-size: 13px;
  font-weight: 700;
  color: var(--cd-ink-2);
}
.icon-scroll {
  max-height: 260px;
}
/* 新建时的"放在哪里"选择条：横向滚动，chip 与编辑页的分类 chip 用同一套语言 */
.parent-bar {
  white-space: nowrap;
}
.parent-line {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding-bottom: 2px;
}
.pchip {
  padding: 7px 14px;
  border-radius: var(--cd-r-pill);
  background: var(--cd-bg);
  font-size: 13px;
  font-weight: 700;
  color: var(--cd-ink);
}
.pchip.on {
  background: var(--cd-primary);
  box-shadow: 0 0 0 2px var(--cd-primary-deep);
}
.icon-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 10px;
  padding-bottom: 4px;
}
.icon-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px 0;
  border-radius: 14px;
}
/* 选中：品牌黄底 + 描边，和分类宫格的选中语言一致 */
.icon-cell.on {
  background: var(--cd-primary-lt);
  outline: 2px solid var(--cd-primary);
}
.panel-actions {
  display: flex;
  gap: 10px;
  margin-top: 16px;
}
.btn-ghost,
.btn-y {
  flex: 1;
  height: 48px;
  border-radius: var(--cd-r-pill);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  font-weight: 800;
}
.btn-ghost {
  background: var(--cd-bg);
  color: var(--cd-ink);
}
.btn-y {
  flex: 2;
  background: var(--cd-primary);
  color: var(--cd-btn-ink);
  box-shadow: var(--cd-sh-btn);
}
.btn-hover {
  opacity: 0.9;
  transform: scale(0.98);
}



/* 空状态插画：奶蛙端金条（"还没分类"是中性状态，gold 比 innocent 更有生气） */
.row-empty {
  position: relative;
}
.empty-milo {
  position: relative;
  display: block;
  margin: 4px auto 10px;
}

</style>
