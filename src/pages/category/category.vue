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

    <!-- 分类列表 -->
    <view class="list-card">
      <view
        v-for="c in rows"
        :key="c.id"
        class="row"
        hover-class="row-hover"
        @click="openActions(c)"
      >
        <cat-icon :category="c" :size="40" />
        <view class="row-main">
          <text class="row-name">{{ c.name }}</text>
          <text class="row-sub">{{ c.count ? c.count + ' 笔记录' : '还没有记录' }}</text>
        </view>
        <text class="row-arrow">›</text>
      </view>
      <view v-if="!rows.length" class="row-empty">
        <mascot-deco class="empty-milo" slot-id="deco.category.empty" />
        <text class="row-hint">这一类还没有分类，点下面新建一个</text>
      </view>
    </view>

    <text class="foot">点一行可以改名、换图标、上下移动或删除。已经有记录的分类不能删——先把那些记录改到别的分类。</text>

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
 * 分类管理：支出/收入两个列表，支持新建、改名、换图标、上下移动、删除。
 *
 * 两条硬规则（都在 services/category.js 里）：
 * - 新分类的图标必须从参考包的 19 个 key 里选：配色和图标都按 key 取，乱填会退化成 emoji
 * - 已有记录的分类不让删，避免出现指向不存在分类的孤儿流水
 */
const categoryStore = useCategoryStore()

const types = [
  { key: 'expense', name: '支出' },
  { key: 'income', name: '收入' }
]
const type = ref('expense')
/** 列表（带笔数）由本页自己维护；store 那份是给记账/编辑页用的 */
const all = ref([])

const rows = computed(function () {
  return all.value.filter(function (c) { return c.type === type.value })
})
function countOf(t) {
  return all.value.filter(function (c) { return c.type === t }).length
}

/**
 * 图标清单随当前类型变化（T3.4）：支出列表里不该出现「工资」这类收入语义的图标。
 * 换图标面板打开时当前列表就是被编辑分类所属类型，所以用同一个 type 即可。
 */
const iconKeys = computed(function () {
  return categoryService.iconOptions(type.value)
})

async function reload() {
  all.value = await categoryService.listWithStats()
  // 同时刷新全局分类（记账宫格、编辑弹层用的是 store 那份）；
  // 这里是写操作后的强制刷新，必须走 reload（init 有 ready 守卫不生效）
  await categoryStore.reload()
}

/* ---- 面板 ---- */
const panelShow = ref(false)
const panelMode = ref('create')
const editingId = ref(null)
const form = reactive({ name: '', icon: 'more' })

function openCreate() {
  panelMode.value = 'create'
  editingId.value = null
  form.name = ''
  form.icon = 'more'
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
      await categoryService.create({ name: form.name, type: type.value, icon: form.icon })
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
function openActions(c) {
  uni.showActionSheet({
    itemList: ['改名', '换个图标', '上移', '下移', '删除'],
    success: function (res) {
      if (res.tapIndex === 0) doRename(c)
      else if (res.tapIndex === 1) openIcon(c)
      else if (res.tapIndex === 2) doMove(c, -1)
      else if (res.tapIndex === 3) doMove(c, 1)
      else if (res.tapIndex === 4) doRemove(c)
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
