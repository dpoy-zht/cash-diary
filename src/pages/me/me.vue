<template>
  <view class="page">
    <!-- 1. 渐变头部：挥手奶龙 + 昵称 + 等级 + 连续记账胶囊 -->
    <view class="profile-head">
      <image class="head-milo" src="/static/milo/milo-waving.webp" mode="aspectFit" />
      <view class="head-main">
        <text class="head-name">奶龙本龙</text>
        <text class="head-level">Lv.{{ lv.level }} {{ lv.title }}</text>
        <view class="head-chip"><text class="head-chip-t">已坚持记账 {{ streak }} 天</text></view>
      </view>
    </view>

    <!-- 2. 三个统计小卡 -->
    <view class="stat-row">
      <view class="stat-cell">
        <text class="sc-label">本月已花</text>
        <text class="sc-value">¥{{ monthExpenseText }}</text>
      </view>
      <view class="stat-cell">
        <text class="sc-label">累计已存</text>
        <text class="sc-value sc-inc">¥{{ totalIncomeText }}</text>
      </view>
      <view class="stat-cell">
        <text class="sc-label">连续记账</text>
        <text class="sc-value sc-gold">{{ streak }} 天</text>
      </view>
    </view>

    <!-- 3. 本月攒钱小目标（点一下可设置目标金额） -->
    <view class="goal-card" hover-class="goal-hover" @click="editGoal">
      <image class="goal-img" src="/static/milo/milo-rich.webp" mode="aspectFit" />
      <view class="goal-main">
        <text class="goal-title">本月攒钱小目标</text>
        <text class="goal-sub">{{ goalText }}</text>
        <view class="goal-bar"><view class="goal-bar-i" :style="{ width: goalPct + '%' }" /></view>
        <text class="goal-tip">{{ goalTip }}</text>
      </view>
    </view>

    <!-- 4. 功能列表 -->
    <view class="fn-card">
      <view
        v-for="f in fns"
        :key="f.key"
        class="fn-row"
        hover-class="fn-hover"
        @click="tapFn(f)"
      >
        <view class="fn-ic" :style="{ background: f.color }">
          <view class="fn-glyph" :style="maskOf(f)" />
        </view>
        <text class="fn-name">{{ f.name }}</text>
        <text class="fn-arrow">{{ f.right || '›' }}</text>
      </view>
    </view>

    <!-- 5. 底部问候 -->
    <view class="greet-card">
      <image class="greet-img" src="/static/milo/milo-waving.webp" mode="aspectFit" />
      <view class="greet-main">
        <text class="greet-t">今天也要好好记账哦</text>
        <text class="greet-s">奶龙会一直陪着你攒钱~</text>
      </view>
    </view>

    <!-- 6. 版权说明（素材为第三方 IP，必须常驻） -->
    <text class="copyright">奶龙形象版权归第七印象所有，本页面仅个人学习使用</text>

    <!-- 7. 开发期工具：重置数据（放在最底部，尽量不影响上面按参考包排的版式） -->
    <view class="dev-card">
      <view class="dev-row" hover-class="fn-hover" @click="confirmReset">
        <text class="dev-label">重置数据</text>
        <text class="dev-value">清空全部流水并恢复内置分类</text>
      </view>
      <text class="dev-note">开发期工具，正式版会移除。</text>
    </view>

    <tab-bar current="me" />
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { useTxStore } from '../../stores/tx.js'
import { useMetaStore } from '../../stores/meta.js'
import { useCategoryStore } from '../../stores/category.js'
import { resetAll } from '../../services/maintenance.js'
import { formatCents, parseAmountToCents } from '../../utils/money.js'
import { streakDays, levelOf } from '../../utils/stats.js'
import { svgMaskStyle } from '../../utils/svg-icon.js'

/**
 * 我的（布局/组件/间距/配色逐项对齐 v2.0 参考包的 view-profile）：
 * 渐变头部 → 3 统计卡 → 攒钱目标成就卡 → 功能列表 → 底部问候 → 版权说明。
 *
 * 与参考包的差异只有一处：参考包里的数字是写死的假数据（¥3,286 / ¥12,580 / 21 天），
 * 这里全部换成真实数据 —— 本月已花、累计已存、连续记账天数（真实计算）、等级（按笔数）。
 * 攒钱目标的目标金额可点卡片设置（对应参考包路线图的 P4-12）。
 */
const txStore = useTxStore()
const metaStore = useMetaStore()
const categoryStore = useCategoryStore()

const GOAL_KEY = 'cashDiary.goalCents'
const goalCents = ref(0)

const monthExpenseText = computed(function () {
  return formatCents(txStore.summary.expenseCents)
})
const totalIncomeText = computed(function () {
  return formatCents(txStore.overview.incomeCents)
})
const streak = computed(function () {
  return streakDays(txStore.recentTs, Date.now())
})
const lv = computed(function () {
  return levelOf(txStore.overview.totalCount)
})

