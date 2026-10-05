<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="navbar">
      <mascot-deco class="nav-milo" mood="rich" tier="corner" />
      <view class="icon-btn" @click="goBack"><view class="ib" :style="iconBack" /></view>
      <text class="nav-title">固定支出</text>
      <view style="width: 36px" />
    </view>

    <!-- 说明 -->
    <view class="tip-card">
      <text class="tip-txt">房租、会员费这类每月固定要记的账，配置一次就好。打开 App 时自动补记当月一笔，<text class="tip-b">不会重复</text>。新增的配置从下个月开始生效。</text>
    </view>

    <!-- 配置列表 -->
    <view v-if="store.list.length" class="list-card">
      <view v-for="f in store.list" :key="f.id" class="row">
        <cat-icon :category="catOf(f.category_id)" :size="36" />
        <view class="row-main" @click="openEdit(f)">
          <view class="row-line">
            <text class="row-name">{{ catName(f.category_id) }}<text v-if="f.note" class="row-note"> · {{ f.note }}</text></text>
            <text class="row-amt">-¥{{ formatCents(f.amount_cents) }}</text>
          </view>
          <view class="row-line2">
            <text class="row-sub" :class="{ off: !f.enabled }">每月 {{ f.day_of_month }} 号 · {{ f.enabled ? '自动记账中' : '已停用' }}</text>
            <view class="row-pen" :style="iconEdit" />
          </view>
        </view>
        <switch :checked="f.enabled" :color="UI_PRIMARY" class="row-switch" @change="onToggle(f, $event)" />
        <view class="row-del" @click="onRemove(f)"><text class="row-del-i">×</text></view>
      </view>
    </view>
    <view v-else class="empty">
      <image class="empty-img" src="/static/milo/milo-innocent.webp" mode="aspectFit" />
      <text class="empty-t">还没有固定支出</text>
      <text class="empty-s">把每月都要花的那几笔交给奶龙，它替你记</text>
    </view>

    <!-- 添加按钮 -->
    <view class="add-row" @click="openCreate">
      <text class="add-i">＋</text>
      <text class="add-t">添加固定支出</text>
    </view>

    <!-- 新增 / 编辑表单（底部弹层） -->
    <view v-if="formShow" class="mask" @click="formShow = false">
      <view class="form" @click.stop>
        <text class="form-title">{{ isEditing ? '编辑固定支出' : '添加固定支出' }}</text>

        <!-- 分类 -->
        <text class="f-label">花在哪</text>
        <scroll-view scroll-x class="cat-scroll">
          <view class="cat-wrap">
            <view
              v-for="c in expenseCats"
              :key="c.id"
              class="cat-chip"
              :class="{ on: form.categoryId === c.id }"
              @click="form.categoryId = c.id"
            >{{ c.name }}</view>
          </view>
        </scroll-view>

        <!-- 金额 -->
        <text class="f-label">每月金额</text>
        <view class="amt-box">
          <text class="amt-y">¥</text>
          <input v-model="form.amountStr" class="amt-input" type="digit" placeholder="0.00" placeholder-class="amt-ph" />
        </view>

        <!-- 日期 -->
        <text class="f-label">每月几号记</text>
        <picker mode="selector" :range="dayOptions" :value="dayIndex" @change="onDayChange">
          <view class="day-box"><text class="day-txt">{{ form.dayOfMonth }} 号</text><text class="day-arr">›</text></view>
        </picker>

        <!-- 备注 -->
        <text class="f-label">备注（可选）</text>
        <input v-model="form.note" class="note-input" placeholder="比如 房租 / B站大会员" placeholder-class="amt-ph" />

        <!-- 启停（编辑时可直接在这里改，不用退回列表拨开关） -->
        <view class="f-row">
          <text class="f-row-label">启用自动记账</text>
          <switch :checked="form.enabled" :color="UI_PRIMARY" class="f-row-switch" @change="onEnabledChange" />
        </view>

        <view class="form-row">
          <view class="btn-ghost" @click="formShow = false">取消</view>
          <view class="btn-y" @click="onSave">保存</view>
        </view>
      </view>
    </view>

    <tab-bar current="none" />
  </view>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { useFixedStore } from '../../stores/fixed.js'
import { useCategoryStore } from '../../stores/category.js'
import { formatCents } from '../../utils/money.js'
import { UI_PRIMARY, UI_DANGER } from '../../utils/constant.js'
import { svgMaskStyle } from '../../utils/svg-icon.js'

const store = useFixedStore()
const categoryStore = useCategoryStore()
const expenseCats = computed(function () { return categoryStore.expenseCats })

const formShow = ref(false)
/** 正在编辑的配置 id；null = 新增（同一个弹层复用两种模式，字段完全一致） */
const editingId = ref(null)
const isEditing = computed(function () { return editingId.value !== null })
const form = reactive({ categoryId: null, amountStr: '', dayOfMonth: 1, note: '', enabled: true })
const dayOptions = []
for (let d = 1; d <= 28; d += 1) dayOptions.push(d + ' 号')
const dayIndex = computed(function () { return form.dayOfMonth - 1 })

