<template>
  <view class="page">
    <view class="navbar">
      <mascot-deco class="nav-milo" mood="sad" tier="corner" />
      <view class="icon-btn" hover-class="ib-hover" @click="goBack"><view class="ib" :style="iconBack" /></view>
      <text class="nav-title">预算设置</text>
      <view class="icon-btn" style="visibility:hidden"><view class="ib" /></view>
    </view>

    <!-- 本月总预算卡：右上角趴一只奶龙，表情跟着预算水位走 -->
    <view class="total-card">
      <mascot-deco class="tc-milo" :mood="totalMood" tier="corner" :size="56" />
      <text class="tc-label">本月总预算</text>
      <text v-if="!budgetStore.hasTotal" class="tc-empty">还没设预算，点一下设置</text>
      <block v-else>
        <text class="tc-num">¥{{ totalText }}</text>
        <view class="tc-row">
          <text class="tc-spent">已花 ¥{{ spentText }}</text>
          <text class="tc-remain" :class="{ over: totalStatus.level === 'over' }">
            {{ totalStatus.remainCents >= 0 ? '还能花 ¥' + formatCents(totalStatus.remainCents) : '已超 ¥' + formatCents(-totalStatus.remainCents) }}
          </text>
        </view>
        <view class="bar"><view class="bar-i" :class="totalStatus.level" :style="{ width: totalPercent + '%' }" /></view>
        <text class="tc-tip">{{ totalTip }}</text>
      </block>
      <view class="tc-edit" hover-class="tc-edit-hover" @click="editTotal">
        <text class="tc-edit-t">{{ budgetStore.hasTotal ? '修改总预算' : '设置总预算' }}</text>
      </view>
    </view>

    <!-- 分类预算 -->
    <text class="section-label">分类预算（{{ setCount }} / {{ cats.length }} 已设）</text>
    <view class="list-card">
      <view
        v-for="c in cats"
        :key="c.id"
        class="row"
        hover-class="row-hover"
        @click="editCategory(c)"
      >
        <cat-icon :category="c" :size="36" />
        <view class="row-main">
          <view class="row-line">
            <text class="row-name">{{ c.name }}</text>
            <text class="row-num" :class="rowClass(c)">{{ rowText(c) }}</text>
          </view>
          <view v-if="budgetStore.limitOf(c.id)" class="bar bar-sm">
            <view class="bar-i" :class="statusOf(c).level" :style="{ width: percentOf(c) + '%' }" />
          </view>
          <text v-else class="row-hint">点一下设个上限</text>
        </view>
      </view>
    </view>

    <text class="foot">预算按账本单独保存，设一次每月都生效。点一行即可设置；把金额清空就是不设预算。</text>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { useTxStore } from '../../stores/tx.js'
import { useCategoryStore } from '../../stores/category.js'
import { useMetaStore } from '../../stores/meta.js'
import { useBudgetStore } from '../../stores/budget.js'
import { formatCents } from '../../utils/money.js'
import { budgetStatus, progressPercent } from '../../utils/budget.js'
import { svgMaskStyle } from '../../utils/svg-icon.js'

/**
 * 预算设置页：本月总预算 + 12 个支出分类的分类预算。
 * 点卡片/点行弹输入框设置，清空即取消预算。
 * 判断逻辑全在 utils/budget.js（纯函数，有单测）。
 */
const txStore = useTxStore()
const categoryStore = useCategoryStore()
const metaStore = useMetaStore()
const budgetStore = useBudgetStore()

const cats = computed(function () {
  return categoryStore.expenseCats
})

/** 本月各分类已花（按 category_id 汇总） */
const spentByCat = computed(function () {
  const map = {}
  txStore.records.forEach(function (r) {
    if (r.type !== 'expense') return
    const k = String(r.category_id)
    map[k] = (map[k] || 0) + r.amount_cents
  })
  return map
})

const totalText = computed(function () {
  return formatCents(budgetStore.totalCents)
})
const spentText = computed(function () {
  return formatCents(txStore.summary.expenseCents)
})
const totalStatus = computed(function () {
  return budgetStatus(budgetStore.totalCents, txStore.summary.expenseCents)
})
const totalPercent = computed(function () {
  return progressPercent(budgetStore.totalCents, txStore.summary.expenseCents)
})
const totalTip = computed(function () {
  const lv = totalStatus.value.level
  if (lv === 'over') return '本月已经超预算啦，接下来省着点花~'
  if (lv === 'warn') return '快到预算上限了，注意一下'
  return '按这个节奏，预算够用~'
})
/**
 * 预算卡右上角的表情，跟着水位走：
 * 没设预算 → innocent（等用户来设）；宽裕 → milo（默认歪头）；
 * 接近上限或已超 → sad（同一张最贴切，不额外引入新素材）。
 * 判断复用 totalStatus 的 level，不另立标准，避免与下方文案口径不一致。
 */
const totalMood = computed(function () {
  if (!budgetStore.hasTotal) return 'innocent'
  const lv = totalStatus.value.level
  if (lv === 'over' || lv === 'warn') return 'sad'
  return 'milo'
})
const setCount = computed(function () {
  let n = 0
  cats.value.forEach(function (c) {
    if (budgetStore.limitOf(c.id)) n += 1
  })
  return n
})

function statusOf(c) {
  return budgetStatus(budgetStore.limitOf(c.id), spentByCat.value[String(c.id)] || 0)
}
function percentOf(c) {
  return progressPercent(budgetStore.limitOf(c.id), spentByCat.value[String(c.id)] || 0)
}
function rowText(c) {
  const limit = budgetStore.limitOf(c.id)
  const spent = spentByCat.value[String(c.id)] || 0
  if (!limit) return '未设'
  return '¥' + formatCents(spent) + ' / ¥' + formatCents(limit)
}
function rowClass(c) {
  const lv = statusOf(c).level
  if (lv === 'over') return 'over'
  if (lv === 'warn') return 'warn'
  return ''
}