/* ---- 攒钱目标 ---- */
const savedCents = computed(function () {
  return txStore.overview.incomeCents
})
const goalText = computed(function () {
  if (!goalCents.value) return '点一下设置攒钱小目标'
  return '已存 ¥' + formatCents(savedCents.value) + ' / 目标 ¥' + formatCents(goalCents.value)
})
const goalPct = computed(function () {
  if (!goalCents.value) return 0
  return Math.min(100, Math.round((savedCents.value / goalCents.value) * 100))
})
const goalTip = computed(function () {
  if (!goalCents.value) return '设定目标后开始攒钱进度'
  const rest = goalCents.value - savedCents.value
  if (rest <= 0) return '目标达成！暴富奶龙皮肤已解锁'
  return '再攒 ¥' + formatCents(rest) + ' 就能解锁暴富奶龙皮肤'
})

function editGoal() {
  uni.showModal({
    title: '本月攒钱小目标',
    editable: true,
    placeholderText: '输入目标金额（元）',
    content: goalCents.value ? String(goalCents.value / 100) : '',
    success: function (res) {
      if (!res.confirm) return
      const cents = parseAmountToCents(String(res.content || '').trim())
      if (!cents) {
        uni.showToast({ title: '请输入有效金额', icon: 'none' })
        return
      }
      goalCents.value = cents
      try {
        uni.setStorageSync(GOAL_KEY, cents)
      } catch (e) { /* 存储不可用也不影响本次会话 */ }
      uni.showToast({ title: '目标已保存', icon: 'none' })
    }
  })
}

/* ---- 功能列表（与参考包同样的 6 行；未实现的功能给诚实提示，不假装能用）---- */
const fns = [
  { key: 'budget', name: '预算设置', color: '#ffd93d', icon: 'M12 2L4 5v6.09c0 5.05 3.41 9.76 8 10.91 4.59-1.15 8-5.86 8-10.91V5l-8-3zm0 15l-4-4 1.41-1.41L12 14.17l4.59-4.58L18 11l-6 6z' },
  { key: 'category', name: '分类管理', color: '#ff8a65', icon: 'M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.41l9 9c.37.36.87.59 1.41.59s1.04-.23 1.41-.59l7-7c.36-.37.59-.87.59-1.41s-.23-1.04-.59-1.42zM5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 7z' },
  { key: 'export', name: '导出账单 Excel', color: '#81c784', icon: 'M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z' },
  { key: 'remind', name: '记账提醒', color: '#4dd0e1', icon: 'M12 22a2 2 0 002-2h-4a2 2 0 002 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4a1.5 1.5 0 00-3 0v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z' },
  { key: 'skin', name: '皮肤（当前：奶龙黄）', color: '#ba68c8', icon: 'M12 2C6.49 2 2 6.49 2 12s4.49 10 10 10 10-4.49 10-10S17.51 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7-1c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5L6.89 16.5c.8 2.04 2.78 3.5 5.11 3.5z' },
  { key: 'about', name: '关于', color: '#a1887f', right: 'v2.0.0', icon: 'M11 7h2v2h-2V7zm0 4h2v6h-2v-6zm1-9C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z' }
]

function maskOf(f) {
  return svgMaskStyle(f.icon)
}

function tapFn(f) {
  if (f.key === 'about') {
    uni.showModal({
      title: '奶龙记账 v2.0.0',
      content: '个人自用记账 App，离线优先，数据只存在本机。',
      showCancel: false,
      confirmText: '知道啦'
    })
    return
  }
  uni.showToast({ title: f.name + ' 还在计划里', icon: 'none' })
}

/* ---- 重置数据（开发期工具，两次确认）---- */
function confirmReset() {
  uni.showModal({
    title: '重置数据',
    content: '会清空本机全部流水并恢复内置分类。备份导出功能尚未完成，重置后无法找回。',
    confirmText: '继续',
    cancelText: '取消',
    success: function (r1) {
      if (!r1.confirm) return
      confirmResetTwice()
    }
  })
}

function confirmResetTwice() {
  uni.showModal({
    title: '再次确认',
    content: '重置后无法撤销，确定要清空吗？',
    confirmText: '确认重置',
    confirmColor: '#b93b39',
    cancelText: '我再想想',
    success: function (r2) {
      if (!r2.confirm) return
      doReset()
    }
  })
}

async function doReset() {
  uni.showLoading({ title: '重置中…', mask: true })
  try {
    await resetAll()
    await categoryStore.init()
    await txStore.refresh(metaStore.ym)
    uni.hideLoading()
    uni.showToast({ title: '已重置', icon: 'none' })
  } catch (err) {
    uni.hideLoading()
    uni.showToast({ title: (err && err.message) || '重置失败', icon: 'none' })
  }
}

onShow(function () {
  try {
    goalCents.value = Number(uni.getStorageSync(GOAL_KEY)) || 0
  } catch (e) {
    goalCents.value = 0
  }
  txStore.refresh(metaStore.ym)
})
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding-bottom: 90px;
  /* 渐变头要铺到屏幕最顶端，状态栏留白因此放进头部内部（H5 端变量为 0） */
}

