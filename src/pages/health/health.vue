<template>
  <view class="page">
    <view class="navbar">
      <view class="icon-btn" @click="goBack"><view class="ib" :style="iconBack" /></view>
      <text class="nav-title">数据体检</text>
      <view class="nav-spacer" />
    </view>

    <block v-if="scan">
      <!-- 结论 -->
      <view class="summary" :class="summaryClass">
        <text class="sm-title">{{ summaryTitle }}</text>
        <text class="sm-sub">{{ summarySub }}</text>
      </view>

      <!-- 问题清单 -->
      <view v-for="it in scan.issues" :key="it.key" class="card">
        <view class="it-head">
          <view class="dot" :class="it.severity" />
          <text class="it-title">{{ it.title }}</text>
          <text class="it-count">{{ it.count }}</text>
        </view>
        <view v-if="it.samples.length" class="samples">
          <text v-for="(s, i) in it.samples" :key="i" class="sample">{{ s }}</text>
        </view>
        <text v-if="it.fixHint" class="fix-line">可以修：{{ it.fixHint }}</text>
        <text v-if="it.advice" class="advice">{{ it.advice }}</text>
      </view>

      <!-- 一切正常 -->
      <view v-if="scan.healthy" class="card ok-card">
        <text class="ok-txt">没有孤儿记录、异常金额，备份也是新的。</text>
        <text class="ok-sub">继续好好记账吧~</text>
      </view>

      <view v-if="scan.fixableCount" class="fix-bar">
        <button class="fix-btn" hover-class="btn-hover" @click="confirmRepair">
          一键修复（{{ scan.fixableCount }} 项可修）
        </button>
        <text class="fix-note">修复前建议先导出一次备份；需要你自己判断的问题（比如日期选错）不会被动。</text>
      </view>

      <text class="foot">
        检查范围：{{ scan.stats.transactions }} 笔流水、{{ scan.stats.categories }} 个分类、{{ scan.stats.accounts }} 个账本、{{ scan.stats.budgets }} 条预算、{{ scan.stats.fixedExpenses }} 条固定支出
      </text>
    </block>

    <view v-else class="loading">
      <text class="loading-txt">正在翻账本…</text>
    </view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { scanDataHealth, repairDataHealth } from '../../services/maintenance.js'
import { collectFixes } from '../../utils/health.js'
import { useTxStore } from '../../stores/tx.js'
import { useCategoryStore } from '../../stores/category.js'
import { useBudgetStore } from '../../stores/budget.js'
import { useMetaStore } from '../../stores/meta.js'
import { svgMaskStyle } from '../../utils/svg-icon.js'

/**
 * 数据体检（T4.6）：把整库扫一遍，列出平时看不出来的脏记录。
 *
 * 页面本身不做任何判断 —— 什么算问题、能不能修、怎么修，全在 utils/health.js 里定好，
 * 这里只负责把清单和"要动哪些数据"讲清楚，让用户在按下去之前知道会发生什么。
 */
const txStore = useTxStore()
const categoryStore = useCategoryStore()
const budgetStore = useBudgetStore()
const metaStore = useMetaStore()

const scan = ref(null)

function reload() {
  return scanDataHealth()
    .then(function (r) { scan.value = r })
    .catch(function () {
      uni.showToast({ title: '体检失败，请稍后再试', icon: 'none' })
    })
}

const summaryClass = computed(function () {
  if (!scan.value) return ''
  if (scan.value.healthy) return 'ok'
  return scan.value.fixableCount ? 'warn' : 'info'
})
const summaryTitle = computed(function () {
  if (!scan.value) return ''
  if (scan.value.healthy) return '一切正常'
  return '发现 ' + scan.value.issues.length + ' 个问题'
})
const summarySub = computed(function () {
  if (!scan.value) return ''
  if (scan.value.healthy) return '数据干净，备份也不旧'
  return scan.value.fixableCount
    ? '其中 ' + scan.value.fixableCount + ' 项可以一键修复'
    : '剩下这些需要你自己确认，体检不会替你动数据'
})

/** 修复前把"将要对数据做什么"一条条摆出来确认 —— 不能只写"一键修复"就动手 */
function confirmRepair() {
  const plan = collectFixes(scan.value)
  const total =
    plan.txPatches.length + plan.txDeletes.length + plan.budgetDeletes.length +
    plan.fixedDeletes.length + plan.categoryPatches.length
  const lines = plan.summary.map(function (s) { return '· ' + s }).join('\n')
  uni.showModal({
    title: '确认修复',
    content: '将要：\n' + lines + '\n\n共涉及 ' + total + ' 条记录。修复前建议先导出一份备份。',
    confirmText: '开始修复',
    success: function (res) {
      if (res.confirm) doRepair()
    }
  })
}

