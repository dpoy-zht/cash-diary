<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="navbar">
      <view class="icon-btn" @click="toast('菜单功能规划中')"><view class="ib" :style="iconMenu" /></view>
      <text class="nav-title">奶龙记账</text>
      <view class="nav-right">
        <view class="icon-btn" @click="showSalary"><view class="ib" :style="iconCoin" /></view>
        <view class="icon-btn" @click="showOver"><view class="ib" :style="iconBell" /></view>
      </view>
    </view>

    <!-- 月份切换 -->
    <view class="month-switch">
      <view class="arr" @click="shiftMonth(-1)">‹</view>
      <text class="month-label">{{ ymText }}</text>
      <view class="arr" @click="shiftMonth(1)">›</view>
    </view>
    <view class="month-sub">{{ isCurrentMonth ? '本月你还可以花' : '这个月你还可以花' }}</view>

    <!-- 余额卡 -->
    <view class="balance-card">
      <image class="milo" src="/static/milo/milo.webp" mode="aspectFit" />
      <text class="balance-num">¥{{ balanceText }}</text>
      <view class="balance-row">
        <text class="inc">已存 ¥{{ incomeText }}</text>
        <text class="exp">已花 ¥{{ expenseText }}</text>
      </view>
      <view class="heart" :style="iconHeart" />
    </view>

    <!-- 工资到账横幅（默认隐藏，点金币弹出，3.5s 消失） -->
    <view v-if="salaryShow" class="salary-banner">
      <image class="sb-img" src="/static/milo/milo-jump.webp" mode="aspectFit" />
      <view class="sb-txt">
        <text class="sb-b">工资到账啦！</text>
        <text class="sb-s">+¥{{ incomeText }}，奶龙蹦起来了</text>
      </view>
    </view>

    <!-- 全部 / 支出 / 收入 -->
    <view class="seg">
      <view
        v-for="s in segs"
        :key="s.key"
        class="seg-item"
        :class="{ on: seg === s.key }"
        @click="seg = s.key"
      >{{ s.name }}</view>
    </view>

    <!-- 流水（按天分组） -->
    <view class="txn-card">
      <block v-if="filtered.length">
        <block v-for="g in groups" :key="g.day">
          <view class="day-label">{{ dayLabel(g.day) }}</view>
          <tx-item
            v-for="r in g.items"
            :key="r.id"
            :record="r"
            :category="catOf(r.category_id)"
            @click="openEdit(r)"
          />
        </block>
      </block>
      <view v-else class="empty">
        <image class="empty-img" src="/static/milo/milo-innocent.webp" mode="aspectFit" />
        <text class="empty-title">今天还没记账哦~</text>
        <text class="empty-sub">点下面的加号，记一笔今天的小花费吧</text>
      </view>
    </view>

    <!-- 右下 FAB -->
    <view class="fab" @click="goAdd"><text class="fab-i">+</text></view>

    <!-- 超支弹窗 -->
    <view v-if="overShow" class="mask" @click="overShow = false">
      <view class="modal" @click.stop>
        <image class="modal-img" src="/static/milo/milo-sad.webp" mode="aspectFit" />
        <text class="modal-title">哎呀，这个月要吃土咯…</text>
        <text class="modal-tip">这个月花超啦，要不咱省着点花？</text>
        <view class="modal-row">
          <view class="btn-ghost" @click="overShow = false">以后再说</view>
          <view class="btn-y" @click="goStats">去看看账单</view>
        </view>
      </view>
    </view>

    <edit-sheet
      :record="editing"
      :categories="editingCats"
      @close="closeEdit"
      @save="onSave"
      @remove="onRemove"
    />
    <tab-bar current="home" />
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { useTxStore } from '../../stores/tx.js'
import { useCategoryStore } from '../../stores/category.js'
import { useMetaStore } from '../../stores/meta.js'
import { groupByDay, dayLabel } from '../../utils/date.js'
import { formatCents } from '../../utils/money.js'
import { balanceCents } from '../../utils/stats.js'
import { svgMaskStyle } from '../../utils/svg-icon.js'

/**
 * 首页（v2.0）：月份切换 + 余额卡 + 全部/支出/收入分段 + 按日流水 + FAB。
 * 数据全部来自 store：txStore.loadMonth(metaStore.ym) 驱动余额与列表。
 */
