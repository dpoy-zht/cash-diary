<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="navbar">
      <view class="icon-btn" @click="goHome"><view class="ib" :style="iconBack" /></view>
      <text class="nav-title">奶龙算账</text>
      <view class="icon-btn" @click="toast('日历功能规划中')"><view class="ib" :style="iconCal" /></view>
    </view>

    <!-- 日 / 周 / 月 / 年 -->
    <view class="seg">
      <view
        v-for="s in periods"
        :key="s.key"
        class="seg-item"
        :class="{ on: period === s.key }"
        @click="pickPeriod(s)"
      >{{ s.name }}</view>
    </view>

    <!-- 环形图卡 -->
    <view class="donut-wrap">
      <block v-if="segments.length">
        <view class="donut" :style="{ background: donutBg }">
          <view class="donut-center">
            <image class="donut-milo" src="/static/milo/milo.webp" mode="aspectFit" />
          </view>
        </view>
        <view class="legend">
          <view v-for="s in segments" :key="s.name" class="li">
            <view class="dot" :style="{ background: s.color }" />
            <text class="li-name">{{ s.name }}</text>
            <text class="li-pct">{{ Math.round(s.pct * 100) }}%</text>
          </view>
        </view>
      </block>
      <view v-else class="empty">
        <image class="empty-img" src="/static/milo/milo-innocent.webp" mode="aspectFit" />
        <text class="empty-title">这个月还没有支出哦~</text>
        <text class="empty-sub">记几笔，奶龙帮你看看钱花哪了</text>
      </view>
    </view>

    <!-- 排行卡 -->
    <view v-if="segments.length" class="rank-card">
      <text class="rank-title">花得最多的是…</text>
      <view v-for="s in segments" :key="s.name" class="rank-row">
        <cat-icon :category="catOf(s.name)" :size="32" />
        <view class="rank-main">
          <view class="rank-line">
            <text class="rank-name">{{ s.name }}</text>
            <text class="rank-amt">¥{{ formatCents(s.cents) }}</text>
          </view>
          <view class="bar"><view class="bar-i" :style="{ width: Math.round(s.pct * 100) + '%', background: s.color }" /></view>
        </view>
      </view>
    </view>

    <tab-bar current="stats" />
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { useTxStore } from '../../stores/tx.js'
import { useCategoryStore } from '../../stores/category.js'
import { useMetaStore } from '../../stores/meta.js'
import { expenseByCategory, donutSegments, conicGradient } from '../../utils/stats.js'
import { formatCents } from '../../utils/money.js'
import { svgMaskStyle } from '../../utils/svg-icon.js'

/**
 * 统计（v2.0）：环形图（conic-gradient 分扇区，中心放奶龙）+ 图例 + 分类排行占比条。
 * 数据 = 当前月份支出按分类聚合（expenseByCategory）。
 * 日/周/年暂未实现（参考包也只有月有真实数据），点按提示规划中。
 */
const txStore = useTxStore()
const categoryStore = useCategoryStore()
const metaStore = useMetaStore()

const periods = [
  { key: 'day', name: '日' },
  { key: 'week', name: '周' },
  { key: 'month', name: '月' },
  { key: 'year', name: '年' }
]
const period = ref('month')

const rows = computed(function () {
  return expenseByCategory(txStore.records, categoryStore.list)
})
const segments = computed(function () {
  return donutSegments(rows.value)
})
const donutBg = computed(function () {
  return conicGradient(segments.value)
})

function catOf(name) {
  return categoryStore.list.find(function (c) { return c.name === name }) || { name: name, icon: '📦' }
}
function pickPeriod(s) {
  if (s.key !== 'month') {
    uni.showToast({ title: s.name + '视图规划中', icon: 'none' })
    return
  }
  period.value = s.key
}
function goHome() {
  uni.reLaunch({ url: '/pages/home/home' })
}
function toast(msg) {
  uni.showToast({ title: msg, icon: 'none' })
}

const iconBack = svgMaskStyle('M15.4 7.4L14 6l-6 6 6 6 1.4-1.4L10.8 12z')
const iconCal = svgMaskStyle('M19 3h-1V1h-2v2H8V1H6v2H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2zm0 16H5V9h14v10z')

onShow(function () {
  txStore.loadMonth(metaStore.ym)
})
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding-bottom: 90px;
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
.ib {
  width: 18px;
  height: 18px;
  background: #8a7450;
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
  color: #b89968;
}
.seg-item.on {
  background: var(--cd-primary);
  color: var(--cd-ink);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
}

/* ---- 环形图卡 ---- */
.donut-wrap {
  margin: 12px 16px;
  border-radius: var(--cd-r-card);
  padding: 20px;
  background: var(--cd-grad-brand);
  box-shadow: 0 10px 24px rgba(255, 217, 61, 0.35);
}
.donut {
  width: 200px;
  height: 200px;
  border-radius: 50%;
  margin: 0 auto;
  position: relative;
  background: var(--cd-primary-lt);
}
.donut-center {
  position: absolute;
  inset: 25%;
  background: #ffe082;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.donut-milo {
  width: 82%;
  height: 82%;
}
.legend {
  margin-top: 16px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.li {
  display: flex;
  align-items: center;
  gap: 8px;
}
.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex: none;
}
.li-name {
  font-size: 12px;
  color: var(--cd-ink);
  flex: 1;
}
.li-pct {
  font-size: 12px;
  font-weight: 700;
  color: var(--cd-ink);
}

/* ---- 空状态 ---- */
.empty {
  padding: 20px;
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
.empty-title {
  font-size: 16px;
  font-weight: 800;
  color: var(--cd-ink);
  margin-bottom: 4px;
}
.empty-sub {
  font-size: 12px;
  color: rgba(93, 78, 55, 0.75);
}

/* ---- 排行卡 ---- */
.rank-card {
  margin: 12px 16px;
  background: var(--cd-surface);
  border-radius: var(--cd-r-md);
  padding: 16px;
  box-shadow: var(--cd-sh-card);
}
.rank-title {
  font-size: 15px;
  font-weight: 800;
  color: var(--cd-ink);
  display: block;
  margin-bottom: 10px;
}
.rank-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
}
.rank-main {
  flex: 1;
  min-width: 0;
}
.rank-line {
  display: flex;
  justify-content: space-between;
}
.rank-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--cd-ink);
}
.rank-amt {
  font-size: 13px;
  font-weight: 700;
  color: var(--cd-ink);
}
.bar {
  height: 6px;
  border-radius: 3px;
  background: var(--cd-line);
  margin-top: 5px;
  overflow: hidden;
}
.bar-i {
  height: 100%;
  border-radius: 3px;
}
</style>