/* ---- 设置预算 ---- */
function askLimit(title, currentCents, onSubmit) {
  uni.showModal({
    title: title,
    editable: true,
    placeholderText: '输入金额（元），留空 = 不设预算',
    content: currentCents ? String(currentCents / 100) : '',
    success: function (res) {
      if (!res.confirm) return
      Promise.resolve()
        .then(function () { return onSubmit(String(res.content || '').trim()) })
        .then(function () {
          uni.showToast({ title: '已保存', icon: 'none' })
        })
        .catch(function (err) {
          uni.showToast({ title: (err && err.message) || '保存失败', icon: 'none' })
        })
    }
  })
}

function editTotal() {
  askLimit('本月总预算', budgetStore.totalCents, function (v) {
    return budgetStore.setTotal(v)
  })
}
function editCategory(c) {
  const limit = budgetStore.limitOf(c.id)
  askLimit(c.name + ' 的预算', limit, function (v) {
    return budgetStore.setCategory(c.id, v)
  })
}

function goBack() {
  uni.navigateBack({
    fail: function () {
      uni.reLaunch({ url: '/pages/home/home' })
    }
  })
}

const iconBack = svgMaskStyle('M15.4 7.4L14 6l-6 6 6 6 1.4-1.4L10.8 12z')

onShow(function () {
  budgetStore.load()
  txStore.refresh(metaStore.ym)
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
.ib-hover {
  background: var(--cd-primary);
}
.ib {
  width: 18px;
  height: 18px;
  background: var(--cd-icon);
}

/* ---- 总预算卡 ---- */
.total-card {
  margin: 12px 16px;
  padding: 20px;
  border-radius: var(--cd-r-card);
  background: var(--cd-grad-brand);
  box-shadow: 0 10px 24px rgba(255, 217, 61, 0.35);
  overflow: hidden;
  position: relative;
}
.tc-label {
  font-size: 12px;
  color: var(--cd-icon);
}
.tc-empty {
  display: block;
  font-size: 18px;
  font-weight: 800;
  color: var(--cd-ink);
  margin-top: 6px;
}
.tc-num {
  display: block;
  font-size: 30px;
  font-weight: 800;
  color: var(--cd-ink);
  letter-spacing: -0.5px;
  margin-top: 2px;
  font-variant-numeric: tabular-nums;
}
.tc-row {
  display: flex;
  gap: 16px;
  margin-top: 6px;
  font-size: 13px;
  font-weight: 700;
}
.tc-spent {
  color: var(--cd-ink);
}
.tc-remain {
  color: var(--cd-income);
}
.tc-remain.over {
  color: var(--cd-danger-ink);
}
.tc-tip {
  display: block;
  font-size: 11px;
  color: var(--cd-icon);
  margin-top: 6px;
}
.tc-edit {
  margin-top: 14px;
  background: rgba(255, 255, 255, 0.66);
  border-radius: var(--cd-r-pill);
  padding: 10px 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.tc-edit-hover {
  background: rgba(255, 255, 255, 0.9);
}
.tc-edit-t {
  font-size: 14px;
  font-weight: 800;
  color: var(--cd-ink);
}

/* ---- 进度条 ---- */
.bar {
  height: 6px;
  background: rgba(255, 255, 255, 0.6);
  border-radius: 3px;
  margin-top: 8px;
  overflow: hidden;
}
.bar-sm {
  background: var(--cd-line);
  margin-top: 5px;
}
.bar-i {
  height: 100%;
  border-radius: 3px;
  background: var(--cd-surface);
}
.bar-i.safe {
  background: var(--cd-surface);
}
.bar-i.warn {
  background: #ffb74d;
}
.bar-i.over {
  background: #ef5350;
}
.bar-sm .bar-i.safe {
  background: var(--cd-income);
}

/* ---- 分类预算列表 ---- */
.section-label {
  display: block;
  margin: 16px 20px 6px;
  font-size: 13px;
  font-weight: 700;
  color: var(--cd-ink-2);
}
.list-card {
  margin: 0 16px;
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
.row-line {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}
.row-name {
  font-size: 14px;
  font-weight: 700;
  color: var(--cd-ink);
}
.row-num {
  font-size: 12px;
  color: var(--cd-ink-2);
  font-variant-numeric: tabular-nums;
}
.row-num.warn {
  color: #ba7517;
  font-weight: 700;
}
.row-num.over {
  color: var(--cd-danger-ink);
  font-weight: 700;
}
/* 未设预算的行：不画空进度条，给一句可操作的提示 */
.row-hint {
  display: block;
  font-size: 11px;
  color: var(--cd-ink-2);
  margin-top: 4px;
}

.foot {
  display: block;
  margin: 16px 20px;
  font-size: 11px;
  line-height: 1.7;
  color: var(--cd-ink-2);
}


/* ---- 奶龙 IP 边角装饰 ----
   navbar 是 flex + space-between，装饰件绝对定位后自动退出 flex 流，
   因此右侧按钮排布完全不变（不遮不挤）。top 偏移让它从导航条上缘探出一点，
   与页面主插画呼应。pointer-events:none 由组件保证，压到按钮上也不抢点击。 */
.nav-milo {
  top: -6px;
  right: -4px;
}

/* ---- 奶龙 IP 装饰 ----
   .tc-num 是 30px 大字、进度条满宽，装饰件绝对定位 + 右上下沉后
   视觉上"探出"卡片，不与任何数字重叠。overflow:hidden 保证不溢出圆角。 */
.tc-milo {
  top: 6px;
  right: 10px;
  opacity: 0.95;
}

</style>
