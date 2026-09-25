<template>
  <view class="nav-wrap">
    <!-- 固定层：内容会从它下方经过，毛玻璃才有作用对象 -->
    <view class="nav" :class="{ 'can-blur': uiStore.navCanBlur }">
      <view class="nav-status"></view>
      <view class="nav-main">
        <view class="nav-title">
          <mascot v-if="icon" :size="26" />
          <text class="nav-text">{{ title }}</text>
        </view>
        <slot></slot>
      </view>
    </view>
    <!-- 占位层：在文档流里把内容顶下来。滚动时它会先滚走，
         之后内容就能穿过上面的固定层 —— 这是"吸顶"的关键。 -->
    <view class="nav-ph"></view>
  </view>
</template>

<script setup>
import { onMounted } from 'vue'
import { useUiStore } from '../../stores/ui.js'

/**
 * 自绘吸顶导航。
 *
 * 为什么必须自绘：App 端原生导航栏由系统 / WebView 外壳绘制，页面内容无法滚到它
 * 下面，因此原生栏永远做不出半透明 + 模糊。只能用 pages.json 的
 * navigationStyle:"custom" 去掉原生栏，再由本组件自绘。
 *
 * 视觉对齐 sdufe-nailong-checkin 的 .top-nav：鹅黄→蜜桃渐变、底部 32px 大圆角、
 * 标题左侧带 IP 头像（这里是项目自带的原创吉祥物，避免使用第三方 IP 素材）。
 *
 * 两档渲染（规范见 docs/nailong-ui-spec.md §11）：
 *   默认 = 不透明渐变（参考项目的观感）；判定通过后才加 .can-blur 升为毛玻璃。
 *   能力兜底放在 CSS（@supports / prefers-reduced-transparency），
 *   偏好与性能判定放在 store —— JS 挂掉时只会更清楚，不会漏底色。
 *
 * 页面侧还需调用 useNavScrollWatch() 接入滚动帧率采样（见 utils/nav-scroll.js）。
 */
defineProps({
  title: { type: String, default: '' },
  /** 标题前是否显示吉祥物头像（对应参考项目 .nav-icon） */
  icon: { type: Boolean, default: true }
})

const uiStore = useUiStore()

onMounted(function () {
  // 幂等：正常由 App.vue onLaunch 初始化，这里兜底（如 H5 直接深链进某个页面）
  uiStore.init()
})
</script>

<style scoped>
.nav-wrap {
  /* 组件自带占位，页面只需把它放在最顶部，无需再算 padding */
  height: var(--cd-nav-total);
}

.nav {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 90; /* 高于页面内容，低于弹层（edit-sheet z-index:99） */
  background: var(--cd-nav-solid);
  color: var(--cd-nav-ink);
  /* 底部大圆角：参考项目 .top-nav 的招牌形状；圆角缺口处会露出滚动的内容 */
  border-radius: var(--cd-nav-rad);
  box-shadow: var(--cd-sh-contact), var(--cd-sh-mid);
  transition: box-shadow var(--cd-dur) var(--cd-ease-smooth);
}

/* 能力兜底放在 CSS：不支持 backdrop-filter 的 WebView 直接停在纯渐变档 */
@supports (backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)) {
  .nav.can-blur {
    background: var(--cd-nav-bg);
    -webkit-backdrop-filter: var(--cd-nav-filter);
    backdrop-filter: var(--cd-nav-filter);
    /* 悬浮感：毛玻璃档下把阴影加重，和圆角一起形成"浮起的胶囊" */
    box-shadow: var(--cd-sh-contact), var(--cd-sh-mid), var(--cd-sh-far);
  }
}

/* 系统开启「减弱透明度」时再强制退回不透明档（双重保险，不依赖 JS 判定） */
@media (prefers-reduced-transparency: reduce) {
  .nav.can-blur {
    background: var(--cd-nav-solid);
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
    box-shadow: var(--cd-sh-contact), var(--cd-sh-mid);
  }
}

/* 状态栏占位：--status-bar-height 是 uni-app 注入的 CSS 变量，H5 端为 0 */
.nav-status {
  height: var(--status-bar-height, 0px);
}

.nav-main {
  height: var(--cd-nav-h);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
}

/* 标题 + IP 头像（参考项目 .nav-title / .nav-icon） */
.nav-title {
  display: flex;
  align-items: center;
  gap: 7px;
}
.nav-text {
  font-size: 19px;
  font-weight: 800;
  letter-spacing: 0.5px;
}

.nav-ph {
  height: var(--cd-nav-total);
}
</style>