const txStore = useTxStore()
const categoryStore = useCategoryStore()
const metaStore = useMetaStore()

const seg = ref('all')
const segs = [
  { key: 'all', name: '全部' },
  { key: 'expense', name: '支出' },
  { key: 'income', name: '收入' }
]

const salaryShow = ref(false)
const overShow = ref(false)
const editing = ref(null)

const ymText = computed(function () {
  const parts = metaStore.ym.split('-')
  return parts[0] + '年' + Number(parts[1]) + '月'
})
const isCurrentMonth = computed(function () {
  const d = new Date()
  const now = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
  return metaStore.ym === now
})

const incomeText = computed(function () {
  return formatCents(txStore.summary.incomeCents)
})
const expenseText = computed(function () {
  return formatCents(txStore.summary.expenseCents)
})
const balanceText = computed(function () {
  return formatCents(balanceCents(txStore.summary))
})

const filtered = computed(function () {
  if (seg.value === 'all') return txStore.records
  return txStore.records.filter(function (r) { return r.type === seg.value })
})
const groups = computed(function () {
  return groupByDay(filtered.value)
})
const catMap = computed(function () {
  return new Map(categoryStore.list.map(function (c) { return [c.id, c] }))
})
const editingCats = computed(function () {
  if (!editing.value) return []
  return editing.value.type === 'expense' ? categoryStore.expenseCats : categoryStore.incomeCats
})

function catOf(id) {
  return catMap.value.get(id) || { id: id, name: '其他', icon: '📦', type: 'expense' }
}

function shiftMonth(d) {
  metaStore.shift(d)
}
function goAdd() {
  uni.navigateTo({ url: '/pages/add/add' })
}
function goStats() {
  overShow.value = false
  uni.reLaunch({ url: '/pages/stats/stats' })
}

let salaryTimer = null
function showSalary() {
  salaryShow.value = true
  clearTimeout(salaryTimer)
  salaryTimer = setTimeout(function () { salaryShow.value = false }, 3500)
}
function showOver() {
  overShow.value = true
}
function openEdit(r) {
  editing.value = r
}
function closeEdit() {
  editing.value = null
}
async function onSave(payload) {
  try {
    await txStore.update(metaStore.ym, editing.value.id, payload)
    editing.value = null
    uni.showToast({ title: '已保存', icon: 'none' })
  } catch (err) {
    uni.showToast({ title: (err && err.message) || '保存失败', icon: 'none' })
  }
}
function onRemove() {
  uni.showModal({
    title: '删除记录',
    content: '确定删除这条记录吗？',
    success: function (res) {
      if (!res.confirm) return
      const id = editing.value.id
      editing.value = null
      txStore.remove(metaStore.ym, id).then(function () {
        uni.showToast({ title: '已删除', icon: 'none' })
      })
    }
  })
}
function toast(msg) {
  uni.showToast({ title: msg, icon: 'none' })
}

const iconMenu = svgMaskStyle('M3 6h18v2H3V6zm0 5h18v2H3v-2zm0 5h18v2H3v-2z')
const iconCoin = svgMaskStyle('M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17.93V18h-2v1.93A8.01 8.01 0 014.07 13H6v-2H4.07A8.01 8.01 0 0111 4.07V6h2V4.07A8.01 8.01 0 0119.93 11H18v2h1.93A8.01 8.01 0 0113 19.93z')
const iconBell = svgMaskStyle('M12 22a2 2 0 002-2h-4a2 2 0 002 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4a1.5 1.5 0 00-3 0v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z')
const iconHeart = svgMaskStyle('M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z')

onShow(function () {
  txStore.loadMonth(metaStore.ym)
})
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding-bottom: 90px; /* 让出底部 Tab */
}

/* ---- 顶部导航 ---- */
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
.nav-right {
  display: flex;
  gap: 8px;
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
  background: #8a7450;
}

/* ---- 月份切换 ---- */
.month-switch {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 8px 0 4px;
}
.arr {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--cd-primary-lt);
  color: #8a7450;
  font-size: 16px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}
.month-label {
  font-size: 16px;
  font-weight: 700;
  color: var(--cd-ink);
}
.month-sub {
  text-align: center;
  font-size: 12px;
  color: var(--cd-ink-2);
  margin-top: 2px;
}

