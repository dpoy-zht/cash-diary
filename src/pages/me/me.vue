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

    <!-- 3. 累计攒钱目标（点一下可设置目标金额；进度按累计口径，按月口径见 T3.8） -->
    <view class="goal-card" hover-class="goal-hover" @click="editGoal">
      <image class="goal-img" src="/static/milo/milo-rich.webp" mode="aspectFit" />
      <view class="goal-main">
        <text class="goal-title">累计攒钱目标</text>
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
        <!-- 记账提醒：开关样式替代箭头，点击整行切换 -->
        <view v-if="f.key === 'remind'" class="fn-right">
          <text class="fn-switch-label">{{ remindOn ? '已开启' : '已关闭' }}</text>
          <view class="fn-switch" :class="{ on: remindOn }"><view class="fn-switch-dot" /></view>
        </view>
        <text v-else class="fn-arrow">{{ f.right || '›' }}</text>
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

    <!-- 7. 开发期工具：重置数据（仅开发构建可见，发行打包 import.meta.env.DEV=false 自动消失） -->
    <view v-if="isDev" class="dev-card">
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
import { useAccountStore } from '../../stores/account.js'
import { useBudgetStore } from '../../stores/budget.js'
import { resetAll } from '../../services/maintenance.js'
import * as backupService from '../../services/backup.js'
import { backupFileName, validateBackup } from '../../utils/backup.js'
import { saveTextFile, pickBackupText, exportDocFileToUser, exportResultMessage } from '../../utils/backup-file.js'
import { formatCents, parseAmountToCents } from '../../utils/money.js'
import { streakDays, levelOf } from '../../utils/stats.js'
import {
  requestNotifyPermission,
  REMIND_PREF_KEY,
  normalizeRemindEnabled
} from '../../utils/notify.js'
import { checkForUpdate, currentAppVersion, updateNow } from '../../services/update.js'
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
const accountStore = useAccountStore()
const budgetStore = useBudgetStore()
/** 重置数据是开发期工具：HBuilderX「运行」（dev 构建）可见，「发行/云打包」构建下隐藏 */
const isDev = import.meta.env.DEV

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
  if (!goalCents.value) return '点一下设置攒钱目标'
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
    title: '累计攒钱目标',
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
/* 「关于」行右侧显示当前版本（App 端取资源包版本；H5/测试无版本信息时回落成箭头，不写死旧版本号） */
const aboutVersionText = currentAppVersion()

const fns = [
  { key: 'budget', name: '预算设置', color: '#ffd93d', icon: 'M12 2L4 5v6.09c0 5.05 3.41 9.76 8 10.91 4.59-1.15 8-5.86 8-10.91V5l-8-3zm0 15l-4-4 1.41-1.41L12 14.17l4.59-4.58L18 11l-6 6z' },
  { key: 'fixed', name: '固定支出', color: '#ffb74d', icon: 'M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z' },
  { key: 'category', name: '分类管理', color: '#ff8a65', icon: 'M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.41l9 9c.37.36.87.59 1.41.59s1.04-.23 1.41-.59l7-7c.36-.37.59-.87.59-1.41s-.23-1.04-.59-1.42zM5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 7z' },
  { key: 'export', name: '数据备份与恢复', color: '#81c784', icon: 'M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z' },
  { key: 'update', name: '检查更新', color: '#7986cb', icon: 'M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z' },
  { key: 'remind', name: '记账提醒', color: '#4dd0e1', icon: 'M12 22a2 2 0 002-2h-4a2 2 0 002 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4a1.5 1.5 0 00-3 0v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z' },
  { key: 'skin', name: '皮肤（当前：奶龙黄）', color: '#ba68c8', icon: 'M12 2C6.49 2 2 6.49 2 12s4.49 10 10 10 10-4.49 10-10S17.51 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7-1c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5L6.89 16.5c.8 2.04 2.78 3.5 5.11 3.5z' },
  { key: 'about', name: '关于', color: '#a1887f', right: aboutVersionText, icon: 'M11 7h2v2h-2V7zm0 4h2v6h-2v-6zm1-9C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z' }
]

function maskOf(f) {
  return svgMaskStyle(f.icon)
}

