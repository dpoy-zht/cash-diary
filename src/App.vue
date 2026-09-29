<script setup>
import { onLaunch, onShow } from '@dcloudio/uni-app'
import { initDB } from './db/index.js'
import { useCategoryStore } from './stores/category.js'
import { useAccountStore } from './stores/account.js'
import { listenPushClick, pushRouteFor } from './utils/notify.js'
import { checkForUpdate, updateNow } from './services/update.js'
import { startReminders, refreshReminders } from './services/reminder.js'
import { checkRemoteOnStart, uploadBackup, reasonText } from './services/webdav.js'
// #ifdef H5
import { setPersistErrorHandler, flush as flushMemory } from './db/memory.js'
// #endif

onLaunch(() => {
  const categoryStore = useCategoryStore()
  const accountStore = useAccountStore()
  // 账本要先就绪：流水查询都带"当前账本"过滤，账本没初始化好会查错账本
  initDB()
    .then(() => Promise.all([categoryStore.init(), accountStore.init()]))
    // 数据就绪后再起提醒引擎：固定支出要读库，账本没初始化好会读错账本
    .then(() => startReminders(function () { return accountStore.currentId }))
    .catch((err) => console.error('[cash-diary] 初始化失败：', err))

  // #ifdef H5
  /**
   * H5 的数据落在 localStorage，写入可能因配额（>5MB）或隐私模式失败。
   * 落盘是防抖的（T3.9），一旦写不进去，内存里看着正常、刷新就全没了 —— 必须让人知道。
   */
  setPersistErrorHandler(function () {
    uni.showToast({
      title: '本地存储写入失败，请到「我的 → 数据备份与恢复」导出备份',
      icon: 'none',
      duration: 5000
    })
  })
  // 关页 / 切后台前把防抖中的改动落盘，避免最后几笔账丢失
  window.addEventListener('pagehide', flushMemory)
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) flushMemory()
  })
  // #endif

  // 点系统通知直达对应页面（路由表见 utils/notify.js 的 PUSH_ROUTES）：
  // 超支 → 预算页；每日提醒 → 记一笔；缴费提醒 → 固定支出页。
  // 等路由就绪后再跳，冷启动直接跳会丢。
  listenPushClick(function (payload) {
    const url = pushRouteFor(payload)
    if (!url) return
    setTimeout(function () {
      try {
        uni.navigateTo({ url: url })
      } catch (e) { /* 跳转失败落在首页，可接受 */ }
    }, 800)
  })

  // 应用内更新检查：24h 节流 + 静默失败，只在新版本可用时弹窗（含版本号与更新说明）
  // 确认后自动执行更新：有 wgt 静默热更（重启生效），否则打开下载页走整包
  checkForUpdate()
    .then(function (r) {
      if (!r.hasUpdate) return
      uni.showModal({
        title: '发现新版本 ' + r.tag,
        content: r.notes,
        confirmText: '立即更新',
        cancelText: '下次再说',
        success: function (res) {
          if (res.confirm) updateNow(r)
        }
      })
    })
    .catch(function () { /* 离线/超时静默 */ })

  /**
   * 云备份比对（T4.5）：配过 WebDAV 的话，启动后悄悄看一眼云端与本机谁更新。
   *
   * 三条约束：
   * - 延迟 3s 再查：别和首屏渲染抢网络与主线程
   * - 12h 节流 + 失败全静默（都在 services/webdav.js 里）：云端连不上绝不能影响记账
   * - 只有真的"不一致"才提示，一致/没配过/查不到都是一句话都不说
   */
  setTimeout(function () {
    checkRemoteOnStart()
      .then(function (r) {
        if (!r.checked || r.action === 'none' || r.action === 'same') return
        promptWebdavDiff(r)
      })
      .catch(function () { /* 静默 */ })
  }, 3000)
})

/**
 * 启动比对发现差异时的提示。
 * - 云端更新 → 引导到「我的」去恢复（恢复是整库覆盖，必须让用户在那边的确认框里再点一次）
 * - 本机可能更新 → 直接问要不要上传（上传不动本地数据，安全）
 */