/* ---- 1. 渐变头部 ---- */
.profile-head {
  background: var(--cd-grad-head);
  padding: calc(20px + var(--status-bar-height, 0px)) 20px 26px;
  border-radius: 0 0 28px 28px;
  display: flex;
  align-items: center;
  gap: 16px;
}
.head-milo {
  width: 88px;
  height: 88px;
  flex: none;
}
.head-main {
  flex: 1;
  min-width: 0;
}
.head-name {
  font-size: 19px;
  font-weight: 800;
  color: var(--cd-ink);
}
.head-level {
  display: block;
  font-size: 12px;
  color: #8a7450;
  margin-top: 4px;
}
.head-chip {
  display: inline-block;
  margin-top: 8px;
  background: rgba(255, 255, 255, 0.6);
  border-radius: var(--cd-r-pill);
  padding: 4px 12px;
}
.head-chip-t {
  font-size: 11px;
  color: #8a7450;
  font-weight: 600;
}

/* ---- 2. 三个统计小卡 ---- */
.stat-row {
  display: flex;
  gap: 10px;
  margin: 16px;
}
.stat-cell {
  flex: 1;
  min-width: 0;
  background: var(--cd-surface);
  border-radius: 16px;
  padding: 14px 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.sc-label {
  font-size: 11px;
  color: var(--cd-ink-2);
}
.sc-value {
  font-size: 16px;
  font-weight: 800;
  color: var(--cd-ink);
  margin-top: 4px;
  font-variant-numeric: tabular-nums;
}
.sc-inc {
  color: var(--cd-income);
}
.sc-gold {
  color: #e8a317;
}

/* ---- 3. 攒钱目标卡 ---- */
.goal-card {
  margin: 0 16px;
  background: linear-gradient(135deg, #ffe9a8, #ffd93d);
  border-radius: 20px;
  padding: 16px;
  display: flex;
  align-items: center;
  gap: 14px;
  box-shadow: 0 6px 14px rgba(255, 201, 60, 0.25);
}
.goal-hover {
  transform: scale(0.985);
}
.goal-img {
  width: 72px;
  height: 72px;
  border-radius: 16px;
  flex: none;
}
.goal-main {
  flex: 1;
  min-width: 0;
}
.goal-title {
  font-size: 14px;
  font-weight: 800;
  color: var(--cd-ink);
}
.goal-sub {
  display: block;
  font-size: 11px;
  color: #8a7450;
  margin-top: 2px;
}
.goal-bar {
  height: 6px;
  background: rgba(255, 255, 255, 0.6);
  border-radius: 3px;
  margin-top: 8px;
  overflow: hidden;
}
.goal-bar-i {
  height: 100%;
  background: #ffffff;
  border-radius: 3px;
}
.goal-tip {
  display: block;
  font-size: 11px;
  color: #8a7450;
  margin-top: 4px;
}

/* ---- 4. 功能列表 ---- */
.fn-card {
  margin: 16px;
  background: var(--cd-surface);
  border-radius: 20px;
  padding: 4px 16px;
}
.fn-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid var(--cd-line);
}
.fn-row:last-child {
  border-bottom: none;
}
.fn-hover {
  background: rgba(255, 233, 168, 0.35);
}
.fn-ic {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
}
.fn-glyph {
  width: 20px;
  height: 20px;
  background: #ffffff;
}
.fn-name {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  color: var(--cd-ink);
}
.fn-arrow {
  color: #d4c4a0;
  font-size: 18px;
}

/* ---- 5. 底部问候 ---- */
.greet-card {
  margin: 16px;
  background: var(--cd-surface);
  border-radius: 20px;
  padding: 14px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
}
.greet-img {
  width: 52px;
  height: 52px;
  flex: none;
}
.greet-main {
  flex: 1;
  min-width: 0;
}
.greet-t {
  font-size: 13px;
  font-weight: 700;
  color: var(--cd-ink);
}
.greet-s {
  display: block;
  font-size: 11px;
  color: var(--cd-ink-2);
  margin-top: 2px;
}

/* ---- 6. 版权说明 ---- */
.copyright {
  display: block;
  margin: 16px 16px 8px;
  text-align: center;
  font-size: 11px;
  color: #d4c4a0;
}

/* ---- 7. 开发期工具 ---- */
.dev-card {
  margin: 8px 16px 16px;
  background: var(--cd-surface);
  border-radius: 20px;
  padding: 4px 16px 8px;
}
.dev-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
}
.dev-label {
  font-size: 14px;
  font-weight: 700;
  color: var(--cd-danger-ink);
}
.dev-value {
  flex: 1;
  text-align: right;
  font-size: 12px;
  color: var(--cd-ink-2);
}
.dev-note {
  display: block;
  font-size: 11px;
  color: var(--cd-ink-2);
  padding-bottom: 6px;
}
</style>
