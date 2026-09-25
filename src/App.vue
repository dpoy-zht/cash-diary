<script setup>
import { onLaunch } from '@dcloudio/uni-app'
import { initDB } from './db/index.js'
import { useCategoryStore } from './stores/category.js'

onLaunch(() => {
  const categoryStore = useCategoryStore()
  initDB()
    .then(() => categoryStore.init())
    .catch((err) => console.error('[cash-diary] 初始化失败：', err))
})
</script>

<style>
/* ==========================================================================
   现金日记 · 设计令牌层（奶龙风：暖黄治愈系 / 圆润 / 高可读）
   --------------------------------------------------------------------------
   这里是全站唯一的色值、圆角、阴影、字体来源。页面与组件内一律使用 var(--cd-*)，
   不再出现硬编码色值——这是"视觉一致性"的强制手段。
   完整规范与取舍理由见 docs/nailong-ui-spec.md。

   注意：同时挂在 :root / page / uni-page-body 上，是为了让 App 端（webview）
   与 H5 端都能解析；令牌依赖 CSS 变量继承，不要把它们挪进 scoped 样式。
   ========================================================================== */
:root,
page,
uni-page-body {
  /* ---- 底色与容器 ---- */
  --cd-bg: #fff8e7;         /* 奶油底：页面背景 */
  --cd-surface: #ffffff;    /* 卡片、弹层 */
  --cd-cream: #fff3d6;      /* 浅奶黄：次级容器、选中底、标签底 */
  --cd-cream-2: #fffaee;    /* 极浅奶黄：输入框内底 */

  /* ---- 品牌色（奶龙黄） ---- */
  --cd-primary: #ffd34d;
  --cd-primary-lt: #fff0be;
  --cd-primary-dk: #f0a500; /* 渐变尾色、描边、呆毛 */
  /* 全站唯一的"主按钮/选中态"渐变：主黄浅→深。
     选中项、主按钮都必须用它，不允许各处各写一套渐变（一致性关键）。 */
  --cd-grad-brand: linear-gradient(180deg, #ffe98f 0%, #ffc93c 100%);

  /* ---- 文字（暖深棕替代纯黑，去掉冷硬感） ---- */
  --cd-ink: #4a3520;        /* 主文字｜对奶油底 10.9:1，对白底 11.5:1 */
  --cd-ink-2: #7e6849;      /* 次要文字｜对奶油底 5.0:1，对白底 5.3:1 */
  --cd-ink-3: #b9a88f;      /* 占位符与装饰（不承载正文信息） */

  /* ---- 分隔与点缀 ---- */
  --cd-line: #f2e6ce;
  --cd-blush: #ff9cae;      /* 腮红粉 */
  /* 吉祥物五官（仅 mascot.vue 使用） */
  --cd-face-ink: #3d2a17;
  --cd-face-mouth: #c2504c;

  /* ---- 语义色（依 PRD §8 冻结，不随主题调整） ----
     使用规则：红/绿只出现在"金额数字"上，且金额一律 ≥19px 粗体，
     以命中 WCAG AA 的大字号门槛（#e24b4a 对白底 3.94:1 ≥ 3:1）。
     小于 19px 的文字若需要红色语义（目前仅删除按钮），改用加深档。 */
  --cd-expense: #e24b4a;    /* 支出 · 红（中国习惯：红支绿收） */
  --cd-income: #12924f;     /* 收入 · 绿 */
  --cd-danger-lt: #fdeceb;  /* 危险按钮底色 */
  --cd-danger-ink: #b93b39; /* 危险小字（对 --cd-danger-lt 为 4.9:1） */

  /* ---- 圆角体系：奶龙风 = 极圆润，界面内不出现直角 ---- */
  --cd-r-pill: 999px;       /* 胶囊：标签、chip、进度 */
  --cd-r-lg: 28px;          /* 卡片、弹层顶角 */
  --cd-r-md: 20px;          /* 按钮、输入框、分组卡 */
  --cd-r-sm: 16px;          /* 键盘键、小图标底 */

  /* ---- 阴影：暖色调，替代中性灰阴影 ---- */
  --cd-sh-1: 0 2px 10px rgba(191, 149, 42, 0.12);

  /* ---- 动效 ---- */
  --cd-dur: 180ms;
  --cd-ease: cubic-bezier(0.34, 1.35, 0.64, 1); /* 轻回弹，呼应"软萌" */

  /* ---- 字体：系统圆体栈，不打包字体文件（避免 APK 体积与首屏成本） ----
     测试机 Xiaomi 14 Pro / HyperOS 命中 MiSans，本身即圆润几何无衬线。 */
  --cd-font: "MiSans", "HarmonyOS Sans SC", "PingFang SC", "Noto Sans SC",
    "Source Han Sans SC", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}

page {
  background: var(--cd-bg);
  font-family: var(--cd-font);
  color: var(--cd-ink);
  font-size: 14px;
  -webkit-font-smoothing: antialiased;
}

/* 全站共用动效关键帧（scoped 样式无法跨组件复用关键帧，故放在全局） */
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

/* 无障碍：尊重系统的"减弱动态效果"设置 */
@media (prefers-reduced-motion: reduce) {
  page * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
</style>
