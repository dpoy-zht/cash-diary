<template>
  <view class="page">
    <!-- navbar：菜单 / 我的账本 / 新建 -->
    <view class="navbar">
      <view class="icon-btn" hover-class="ib-hover" @click="toast('菜单功能规划中')">
        <view class="ib" :style="iconMenu" />
      </view>
      <text class="nav-title">我的账本</text>
      <view class="icon-btn" hover-class="ib-hover" @click="onCreate">
        <view class="ib" :style="iconPlus" />
      </view>
    </view>

    <!-- 当前账本卡：财神奶龙圆形裁切后趴在右上角 -->
    <view class="ledger-card">
      <image class="caishen" src="/static/milo/milo-caishen.webp" mode="aspectFill" />
      <text class="lc-label">当前账本</text>
      <text class="lc-name">{{ currentName }}</text>
      <text class="lc-num">¥{{ balanceText }}</text>
      <view class="lc-row">
        <text class="inc">已存 ¥{{ incomeText }}</text>
        <text class="exp">已花 ¥{{ expenseText }}</text>
      </view>
    </view>

    <!-- 其他账本：真实数据；点一行切换，长按可改名/删除 -->
    <text class="section-label">其他账本（{{ others.length }}）</text>
    <view class="list-card">
      <view v-if="!others.length" class="empty-row">
        <text class="empty-t">还没有其他账本</text>
        <text class="empty-s">新建后可以把「日常」「旅行基金」这类钱分开记</text>
      </view>
      <view
        v-for="l in others"
        :key="l.id"
        class="list-row"
        hover-class="row-hover"
        @click="switchTo(l)"
        @longpress="onLongPress(l)"
      >
        <view class="list-ic" :style="{ background: colorOfIndex(l.id) }" />
        <view class="list-main">
          <text class="list-name">{{ l.name }}</text>
          <text class="list-sub">{{ subOf(l) }}</text>
        </view>
        <text class="list-amt" :class="{ inc: l.balanceCents > 0 }">¥{{ formatCents(Math.abs(l.balanceCents)) }}</text>
      </view>
    </view>

    <text v-if="others.length" class="hint">点一下切换账本，长按可改名或删除</text>

    <!-- 新建账本行：金条奶龙 + 黄色胶囊按钮 -->
    <view class="create-row">
      <image class="gold-img" src="/static/milo/milo-gold.webp" mode="aspectFit" />
      <view class="create-btn" hover-class="create-hover" @click="onCreate">
        <text class="create-t">+ 新建账本</text>
      </view>
    </view>

    <tab-bar current="ledger" />
  </view>
</template>

