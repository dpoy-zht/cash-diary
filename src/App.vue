<script setup>
import { onLaunch } from '@dcloudio/uni-app'
import { initDB } from './db/index.js'
import { useCategoryStore } from './stores/category.js'
import { useUiStore } from './stores/ui.js'

onLaunch(() => {
  const categoryStore = useCategoryStore()
  // 外观状态（导航档位偏好 / 能力探测 / 降级记忆）尽早初始化，
  // 否则首帧会先按"毛玻璃"渲染再跳回纯色，闪一下。
  useUiStore().init()
  initDB()
    .then(() => categoryStore.init())
    .catch((err) => console.error('[cash-diary] 初始化失败：', err))
})
</script>

<style>
/* ==========================================================================
   现金日记 · 设计令牌层
   视觉规范对齐 sdufe-nailong-checkin（奶龙奶油卡通风 · 马卡龙 + 玻璃质感）
   --------------------------------------------------------------------------
   改造分两步走，缺一不可：
     ① 令牌 —— 参考项目 :root 里的变量逐条映射到 --cd-*（见下方注释对照）
     ② 材质 —— 玻璃卡片抽成全局类 .cd-card / .cd-glow，页面与组件只挂类名，
        不在各处重复玻璃配方。这是"组件样式一致"的强制手段。

   与参考项目的两处刻意偏差（理由见 docs/nailong-ui-spec.md §12）：
     · 次要文字 #9A8B7A → #6B5D4F：参考值在浅底上仅 2.95:1，达不到 AA 正文
     · 卡片不加 backdrop-filter：本设计背景是平滑多色渐变，模糊前后肉眼几乎无差，
       却要每张卡一次全屏回读合成 —— 列表页几十张卡在低端机上会直接掉帧。
       真正的模糊只保留在吸顶导航上（那里确实有内容从下方经过）。

   令牌挂在 :root / page / uni-page-body 上，让 App 端（webview）与 H5 端都能解析；
   令牌依赖 CSS 变量继承，不要把它们挪进 scoped 样式。
   ========================================================================== */