function tapFn(f) {
  if (f.key === 'about') {
    uni.showModal({
      title: '奶龙记账' + (aboutVersionText ? ' v' + aboutVersionText : ''),
      content: '个人自用记账 App，离线优先，数据只存在本机。',
      confirmText: '检查更新',
      cancelText: '知道啦',
      success: function (res) {
        if (res.confirm) checkUpdateManual()
      }
    })
    return
  }
  if (f.key === 'update') {
    checkUpdateManual()
    return
  }
  if (f.key === 'remind') {
    toggleRemind()
    return
  }
  if (f.key === 'budget') {
    uni.navigateTo({ url: '/pages/budget/budget' })
    return
  }
  if (f.key === 'fixed') {
    uni.navigateTo({ url: '/pages/fixed/fixed' })
    return
  }
  if (f.key === 'category') {
    uni.navigateTo({ url: '/pages/category/category' })
    return
  }
  if (f.key === 'export') {
    openBackupMenu()
    return
  }
  uni.showToast({ title: f.name + ' 还在计划里', icon: 'none' })
}

/* ---- 手动检查更新（关于弹窗入口）：每种结果都给用户明确反馈 ---- */
function checkUpdateManual() {
  uni.showLoading({ title: '正在检查更新…', mask: true })
  checkForUpdate({ force: true })
    .then(function (r) {
      uni.hideLoading()
      if (r.hasUpdate) {
        uni.showModal({
          title: '发现新版本 ' + r.tag,
          content: r.notes + '\n\n覆盖安装即可升级，账目数据都在。',
          confirmText: '立即更新',
          cancelText: '下次再说',
          success: function (res) {
            if (res.confirm) updateNow(r)
          }
        })
        return
      }
      if (r.reason === 'offline') {
        uni.showToast({ title: '网络不可用，稍后再试', icon: 'none' })
        return
      }
      if (r.reason === 'not-app') {
        uni.showToast({ title: '请在手机 App 内检查更新', icon: 'none' })
        return
      }
      uni.showToast({ title: '已是最新版本 ' + (r.current || currentAppVersion()), icon: 'none' })
    })
    .catch(function () {
      uni.hideLoading()
      uni.showToast({ title: '检查失败，稍后再试', icon: 'none' })
    })
}

/* ---- 记账提醒开关（控制超支系统通知；状态持久化，重装/清数据后回到默认开启） ---- */
const remindOn = ref(true)

function loadRemindPref() {
  try {
    remindOn.value = normalizeRemindEnabled(uni.getStorageSync(REMIND_PREF_KEY))
  } catch (e) { /* 读不到就保持默认开启，不打扰用户 */ }
}

function toggleRemind() {
  const prev = remindOn.value
  const next = !prev
  remindOn.value = next
  try {
    uni.setStorageSync(REMIND_PREF_KEY, next)
  } catch (e) {
    remindOn.value = prev // 存储失败回滚界面状态，假装没点过
    uni.showToast({ title: '保存失败，请重试', icon: 'none' })
    return
  }
  if (next) {
    requestNotifyPermission() // 开启时顺带申请通知权限（App 端；H5 自动跳过）
    uni.showToast({ title: '超支系统通知已开启', icon: 'none' })
  } else {
    uni.showToast({ title: '超支系统通知已关闭', icon: 'none' })
  }
}

/* ---- 数据备份与恢复 ---- */
function openBackupMenu() {
  uni.showActionSheet({
    itemList: ['导出备份（JSON 文件）', '从备份恢复'],
    success: function (res) {
      if (res.tapIndex === 0) doExport()
      else if (res.tapIndex === 1) doRestore()
    }
  })
}

async function doExport() {
  uni.showLoading({ title: '正在打包…', mask: true })
  try {
    const name = backupFileName(Date.now())
    const text = await backupService.exportJson()
    // ① 先落在应用自己的目录（App）/ 触发浏览器下载（H5），保证任何时候都有一份
    await saveTextFile(name, text)
    // ② App 端再复制一份到公共目录，否则用户根本拿不到（私有目录用户看不见）
    const exported = await exportDocFileToUser(name)
    const b = backupService.parseBackupText(text)
    const msg = exported === null
      ? exportResultMessage({ mode: 'browser-download' })
      : exportResultMessage({ outPath: exported })

    uni.hideLoading()
    uni.showModal({
      title: msg.title,
      content:
        '包含 ' + b.account.length + ' 个账本、' + b.category.length + ' 个分类、' +
        b.transaction_record.length + ' 笔流水、' + b.budget.length + ' 条预算。\n\n' + msg.content,
      showCancel: msg.fallbackClipboard,
      cancelText: '不用了',
      confirmText: msg.fallbackClipboard ? '复制备份内容' : '好',
      success: function (res) {
        if (!msg.fallbackClipboard || !res.confirm) return
        // 兜底：拿不到文件时至少让用户能把备份带走
        uni.setClipboardData({
          data: text,
          success: function () { uni.showToast({ title: '已复制，去微信/备忘录粘贴保存吧', icon: 'none' }) }
        })
      }
    })
  } catch (err) {
    uni.hideLoading()
    uni.showToast({ title: (err && err.message) || '导出失败', icon: 'none' })
  }
}