function promptWebdavDiff(r) {
  const n = (r.counts && r.counts.transaction_record) || 0
  if (r.action === 'remote-newer') {
    uni.showModal({
      title: '云端有更新',
      content: '云端备份（' + n + ' 笔流水）比本机上次同步的更新。去「我的 → 云备份」看看吗？',
      confirmText: '去查看',
      cancelText: '稍后',
      success: function (res) {
        if (res.confirm) uni.reLaunch({ url: '/pages/me/me' })
      }
    })
    return
  }
  if (r.action === 'local-newer') {
    uni.showModal({
      title: '要把本机的账传上去吗？',
      content: '云端那份还是上次同步时的版本。现在上传会用本机数据覆盖云端。',
      confirmText: '立即上传',
      cancelText: '稍后',
      success: function (res) {
        if (!res.confirm) return
        uni.showLoading({ title: '正在上传…', mask: true })
        uploadBackup()
          .then(function (u) {
            uni.hideLoading()
            uni.showToast({ title: '已上传 ' + u.counts.transaction_record + ' 笔流水', icon: 'none' })
          })
          .catch(function (err) {
            uni.hideLoading()
            uni.showToast({ title: (err && err.message) || reasonText('network'), icon: 'none' })
          })
      }
    })
  }
}

/**
 * 每次回到前台重排一轮提醒（T4.1）：
 * ① 补发「今天已经过点但还没提醒过」的那条（冷启动补偿，这是"重启后提醒仍在"的关键）；
 * ② 顺手重排定时器 —— 设备休眠/改时钟会让长 setTimeout 变不可靠，回前台重新对齐最稳。
 * 引擎还没起来（首次 initDB 未完成）时是 no-op。
 */
onShow(function () {
  try {
    refreshReminders()
  } catch (e) { /* 提醒排定失败绝不能影响 App 启动 */ }
})
</script>

<style>
/* ==========================================================================
   现金日记 · 设计令牌层 v2.0（奶龙记账 · 蛋黄奶油风）
   --------------------------------------------------------------------------
   设计基准 = demo/nailong-ledger.html，逐字复现自用户提供的「奶龙记账-复现参考包」。
   与 v1.2（马卡龙玻璃风）的本质区别：平涂奶油底 + 纯白卡 + 蛋黄主色，
   没有玻璃拟态、没有多色渐变背景、没有 frosted 导航。

   约定：
   - 唯一色值来源是本文件；页面与组件一律 var(--cd-*)，不再出现硬编码色值
     （唯一例外是分类图标 8 色，按分类名存于 utils/palette.js，参考包要求"严格一致"）。
   - 令牌同时挂在 :root / page / uni-page-body，App 端（webview）与 H5 都能解析；
     依赖 CSS 变量继承，不要挪进 scoped 样式。
   ========================================================================== */