/* ---- 余额卡 ---- */
.balance-card {
  margin: 12px 16px;
  padding: 20px;
  border-radius: var(--cd-r-card);
  background: var(--cd-grad-brand);
  box-shadow: 0 10px 24px rgba(255, 217, 61, 0.35);
  position: relative;
}
.milo {
  position: absolute;
  top: -24px;
  right: 10px;
  width: 84px;
  height: 100px;
}
.balance-num {
  font-size: 34px;
  font-weight: 800;
  color: var(--cd-ink);
  letter-spacing: -1px;
}
.balance-row {
  display: flex;
  gap: 16px;
  margin-top: 8px;
  font-size: 13px;
}
.inc {
  color: var(--cd-income);
  font-weight: 700;
}
.exp {
  color: var(--cd-ink);
}
.heart {
  position: absolute;
  right: 16px;
  bottom: 14px;
  width: 20px;
  height: 20px;
  background: var(--cd-heart);
}

/* ---- 工资横幅 ---- */
.salary-banner {
  margin: 8px 16px;
  border-radius: var(--cd-r-md);
  padding: 12px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  background: linear-gradient(135deg, var(--cd-blush) 0%, var(--cd-primary) 100%);
  animation: cd-sheet-up 0.4s var(--cd-ease) both;
}
.sb-img {
  width: 52px;
  height: 52px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.4);
}
.sb-txt {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.sb-b {
  color: var(--cd-btn-ink);
  font-size: 16px;
  font-weight: 800;
}
.sb-s {
  color: var(--cd-btn-ink);
  font-size: 13px;
  opacity: 0.95;
}

/* ---- 分段 ---- */
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
  color: #b89968;
}
.seg-item.on {
  background: var(--cd-primary);
  color: var(--cd-ink);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
}

/* ---- 流水卡 ---- */
.txn-card {
  margin: 12px 16px;
  background: var(--cd-surface);
  border-radius: var(--cd-r-md);
  padding: 4px 16px 8px;
  box-shadow: var(--cd-sh-card);
}
.day-label {
  font-size: 12px;
  color: var(--cd-ink-2);
  padding: 12px 0 4px;
  font-weight: 600;
}

/* ---- 空状态 ---- */
.empty {
  padding: 30px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.empty-img {
  width: 140px;
  height: 140px;
  border-radius: 16px;
  margin-bottom: 12px;
}
.empty-title {
  font-size: 17px;
  font-weight: 800;
  color: var(--cd-ink);
  margin-bottom: 6px;
}
.empty-sub {
  font-size: 13px;
  color: var(--cd-ink-2);
}

/* ---- FAB ---- */
.fab {
  position: fixed;
  right: 20px;
  bottom: 110px;
  width: 58px;
  height: 58px;
  border-radius: 50%;
  background: radial-gradient(circle at 30% 30%, #ffe97a, #ffc93c);
  box-shadow: var(--cd-sh-pop);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 40;
}
.fab-i {
  color: var(--cd-btn-ink);
  font-size: 30px;
  font-weight: 700;
  line-height: 1;
  margin-top: -2px;
}

/* ---- 超支弹窗 ---- */
.mask {
  position: fixed;
  inset: 0;
  background: rgba(93, 78, 55, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 24px;
  animation: cd-fade-in 0.2s;
}
.modal {
  background: var(--cd-surface);
  border-radius: 28px;
  width: 100%;
  max-width: 320px;
  padding: 28px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  animation: cd-pop 0.3s var(--cd-ease) both;
}
.modal-img {
  width: 140px;
  height: 140px;
  border-radius: 16px;
  margin-bottom: 12px;
}
.modal-title {
  font-size: 21px;
  font-weight: 800;
  color: var(--cd-ink);
  margin-bottom: 6px;
  text-align: center;
}
.modal-tip {
  font-size: 12px;
  color: var(--cd-ink-2);
  margin: 8px 0 18px;
  text-align: center;
}
.modal-row {
  display: flex;
  gap: 10px;
  width: 100%;
}
.btn-ghost {
  flex: 1;
  background: var(--cd-surface);
  border: 1.5px solid var(--cd-primary);
  color: #8a7450;
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
  font-weight: 700;
  text-align: center;
  box-shadow: var(--cd-sh-btn);
}
</style>