async function doRepair() {
  uni.showLoading({ title: '修复中…', mask: true })
  try {
    const r = await repairDataHealth(scan.value)
    // 分类 / 流水 / 预算都动过了：store 全部重读，查询缓存失效
    await categoryStore.reload()
    await budgetStore.load()
    metaStore.bumpData()
    await txStore.refresh(metaStore.ym)
    await reload()
    uni.hideLoading()
    uni.showToast({
      title: r.changed ? '已修复 ' + r.changed + ' 处' : '没有需要处理的了',
      icon: 'none'
    })
  } catch (err) {
    uni.hideLoading()
    uni.showToast({ title: (err && err.message) || '修复失败，请稍后再试', icon: 'none' })
  }
}

function goBack() {
  uni.reLaunch({ url: '/pages/me/me' })
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
  /* 让出状态栏（与其余页面一致） */
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
.nav-spacer {
  width: 36px;
  height: 36px;
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

/* ---- 结论卡 ---- */
.summary {
  margin: 12px 16px;
  border-radius: var(--cd-r-card);
  padding: 18px 20px;
  background: var(--cd-surface);
  box-shadow: var(--cd-sh-card);
  border-left: 6px solid var(--cd-icon-3);
}
.summary.ok {
  border-left-color: var(--cd-income);
}
.summary.warn {
  border-left-color: var(--cd-primary-deep);
}
.summary.info {
  border-left-color: var(--cd-icon-2);
}
.sm-title {
  display: block;
  font-size: 18px;
  font-weight: 800;
  color: var(--cd-ink);
}
.sm-sub {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: var(--cd-ink-2);
}

/* ---- 问题卡 ---- */
.card {
  margin: 12px 16px;
  background: var(--cd-surface);
  border-radius: var(--cd-r-md);
  padding: 16px;
  box-shadow: var(--cd-sh-card);
}
.it-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex: none;
  background: var(--cd-icon-3);
}
.dot.high {
  background: var(--cd-danger-ink);
}
.dot.mid {
  background: var(--cd-primary-deep);
}
.dot.low {
  background: var(--cd-icon-2);
}
.it-title {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  font-weight: 700;
  color: var(--cd-ink);
}
.it-count {
  font-size: 14px;
  font-weight: 800;
  color: var(--cd-ink);
  font-variant-numeric: tabular-nums;
}
.samples {
  margin-top: 8px;
}
.sample {
  display: block;
  font-size: 11px;
  line-height: 1.8;
  color: var(--cd-ink-2);
  font-variant-numeric: tabular-nums;
}
.fix-line {
  display: block;
  margin-top: 10px;
  font-size: 12px;
  font-weight: 700;
  color: var(--cd-income);
  line-height: 1.6;
}
.advice {
  display: block;
  margin-top: 6px;
  font-size: 11px;
  line-height: 1.7;
  color: var(--cd-ink-2);
}

/* ---- 一切正常 ---- */
.ok-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 26px 16px;
}
.ok-txt {
  font-size: 14px;
  font-weight: 700;
  color: var(--cd-ink);
}
.ok-sub {
  margin-top: 6px;
  font-size: 12px;
  color: var(--cd-ink-2);
}

/* ---- 修复按钮 ---- */
.fix-bar {
  margin: 18px 16px 0;
}
/* 用类选择器而不是 button 标签：uni-app H5 把 <button> 渲染成 <uni-button> */
.fix-btn {
  width: 100%;
  height: 50px;
  line-height: 50px;
  border-radius: var(--cd-r-pill);
  background: var(--cd-primary);
  color: var(--cd-btn-ink);
  font-family: var(--cd-font);
  font-size: 16px;
  font-weight: 800;
  box-shadow: var(--cd-sh-btn);
}
.fix-btn::after {
  border: none;
}
.btn-hover {
  opacity: 0.9;
  transform: scale(0.98) translateY(1px);
}
.fix-note {
  display: block;
  margin-top: 10px;
  font-size: 11px;
  line-height: 1.7;
  color: var(--cd-ink-2);
}

.foot {
  display: block;
  margin: 20px 16px 0;
  font-size: 11px;
  line-height: 1.8;
  color: var(--cd-ink-2);
}

.loading {
  padding: 60px 16px;
  text-align: center;
}
.loading-txt {
  font-size: 13px;
  color: var(--cd-ink-2);
}
</style>
