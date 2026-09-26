<script setup>
import { onLaunch } from '@dcloudio/uni-app'
import { initDB } from './db/index.js'
import { useCategoryStore } from './stores/category.js'
import { useAccountStore } from './stores/account.js'

onLaunch(() => {
  const categoryStore = useCategoryStore()
  const accountStore = useAccountStore()
  // 账本要先就绪：流水查询都带"当前账本"过滤，账本没初始化好会查错账本
  initDB()
    .then(() => Promise.all([categoryStore.init(), accountStore.init()]))
    .catch((err) => console.error('[cash-diary] 初始化失败：', err))
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
     注意：--cd-ink-2 对比度仅约 2.6:1，按参考包原样保留，只用于次要/占位文字 */
  --cd-ink: #5d4e37; /* 主文字 */
  --cd-ink-2: #b8a584; /* 次文字 / 占位 */
  --cd-ink-3: #cbb999; /* 弱化（吉祥物细节等装饰，不承载正文） */

  /* ---- 语义色 ----
     v2.0 支出金额用主文字色（非红），收入用绿（参考包如此，取代旧的红支绿收） */
  --cd-income: #2e8b57; /* 收入绿 */
  --cd-danger-ink: #b93b39; /* 危险小字（删除） */

  /* ---- 点缀 ---- */
  --cd-blush: #ffb6b9; /* 腮红粉 · 工资横幅 */
  --cd-heart: #ff8fa3; /* 爱心 */
  --cd-btn-ink: #ffffff; /* 蛋黄主按钮上的白字 */

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
