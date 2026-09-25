<template>
  <view class="mascot" :class="[mood, { float: float }]" :style="boxStyle">
    <view class="m-tuft"></view>
    <view class="m-head">
      <view class="m-eye m-eye--l"><view class="m-glint"></view></view>
      <view class="m-eye m-eye--r"><view class="m-glint"></view></view>
      <view class="m-cheek m-cheek--l"></view>
      <view class="m-cheek m-cheek--r"></view>
      <view class="m-mouth"></view>
    </view>
    <text v-if="mood === 'sleep'" class="m-zzz">z</text>
  </view>
</template>

<script setup>
import { computed } from 'vue'

/**
 * 原创吉祥物「小记龙」——纯 CSS 几何绘制，零图片资源。
 *
 * 实现要点：根节点把 font-size 设为 size，内部几何一律用百分比（相对自身盒子），
 * 阴影/位移用 em（此时 1em === size）。因此在任意 size 下都等比缩放，
 * 新增元素时请沿用这两条单位约定，不要混用 px。
 */
const props = defineProps({
  /** 边长（px），内部等比缩放 */
  size: { type: Number, default: 64 },
  /** happy：睁眼微笑；sleep：眯眼打盹（用于空状态） */
  mood: { type: String, default: 'happy' },
  /** 是否做轻微的上下浮动（用于空状态的"活着"感） */
  float: { type: Boolean, default: false }
})

const boxStyle = computed(function () {
  return {
    width: props.size + 'px',
    height: props.size + 'px',
    fontSize: props.size + 'px'
  }
})
</script>

<style scoped>
.mascot {
  position: relative;
  flex: none;
}

/* 头顶呆毛（奶龙无耳朵，改用一撮呆毛，避免与真实 IP 形象混淆） */
.m-tuft {
  position: absolute;
  left: 40%;
  top: 0;
  width: 9%;
  height: 14%;
  background: var(--cd-primary-dk);
  border-radius: 999px 999px 0 0;
  transform: rotate(-18deg);
  transform-origin: bottom center;
}

.m-head {
  position: absolute;
  left: 0;
  right: 0;
  top: 7%;
  height: 93%;
  border-radius: 50% 50% 46% 46%;
  /* 本组件是唯一允许内联色值的例外：头部渐变属于插画本身，不作为通用背景复用 */
  background: linear-gradient(180deg, #ffe98f 0%, #ffd34d 55%, #f9c02f 100%);
  /* 上缘柔光 + 下缘金黄内影 + 外部暖色投影，做出"软乎乎"的立体感 */
  box-shadow: inset 0 0.05em 0.08em rgba(255, 255, 255, 0.55),
    inset 0 -0.07em 0 rgba(240, 165, 0, 0.28), 0 0.05em 0.12em rgba(191, 149, 42, 0.25);
}

/* 眼睛：深棕圆点 + 白色高光，构成"童真的圆眼睛" */
.m-eye {
  position: absolute;
  top: 34%;
  width: 18%;
  height: 22%;
  background: var(--cd-face-ink);
  border-radius: 50%;
  transform-origin: center center;
}
.m-eye--l {
  left: 21%;
}
.m-eye--r {
  left: 58%;
}
.m-glint {
  position: absolute;
  left: 14%;
  top: 14%;
  width: 32%;
  height: 30%;
  background: var(--cd-surface);
  border-radius: 50%;
}

/* 腮红：两朵红晕，透明度压到 0.68 避免抢戏 */
.m-cheek {
  position: absolute;
  top: 56%;
  width: 19%;
  height: 13%;
  background: var(--cd-blush);
  border-radius: 50%;
  opacity: 0.68;
}
.m-cheek--l {
  left: 16%;
}
.m-cheek--r {
  left: 64%;
}

/* 嘴：上窄下圆的开口笑 */
.m-mouth {
  position: absolute;
  left: 41.5%;
  top: 60%;
  width: 17%;
  height: 11%;
  background: var(--cd-face-mouth);
  border-radius: 6% 6% 50% 50%;
}

/* 打盹状态：眼睛压扁成线，嘴改小 */
.sleep .m-eye {
  transform: scaleY(0.14);
}
.sleep .m-glint {
  opacity: 0;
}
.sleep .m-mouth {
  left: 44%;
  top: 64%;
  width: 12%;
  height: 4%;
  border-radius: 999px;
  background: var(--cd-face-ink);
}

/* 浮动的"z"（em 相对根 size，% 相对盒子） */
.m-zzz {
  position: absolute;
  top: -4%;
  right: -14%;
  font-size: 0.24em;
  line-height: 1;
  font-weight: 700;
  color: var(--cd-ink-3);
}

.float {
  animation: cd-mascot-float 2.8s ease-in-out infinite;
}
@keyframes cd-mascot-float {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-8%);
  }
}
</style>