<script setup>
import { computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { useTxStore } from '../../stores/tx.js'
import { useAccountStore } from '../../stores/account.js'
import { useMetaStore } from '../../stores/meta.js'
import { formatCents } from '../../utils/money.js'
import { balanceCents } from '../../utils/stats.js'
import { svgMaskStyle } from '../../utils/svg-icon.js'

/**
 * 账本页（布局/组件/间距/配色逐项对齐 v2.0 参考包的 view-ledger）：
 * navbar（菜单/标题/新建）→ 当前账本卡（财神奶龙趴右上角）→ 其他账本（N）→ 新建账本行。
 *
 * 多账本已接真实数据：点行切换、长按改名/删除、底部按钮新建。
 * 删除只允许删「没有记录的账本」，避免误删流水。
 */
const txStore = useTxStore()
const accountStore = useAccountStore()
const metaStore = useMetaStore()

const others = computed(function () {
  return accountStore.others
})
const currentName = computed(function () {
  const c = accountStore.current
  return c ? c.name : '日常账本'
})

const balanceText = computed(function () {
  return formatCents(balanceCents(txStore.overview))
})
const incomeText = computed(function () {
  return formatCents(txStore.overview.incomeCents)
})
const expenseText = computed(function () {
  return formatCents(txStore.overview.expenseCents)
})

/** 列表行图标底色：轮流用参考包里的几个色，保证同名账本也不会撞色 */
const ROW_COLORS = ['#ff8a65', '#81c784', '#f48fb1', '#ffc93c', '#ba68c8', '#4dd0e1']
function colorOfIndex(id) {
  const n = Number(id) || 1
  return ROW_COLORS[(n - 1) % ROW_COLORS.length]
}

function shortDate(ts) {
  if (!ts) return '—'
  const d = new Date(ts)
  return d.getMonth() + 1 + '月' + d.getDate() + '日'
}
function subOf(l) {
  if (!l.count) return '还没有记录'
  return l.count + ' 笔 · 最近 ' + shortDate(l.lastAt)
}

function toast(msg) {
  uni.showToast({ title: msg, icon: 'none' })
}

async function switchTo(l) {
  if (l.id === accountStore.currentId) return
  accountStore.setCurrent(l.id)
  await txStore.refresh(metaStore.ym)
  toast('已切换到「' + l.name + '」')
}

function onCreate() {
  uni.showModal({
    title: '新建账本',
    editable: true,
    placeholderText: '给账本起个名字（最多 12 字）',
    success: function (res) {
      if (!res.confirm) return
      const name = String(res.content || '').trim()
      if (!name) {
        toast('名字不能为空')
        return
      }
      accountStore
        .create(name)
        .then(function () {
          return txStore.refresh(metaStore.ym)
        })
        .then(function () {
          toast('已新建「' + name + '」')
        })
        .catch(function (err) {
          toast((err && err.message) || '新建失败')
        })
    }
  })
}

function onLongPress(l) {
  uni.showActionSheet({
    itemList: ['改名', '删除'],
    success: function (res) {
      if (res.tapIndex === 0) renameLedger(l)
      else if (res.tapIndex === 1) removeLedger(l)
    }
  })
}

function renameLedger(l) {
  uni.showModal({
    title: '账本改名',
    editable: true,
    content: l.name,
    success: function (res) {
      if (!res.confirm) return
      const name = String(res.content || '').trim()
      accountStore
        .rename(l.id, name)
        .then(function () {
          toast('已改名')
        })
        .catch(function (err) {
          toast((err && err.message) || '改名失败')
        })
    }
  })
}

function removeLedger(l) {
  if (l.count > 0) {
    uni.showModal({
      title: '不能删除',
      content: '「' + l.name + '」里还有 ' + l.count + ' 笔记录。先把记录删掉或移到别的账本，再来删它。',
      showCancel: false,
      confirmText: '好'
    })
    return
  }
  uni.showModal({
    title: '删除账本',
    content: '确定删除「' + l.name + '」吗？',
    confirmText: '删除',
    confirmColor: '#b93b39',
    success: function (res) {
      if (!res.confirm) return
      accountStore
        .remove(l.id)
        .then(function () {
          return txStore.refresh(metaStore.ym)
        })
        .then(function () {
          toast('已删除')
        })
        .catch(function (err) {
          toast((err && err.message) || '删除失败')
        })
    }
  })
}

const iconMenu = svgMaskStyle('M3 6h18v2H3V6zm0 5h18v2H3v-2zm0 5h18v2H3v-2z')
const iconPlus = svgMaskStyle('M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z')

onShow(function () {
  txStore.refresh(metaStore.ym)
})
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding-bottom: 90px;
  /* navigationStyle:custom 下页面从 y=0 开始，自己让出状态栏 */
  padding-top: var(--status-bar-height, 0px);
}

/* ---- navbar ---- */
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
  background: #8a7450;
}

/* ---- 当前账本卡 ---- */
.ledger-card {
  margin: 12px 16px;
  padding: 20px;
  border-radius: var(--cd-r-card);
  background: var(--cd-grad-brand);
  box-shadow: 0 10px 24px rgba(255, 217, 61, 0.35);
  position: relative;
  overflow: visible;
}
.caishen {
  position: absolute;
  top: -24px;
  right: 12px;
  width: 84px;
  height: 84px;
  border-radius: 50%;
  box-shadow: 0 6px 14px rgba(0, 0, 0, 0.15);
}
.lc-label {
  font-size: 12px;
  color: #8a7450;
}
.lc-name {
  display: block;
  font-size: 18px;
  font-weight: 800;
  color: var(--cd-ink);
  margin: 4px 0 2px;
}
.lc-num {
  display: block;
  font-size: 30px;
  font-weight: 800;
  color: var(--cd-ink);
  letter-spacing: -0.5px;
  font-variant-numeric: tabular-nums;
}
.lc-row {
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

/* ---- 其他账本 ---- */
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
.empty-row {
  padding: 18px 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.empty-t {
  font-size: 14px;
  font-weight: 700;
  color: var(--cd-ink);
}
.empty-s {
  font-size: 11px;
  color: var(--cd-ink-2);
  line-height: 1.6;
}
.list-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid var(--cd-line);
}
.list-row:last-child {
  border-bottom: none;
}
.row-hover {
  background: rgba(255, 233, 168, 0.35);
}
.list-ic {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  flex: none;
}
.list-main {
  flex: 1;
  min-width: 0;
}
.list-name {
  font-size: 14px;
  font-weight: 700;
  color: var(--cd-ink);
}
.list-sub {
  display: block;
  font-size: 11px;
  color: var(--cd-ink-2);
  margin-top: 2px;
}
.list-amt {
  font-size: 15px;
  font-weight: 800;
  color: var(--cd-ink);
  font-variant-numeric: tabular-nums;
}
.hint {
  display: block;
  margin: 8px 20px 0;
  font-size: 11px;
  color: var(--cd-ink-2);
}

/* ---- 新建账本行 ---- */
.create-row {
  margin: 20px 16px;
  display: flex;
  align-items: center;
  gap: 10px;
}
.gold-img {
  width: 56px;
  height: 56px;
  flex: none;
}
.create-btn {
  flex: 1;
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
</style>