:root,
page,
uni-page-body {
  /* ---- 蛋黄系主色 ---- */
  --cd-primary: #ffd93d; /* 蛋黄 · FAB / 选中态 / 主按钮 */
  --cd-primary-lt: #ffe9a8; /* 浅蛋黄 · 图标钮底 / 分段底 / 键盘区 */
  --cd-primary-deep: #ffc93c; /* 深蛋黄 · 选中描边 / FAB 渐变尾 */
  --cd-grad-brand: linear-gradient(135deg, #ffe082 0%, #ffd93d 100%); /* 余额卡 */
  --cd-grad-head: linear-gradient(180deg, #ffd93d 0%, #ffe9a8 100%); /* 记一笔头部 */

  /* ---- 底色与容器 ---- */
  --cd-bg: #fff8e7; /* 奶油米白 · 全局背景 */
  --cd-surface: #ffffff; /* 纯白卡 */
  --cd-line: #fff3d6; /* 卡内分隔线 */

  /* ---- 文字（暖棕系）----
     --cd-ink-2 已从参考包原值 #b8a584（2.3:1）加深到 #856f4d，奶油底上实测 4.53:1，达 AA */
  --cd-ink: #5d4e37; /* 主文字 */
  --cd-ink-2: #856f4d; /* 次文字 / 占位 */
  --cd-ink-3: #cbb999; /* 弱化（吉祥物细节等装饰，不承载正文） */

  /* ---- 语义色 ----
     v2.0 支出金额用主文字色（非红），收入用绿（参考包如此，取代旧的红支绿收） */
  --cd-income: #2e8b57; /* 收入绿 */
  --cd-danger-ink: #b93b39; /* 危险小字（删除） */

  /* ---- 点缀 ---- */
  --cd-blush: #ffb6b9; /* 腮红粉 · 工资横幅 */
  --cd-heart: #ff8fa3; /* 爱心 */
  --cd-btn-ink: #ffffff; /* 蛋黄主按钮上的白字 */

  /* ---- 图标与次级棕（T3.11：页面里散落的字面色值收敛到这里）---- */
  --cd-icon: #8a7450; /* 图标钮里的图标、次级按钮文字（原先各页手写 #8a7450） */
  --cd-icon-2: #b89968; /* 更浅一档：分段未选中、小箭头、编辑铅笔 */
  --cd-icon-3: #d4c4a0; /* 最浅：纯装饰箭头（不承载信息） */
  --cd-gold-ink: #e8a317; /* 金色文字（成就卡大数字） */
  --cd-primary-mid: #ffe082; /* 蛋黄浅调：环形图内圈 */
  --cd-income-lt: #a5d6a7; /* 收入浅绿：趋势柱收入模式 */

  /* ---- 圆角：全元素无尖角 ---- */
  --cd-r-pill: 999px; /* 按钮 / 分段 / 图标钮 */
  --cd-r-card: 24px; /* 卡片 */
  --cd-r-md: 20px; /* 流水卡 / 弹层 */
  --cd-r-sm: 14px; /* 键盘键 / 小卡 */

  /* ---- 阴影：暖黄发光 + 浅棕接触影 ---- */
  --cd-sh-card: 0 2px 10px rgba(93, 78, 55, 0.06);
  --cd-sh-pop: 0 8px 20px rgba(255, 201, 60, 0.45); /* FAB / 弹层 */
  --cd-sh-btn: 0 6px 14px rgba(255, 201, 60, 0.5); /* 蛋黄按钮 */

  /* ---- 动效 ---- */
  --cd-dur: 180ms;
  --cd-ease: cubic-bezier(0.34, 1.56, 0.64, 1); /* 弹性回弹 */

  /* ---- 原创吉祥物「小记龙」配色（仅 mascot.vue 使用，非第三方 IP 素材）---- */
  --cd-face-head: linear-gradient(180deg, #fff0c2 0%, #ffe4a0 55%, #ffd08a 100%);
  --cd-face-tuft: #f0b860;
  --cd-face-ink: #5d4e37;
  --cd-face-mouth: #c2504c;
  --cd-face-glint: #fffdf7;

  /* ---- 字体：参考包用 PingFang SC / 微软雅黑；前置系统圆体保证安卓可读 ---- */
  --cd-font: "PingFang SC", "MiSans", "HarmonyOS Sans SC", "Microsoft YaHei",
    "Noto Sans SC", "Source Han Sans SC", system-ui, -apple-system, "Segoe UI",
    Roboto, sans-serif;
}

page {
  background: var(--cd-bg);
  font-family: var(--cd-font);
  color: var(--cd-ink);
  font-size: 14px;
  -webkit-font-smoothing: antialiased;
}

/* 全站共用关键帧（scoped 样式无法跨组件复用关键帧，故放在全局） */
@keyframes cd-sheet-up {
  from {
    transform: translateY(20px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

@keyframes cd-fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes cd-pop {
  from {
    transform: scale(0.85);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}

/* 无障碍：尊重系统的"减弱动态效果"设置 */
@media (prefers-reduced-motion: reduce) {
  page * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
</style>