:root,
page,
uni-page-body {
  /* ---- 马卡龙奶油色板（= 参考项目 --cream-yellow/--peach/... ）----
     完整 7 色见 docs/nailong-ui-spec.md §12；分类图标用的那支在 utils/palette.js。
     这里只保留 CSS 里真正用到的主色，避免"定义了却没人用"的僵尸令牌。 */
  --cd-cream-yellow: #ffe4a0;   /* 鹅黄 · 主色 */
  --cd-white: #ffffff;          /* 纯白：选中态描边/高光的最高亮档 */

  /* ---- 页面背景（= 参考项目 --bg-page：三段多色渐变）---- */
  --cd-bg: linear-gradient(180deg, #fff9e8 0%, #fff0f5 40%, #e8f5f0 100%);
  --cd-bg-end: #e8f5f0;         /* 渐变终点色，用于需要纯色的场景 */

  /* ---- 文字（= --text-main / --text-sub）----
     ink  │ 对奶白卡 8.34:1、对渐变各段 7.57–8.07:1
     ink-2│ 参考项目用 #9A8B7A，在浅底上只有 2.95:1；此处加深到各底 ≥4.64:1
     ink-3│ 占位符与装饰，不承载正文信息 */
  --cd-ink: #5a4a3a;
  --cd-ink-2: #6b5d4f;
  --cd-ink-3: #a89a88;
  /* 浅鹅黄胶囊上的加重字（对 #FFE4A0 为 4.73:1，达 AA 正文） */
  --cd-accent-ink: #8a5a22;

  /* ---- 玻璃材质（= --bg-card / --bg-glass）----
     只保留"半透明 + 渐变 + 白描边 + 顶部高光"，不含 backdrop-filter（理由见文件头） */
  --cd-card: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.82) 0%,
    rgba(255, 255, 255, 0.7) 50%,
    rgba(255, 253, 250, 0.74) 100%
  );
  --cd-glass: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.66) 0%,
    rgba(255, 252, 245, 0.5) 100%
  );
  --cd-card-line: rgba(255, 255, 255, 0.6);

  /* ---- 多层阴影系统（= --shadow-contact/mid/far/inset 组合）---- */
  --cd-sh-contact: 0 1px 2px rgba(139, 119, 99, 0.06);
  --cd-sh-mid: 0 4px 12px rgba(139, 119, 99, 0.1);
  --cd-sh-far: 0 12px 32px rgba(139, 119, 99, 0.14);
  --cd-sh-inset: inset 0 1px 0 rgba(255, 255, 255, 0.9),
    inset 0 -1px 2px rgba(139, 119, 99, 0.04);
  --cd-card-shadow: var(--cd-sh-contact), var(--cd-sh-mid), var(--cd-sh-far),
    var(--cd-sh-inset);
  --cd-card-shadow-hi: 0 2px 6px rgba(139, 119, 99, 0.08),
    0 8px 24px rgba(139, 119, 99, 0.14), 0 20px 56px rgba(139, 119, 99, 0.18),
    inset 0 1px 0 rgba(255, 255, 255, 0.95);
  /* 按钮专用：暖色发光（= --shadow-btn 系） */
  --cd-btn-shadow: 0 3px 10px rgba(240, 184, 96, 0.3),
    0 1px 4px rgba(240, 184, 96, 0.18);
  --cd-btn-shadow-press: 0 1px 3px rgba(240, 184, 96, 0.22),
    inset 0 1px 3px rgba(139, 119, 99, 0.08);

  /* ---- 圆角（= --radius-sm/md/lg/xl，整体比改造前更大）---- */
  --cd-r-pill: 999px;
  --cd-r-sm: 16px;
  --cd-r-md: 24px;
  --cd-r-lg: 32px;
  --cd-r-xl: 40px;

  /* ---- 动效曲线（= --ease-spring/smooth/bounce）---- */
  --cd-dur: 220ms;
  --cd-ease: cubic-bezier(0.34, 1.56, 0.64, 1);      /* 弹性回弹（主用） */
  --cd-ease-smooth: cubic-bezier(0.4, 0, 0.2, 1);    /* 平滑进出 */
  --cd-ease-bounce: cubic-bezier(0.68, -0.55, 0.27, 1.55);

  /* ---- 品牌渐变：全站唯一的按钮/选中态/导航渐变 ---- */
  --cd-grad-brand: linear-gradient(135deg, #ffe4a0 0%, #ffd4b3 100%);
  /* 加深档：用于"选中"这类必须和浅色底拉开差距的场景。
     直接用 --cd-grad-brand 会和马卡龙底色（尤其鹅黄）糊在一起，分不出选没选中 */
  --cd-grad-brand-deep: linear-gradient(135deg, #ffd08a 0%, #ffb37a 100%);

  /* ---- 语义色（依 PRD §8 冻结，不随风格调整）----
     红/绿只出现在金额数字上且金额 ≥19px 粗体（大字号档）；
     在新背景上实测仍 ≥3.74:1。小于 19px 的红色仅删除按钮，走加深档。 */
  --cd-expense: #e24b4a;
  --cd-income: #12924f;
  --cd-danger-ink: #b93b39;

  /* ---- 分隔：玻璃风下改用暖棕半透明细线，实色线在玻璃卡上会显脏 ---- */
  --cd-line-ink: rgba(139, 119, 99, 0.14);

  /* ---- 吸顶导航（规范见 docs/nailong-ui-spec.md §11 / §12）----
     底色从旧饱和黄 #FFD34D 换成更浅的鹅黄→蜜桃渐变后，不透明度下限会抬高：
     旧配色 α≥0.527，新配色在蜜桃端需 α≥0.708，故取 0.84（最坏 5.26:1）。 */
  --cd-nav-h: 44px;
  --cd-nav-total: calc(var(--status-bar-height, 0px) + var(--cd-nav-h));
  --cd-nav-rad: 0 0 var(--cd-r-lg) var(--cd-r-lg);
  --cd-nav-solid: linear-gradient(135deg, #ffe4a0 0%, #ffd4b3 100%);
  --cd-nav-bg: linear-gradient(
    135deg,
    rgba(255, 228, 160, 0.84) 0%,
    rgba(255, 212, 179, 0.84) 100%
  );
  --cd-nav-ink: #5a4a3a;
  --cd-nav-filter: blur(14px) saturate(1.25);

  /* ---- 吉祥物配色（仅 mascot.vue 使用）----
     头部从改造前的饱和黄重调为马卡龙鹅黄系，才能和新的主色/导航连成一套 */
  --cd-face-head: linear-gradient(180deg, #fff0c2 0%, #ffe4a0 55%, #ffd08a 100%);
  --cd-face-tuft: #f0b860;
  --cd-face-ink: #5a4a3a;
  --cd-face-mouth: #c2504c;
  --cd-face-glint: #fffdf7;
  --cd-blush: #ffb0c0;

  /* ---- 字体 ----
     参考项目走 Google Fonts CDN 加载 Nunito / Varela Round；
     本项目坚持离线优先、不加外部字体请求，故只把它们排进字体栈——
     装在系统里就用得上，装不上就回退到系统圆体（小米 HyperOS 命中 MiSans）。 */
  --cd-font: "Nunito", "Varela Round", "MiSans", "HarmonyOS Sans SC",
    "PingFang SC", "Noto Sans SC", "Source Han Sans SC", system-ui,
    -apple-system, "Segoe UI", Roboto, sans-serif;
}

page {
  /* 多色渐变背景，fixed 让渐变固定在视口上、不随内容滚走 */
  background: var(--cd-bg);
  background-attachment: fixed;
  background-color: var(--cd-bg-end);
  font-family: var(--cd-font);
  color: var(--cd-ink);
  font-size: 14px;
  -webkit-font-smoothing: antialiased;
}

/* ==========================================================================
   全局材质类（参考项目设计规范的复用入口）
   页面与组件只挂类名，不重复写玻璃配方 —— 改一处全局生效
   ========================================================================== */

/* 玻璃卡片：半透明渐变 + 白描边 + 多层阴影 + 顶部高光条 */
.cd-card {
  position: relative;
  background: var(--cd-card);
  border: 1px solid var(--cd-card-line);
  border-radius: var(--cd-r-md);
  box-shadow: var(--cd-card-shadow);
  overflow: hidden;
}
/* 顶部高光条：参考项目 .status-card::after，是"玻璃"观感的关键细节 */
.cd-card::after {
  content: "";
  position: absolute;
  top: 0;
  left: 12%;
  right: 12%;
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(255, 255, 255, 0.7) 20%,
    rgba(255, 255, 255, 0.92) 50%,
    rgba(255, 255, 255, 0.7) 80%,
    transparent 100%
  );
  pointer-events: none;
}

/* 可选：更高一档的悬浮阴影（= 参考项目 --shadow-card-hover）。
   用独立类而不是在页面里覆盖 box-shadow —— 同权重下靠"谁后写"生效，
   散落在各页覆盖会变成不确定行为。写在 .cd-card 之后，顺序确定。 */
.cd-elevated {
  box-shadow: var(--cd-card-shadow-hi);
}

/* 可选：右上角柔光斑（参考项目 .status-card::before），只用在大卡片上，
   列表里逐行加会显脏 */
.cd-glow::before {
  content: "";
  position: absolute;
  top: -30px;
  right: -30px;
  width: 100px;
  height: 100px;
  background: radial-gradient(circle, var(--cd-cream-yellow) 0%, transparent 70%);
  opacity: 0.45;
  pointer-events: none;
}

/* 更薄的玻璃：用于次级容器（备注输入框、月份栏底等） */
.cd-glass {
  background: var(--cd-glass);
  border: 1px solid var(--cd-card-line);
  border-radius: var(--cd-r-sm);
}

/* 弹性按压反馈 + 悬停抬升：参考项目的 .action-card/.btn-cream 交互语言 */
.cd-press {
  transition: transform var(--cd-dur) var(--cd-ease),
    box-shadow var(--cd-dur) var(--cd-ease-smooth);
}
.cd-press:active {
  transform: scale(0.965) translateY(1px);
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

/* 装饰性轻微浮动：参考项目 gentleBounce 的克制版（幅度更小，避免打扰阅读） */
@keyframes cd-gentle-float {
  0%,
  100% {
    transform: translateY(0) rotate(-4deg);
  }
  50% {
    transform: translateY(-6px) rotate(4deg);
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