const catMap = computed(function () {
  return new Map(categoryStore.list.map(function (c) { return [c.id, c] }))
})
function catName(id) {
  const c = catMap.value.get(id)
  return c ? c.name : '其他'
}
function catOf(id) {
  return catMap.value.get(id) || { id: id, name: '其他', icon: '📦', type: 'expense' }
}

function onDayChange(e) {
  form.dayOfMonth = Number(dayOptions[Number(e.detail.value)].replace(' 号', '')) || 1
}
function onEnabledChange(e) {
  form.enabled = !!e.detail.value
}

/** 新增：清空表单。分类不预选——避免用户没注意就存到"早餐"名下 */
function openCreate() {
  editingId.value = null
  form.categoryId = null
  form.amountStr = ''
  form.dayOfMonth = 1
  form.note = ''
  form.enabled = true
  formShow.value = true
}

/** 编辑：把当前配置回填进弹层（金额转成页面口径的字符串） */
function openEdit(f) {
  editingId.value = f.id
  form.categoryId = f.category_id
  form.amountStr = (f.amount_cents / 100).toFixed(2)
  form.dayOfMonth = f.day_of_month
  form.note = f.note || ''
  form.enabled = !!f.enabled
  formShow.value = true
}

async function onSave() {
  const input = {
    amountStr: form.amountStr,
    categoryId: form.categoryId,
    dayOfMonth: form.dayOfMonth,
    note: form.note,
    enabled: form.enabled
  }
  try {
    if (isEditing.value) {
      await store.update(editingId.value, input)
      // 口径说明：本月已记的那笔不动（避免重复记），从下个月起按新配置执行
      uni.showToast({ title: '已保存，下月起按新配置', icon: 'none' })
    } else {
      await store.add(input)
      uni.showToast({ title: '已添加，下月开始自动记账', icon: 'none' })
    }
    formShow.value = false
  } catch (err) {
    uni.showToast({ title: (err && err.message) || '保存失败', icon: 'none' })
  }
}

async function onToggle(f, e) {
  try {
    await store.toggle(f.id, e.detail.value)
  } catch (err) {
    uni.showToast({ title: '操作失败', icon: 'none' })
    store.load()
  }
}

function onRemove(f) {
  uni.showModal({
    title: '删除固定支出',
    content: '删掉后每月就不再自动记账了（已记的流水不受影响）',
    confirmText: '删除',
    confirmColor: UI_DANGER,
    success: function (res) {
      if (!res.confirm) return
      store.remove(f.id).catch(function () {
        uni.showToast({ title: '删除失败', icon: 'none' })
      })
    }
  })
}

function goBack() {
  uni.reLaunch({ url: '/pages/me/me' })
}

const iconBack = svgMaskStyle('M15.4 7.4L14 6l-6 6 6 6 1.4-1.4L10.8 12z')
/** 行内小铅笔：提示"这一条能点开改"（T3.5） */
const iconEdit = svgMaskStyle('M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.9959.9959 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z')

onShow(function () {
  categoryStore.init()
  store.load()
})
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding-bottom: 90px;
  padding-top: var(--status-bar-height, 0px);
}

.navbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px 4px;
  position: relative;
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
.ib {
  width: 18px;
  height: 18px;
  background: var(--cd-icon);
}

.tip-card {
  margin: 10px 16px;
  padding: 12px 16px;
  border-radius: var(--cd-r-md);
  background: var(--cd-primary-lt);
}
.tip-txt {
  font-size: 12px;
  line-height: 1.7;
  color: var(--cd-ink-2);
}
.tip-b {
  font-weight: 800;
  color: var(--cd-ink);
}

