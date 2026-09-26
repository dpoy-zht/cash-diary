<template>
  <view class="page">
    <view class="navbar"><text class="nav-title">我的</text></view>

    <!-- 问候卡（原创吉祥物，非第三方 IP） -->
    <view class="me-hero">
      <mascot :size="62" />
      <view class="hero-main">
        <text class="hero-title">你好呀，记账人</text>
        <text class="hero-sub">{{ monthText }}已经记了 {{ countText }} 笔</text>
      </view>
    </view>

    <!-- 真实信息：两行都是可读数据，不是点了没反应的假按钮 -->
    <view class="me-card">
      <view class="me-row">
        <text class="mr-label">存储模式</text>
        <text class="mr-value">{{ storageLabel }}</text>
      </view>
      <view class="me-row">
        <text class="mr-label">{{ monthText }}记录</text>
        <text class="mr-value">{{ countText }} 笔</text>
      </view>
    </view>

    <!-- 计划中的功能：诚实说明，不摆假按钮 -->
    <view class="me-card">
      <text class="me-soon">分类管理、数据备份导出、预算提醒还在计划里，做好后会出现在这里。</text>
    </view>

    <!-- 重置数据：开发期工具，需两次确认 -->
    <view class="me-card">
      <view class="me-row" @click="confirmReset">
        <text class="mr-label mr-danger">重置数据</text>
        <text class="mr-value">清空全部流水并恢复内置分类</text>
      </view>
      <text class="me-soon">开发期工具：把本机数据恢复到「刚装好」的状态，正式版会移除。</text>
    </view>

    <text class="me-tip">数据只保存在本机（App 端为 SQLite）。备份导出功能尚未完成，现阶段请勿卸载 App。</text>
    <text class="me-version">奶龙记账 · v2.0.0</text>

    <tab-bar current="me" />
  </view>
</template>

<script setup>
import { computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { useTxStore } from '../../stores/tx.js'
import { useMetaStore } from '../../stores/meta.js'
import { useCategoryStore } from '../../stores/category.js'
import { resetAll } from '../../services/maintenance.js'

/**
 * 我的（v2.0 风格重刷）：问候卡 + 设置卡 + 重置数据入口。
 * 参考包没有这一页的设计，按同一套令牌（奶油底 / 白卡 / 蛋黄点缀）补齐。
 */
const txStore = useTxStore()
const metaStore = useMetaStore()
const categoryStore = useCategoryStore()

const monthText = computed(function () {
  const parts = metaStore.ym.split('-')
  return Number(parts[1]) + '月'
})
const countText = computed(function () {
  return txStore.records.length
})
const storageLabel = computed(function () {
  // #ifdef APP-PLUS
  return 'SQLite · 本机'
  // #endif
  // #ifndef APP-PLUS
  return '内存 · 刷新即清空'
  // #endif
})

onShow(function () {
  txStore.loadMonth(metaStore.ym)
})

/** 第一次确认：说清后果 */
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

/** 第二次确认：不可撤销 */
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
    await categoryStore.init() // 重置时已回写种子，这里把分类读进 store
    await txStore.refresh(metaStore.ym)
    uni.hideLoading()
    uni.showToast({ title: '已重置', icon: 'none' })
  } catch (err) {
    uni.hideLoading()
    uni.showToast({ title: (err && err.message) || '重置失败', icon: 'none' })
  }
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding-bottom: 90px;
  /* 让出状态栏（同首页说明） */
  padding-top: var(--status-bar-height, 0px);
}
.navbar {
  padding: 12px 20px 4px;
}
.nav-title {
  font-size: 20px;
  font-weight: 800;
  color: var(--cd-ink);
}

.me-hero {
  display: flex;
  align-items: center;
  gap: 14px;
  margin: 12px 16px;
  padding: 18px;
  background: var(--cd-grad-brand);
  border-radius: var(--cd-r-card);
  box-shadow: 0 10px 24px rgba(255, 217, 61, 0.35);
}
.hero-main {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.hero-title {
  font-size: 18px;
  font-weight: 800;
  color: var(--cd-ink);
}
.hero-sub {
  font-size: 12px;
  font-weight: 600;
  color: rgba(93, 78, 55, 0.75);
}

.me-card {
  margin: 12px 16px;
  background: var(--cd-surface);
  border-radius: var(--cd-r-md);
  padding: 4px 16px;
  box-shadow: var(--cd-sh-card);
}
.me-row {
  display: flex;
  align-items: center;
  padding: 14px 0;
  border-bottom: 1px solid var(--cd-line);
}
.me-row:last-child {
  border-bottom: none;
}
.mr-label {
  font-size: 15px;
  font-weight: 700;
  color: var(--cd-ink);
}
.mr-value {
  margin-left: auto;
  font-size: 13px;
  font-weight: 600;
  color: var(--cd-ink-2);
}
/* 危险操作：加深红字（对奶油底 ≥4.5:1） */
.mr-danger {
  color: var(--cd-danger-ink);
}
.me-soon {
  display: block;
  font-size: 12px;
  line-height: 1.7;
  color: var(--cd-ink-2);
  padding: 14px 0;
}
.me-tip {
  display: block;
  margin: 16px;
  font-size: 12px;
  line-height: 1.8;
  color: var(--cd-ink-2);
}
.me-version {
  display: block;
  text-align: center;
  color: var(--cd-ink-2);
  font-size: 12px;
  padding: 8px 0 20px;
}
</style>