function fmtTs(ts) {
  const d = new Date(Number(ts) || Date.now())
  function p(n) { return String(n).padStart(2, '0') }
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes())
}

async function doRestore() {
  let picked
  try {
    picked = await pickBackupText()
  } catch (err) {
    if (!err || !err.cancelled) uni.showToast({ title: (err && err.message) || '读取失败', icon: 'none' })
    return
  }
  let obj
  try {
    obj = backupService.parseBackupText(picked.text)
  } catch (err) {
    uni.showToast({ title: err.message, icon: 'none' })
    return
  }
  // 先只读校验，再让用户确认 —— 校验不过绝不碰数据库
  const check = validateBackup(obj)
  if (!check.ok) {
    uni.showModal({ title: '这份备份不能用', content: check.error, showCancel: false, confirmText: '好' })
    return
  }
  const c = check.counts
  uni.showModal({
    title: '从备份恢复',
    content:
      '备份时间：' + fmtTs(obj.exportedAt) + '\n' +
      '包含：' + c.account + ' 个账本、' + c.category + ' 个分类、' +
      c.transaction_record + ' 笔流水、' + c.budget + ' 条预算\n\n' +
      '⚠️ 恢复会覆盖当前全部数据，无法撤销。',
    confirmText: '覆盖并恢复',
    confirmColor: '#b93b39',
    cancelText: '取消',
    success: function (res) {
      if (res.confirm) doRestoreApply(obj)
    }
  })
}

async function doRestoreApply(obj) {
  uni.showLoading({ title: '恢复中…', mask: true })
  try {
    const counts = await backupService.restoreBackup(obj)
    // 四张表都换了，store 必须整体重读（init 有 ready 守卫，强制刷新走 reload）
    await categoryStore.reload()
    await accountStore.reload()
    await budgetStore.load()
    await txStore.refresh(metaStore.ym)
    uni.hideLoading()
    uni.showToast({ title: '已恢复 ' + counts.transaction_record + ' 笔流水', icon: 'none' })
  } catch (err) {
    uni.hideLoading()
    uni.showToast({ title: (err && err.message) || '恢复失败', icon: 'none' })
  }
}

/* ---- 重置数据（开发期工具，两次确认）---- */
function confirmReset() {
  uni.showModal({
    title: '重置数据',
    content: '会清空本机全部流水并恢复内置分类。重置前可先在「数据备份与恢复」导出备份，重置后无法找回。',
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
    // 整库重建后强制重读分类（init 有 ready 守卫，要走 reload）
    await categoryStore.reload()
    // resetAll 重建了默认账本与预算相关数据，两个 store 必须重读，
    // 否则继续引用已不存在的账本 id（account 的 init 有 ready 守卫，要用 reload）
    await Promise.all([accountStore.reload(), budgetStore.load()])
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
  loadRemindPref()
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
/* 记账提醒开关：胶囊滑块，开启用主题黄，与页面开关/分段控件同一套视觉 */
.fn-right {
  display: flex;
  align-items: center;
  gap: 8px;
}
.fn-switch-label {
  font-size: 12px;
  color: var(--cd-ink-2);
}
.fn-switch {
  width: 44px;
  height: 24px;
  border-radius: 999px;
  background: var(--cd-line);
  position: relative;
  flex: none;
  transition: background 0.2s var(--cd-ease);
}
.fn-switch.on {
  background: var(--cd-primary);
}
.fn-switch-dot {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
  transition: transform 0.2s var(--cd-ease);
}
.fn-switch.on .fn-switch-dot {
  transform: translateX(20px);
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