.list-card {
  margin: 12px 16px;
  background: var(--cd-surface);
  border-radius: var(--cd-r-md);
  padding: 4px 16px;
  box-shadow: var(--cd-sh-card);
}
.row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 0;
  border-bottom: 1px solid var(--cd-line);
}
.row:last-child {
  border-bottom: none;
}
.row-main {
  flex: 1;
  min-width: 0;
}
.row-line {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.row-name {
  font-size: 14px;
  font-weight: 700;
  color: var(--cd-ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.row-note {
  font-size: 12px;
  font-weight: 500;
  color: var(--cd-ink-2);
}
.row-amt {
  font-size: 14px;
  font-weight: 800;
  color: var(--cd-ink);
  font-variant-numeric: tabular-nums;
  margin-left: 8px;
}
.row-line2 {
  margin-top: 3px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.row-sub {
  font-size: 11px;
  color: var(--cd-ink-2);
}
.row-sub.off {
  text-decoration: line-through;
}
/* 可编辑提示：整块 row-main 都能点开编辑弹层 */
.row-pen {
  width: 13px;
  height: 13px;
  background: var(--cd-icon-2);
  flex: none;
  margin-left: 6px;
}
.row-switch {
  transform: scale(0.8);
  flex: none;
}
.row-del {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: var(--cd-primary-lt);
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
}
.row-del-i {
  color: var(--cd-danger-ink);
  font-size: 16px;
  line-height: 1;
}

.empty {
  margin: 30px 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.empty-img {
  width: 120px;
  height: 120px;
  border-radius: 16px;
  margin-bottom: 10px;
}
.empty-t {
  font-size: 16px;
  font-weight: 800;
  color: var(--cd-ink);
  margin-bottom: 4px;
}
.empty-s {
  font-size: 12px;
  color: var(--cd-ink-2);
}

.add-row {
  margin: 16px;
  padding: 14px 0;
  border-radius: var(--cd-r-pill);
  background: var(--cd-grad-brand);
  box-shadow: var(--cd-sh-btn);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.add-i {
  color: var(--cd-btn-ink);
  font-size: 18px;
  font-weight: 800;
}
.add-t {
  color: var(--cd-btn-ink);
  font-size: 15px;
  font-weight: 800;
}

.mask {
  position: fixed;
  inset: 0;
  background: rgba(93, 78, 55, 0.45);
  z-index: 100;
  display: flex;
  align-items: flex-end;
  animation: cd-fade-in 0.2s;
}
.form {
  width: 100%;
  background: var(--cd-surface);
  border-radius: 28px 28px 0 0;
  padding: 24px 20px calc(20px + env(safe-area-inset-bottom));
  animation: cd-sheet-up 0.3s var(--cd-ease) both;
}
.form-title {
  display: block;
  font-size: 18px;
  font-weight: 800;
  color: var(--cd-ink);
  margin-bottom: 14px;
  text-align: center;
}
.f-label {
  display: block;
  font-size: 12px;
  font-weight: 700;
  color: var(--cd-ink-2);
  margin: 12px 0 6px;
}
.cat-scroll {
  white-space: nowrap;
}
.cat-wrap {
  display: flex;
  gap: 8px;
  padding: 2px;
}
.cat-chip {
  flex: none;
  padding: 7px 14px;
  border-radius: var(--cd-r-pill);
  background: var(--cd-primary-lt);
  color: var(--cd-icon);
  font-size: 13px;
  font-weight: 700;
}
.cat-chip.on {
  background: var(--cd-primary);
  color: var(--cd-btn-ink);
}
.amt-box {
  display: flex;
  align-items: center;
  gap: 4px;
  background: var(--cd-primary-lt);
  border-radius: var(--cd-r-pill);
  padding: 10px 16px;
}
.amt-y {
  font-size: 18px;
  font-weight: 800;
  color: var(--cd-icon);
}
.amt-input {
  flex: 1;
  font-size: 18px;
  font-weight: 800;
  color: var(--cd-ink);
}
.amt-ph {
  color: var(--cd-ink-2);
}
.day-box {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--cd-primary-lt);
  border-radius: var(--cd-r-pill);
  padding: 10px 16px;
}
.day-txt {
  font-size: 14px;
  font-weight: 700;
  color: var(--cd-ink);
}
.day-arr {
  color: var(--cd-icon-2);
  font-size: 16px;
}
.note-input {
  background: var(--cd-primary-lt);
  border-radius: var(--cd-r-pill);
  padding: 10px 16px;
  font-size: 14px;
  color: var(--cd-ink);
}
/* 启停开关：编辑时不用退回列表拨开关 */
.f-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 14px;
}
.f-row-label {
  font-size: 13px;
  font-weight: 700;
  color: var(--cd-ink-2);
}
.f-row-switch {
  transform: scale(0.85);
}
.form-row {
  display: flex;
  gap: 10px;
  margin-top: 18px;
}
.btn-ghost {
  flex: 1;
  background: var(--cd-surface);
  border: 1.5px solid var(--cd-primary);
  color: var(--cd-icon);
  border-radius: var(--cd-r-pill);
  padding: 12px 0;
  font-size: 14px;
  font-weight: 700;
  text-align: center;
}
.btn-y {
  flex: 1;
  background: var(--cd-primary);
  color: var(--cd-btn-ink);
  border-radius: var(--cd-r-pill);
  padding: 12px 0;
  font-size: 14px;
  font-weight: 800;
  text-align: center;
  box-shadow: var(--cd-sh-btn);
}


/* ---- 奶龙 IP 边角装饰 ----
   navbar 是 flex + space-between，装饰件绝对定位后自动退出 flex 流，
   因此右侧按钮排布完全不变（不遮不挤）。top 偏移让它从导航条上缘探出一点，
   与页面主插画呼应。pointer-events:none 由组件保证，压到按钮上也不抢点击。 */
.nav-milo {
  top: -6px;
  right: -4px;
}
</style>
