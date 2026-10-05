<template>
  <image class="deco" :src="src" :mode="mode" :style="style" />
</template>

<script setup>
import { computed } from 'vue'
import { decoSrc, decoStyle, decoMode } from './spec.js'

/**
 * 奶龙 IP 装饰件 —— 统一"不遮挡正文、不喧宾夺主"的装饰渲染。
 *
 * 硬约束（改这个组件前先读）：
 * 1. 根节点 `position: absolute` —— 永远不占布局流，不会把正文挤变形；
 * 2. `pointer-events: none` —— 压在按钮/列表项上也不会抢点击；
 * 3. 尺寸只能走 spec.js 的三档或显式 size，避免页面随手写任意值破坏节奏；
 * 4. 需要"占位"（如空状态居中）时由父级用 flex 容器把它变成普通流内元素，
 *    组件自身不加任何 margin/padding。
 *
 * 素材全部复用包内已有 src/static/milo/*.webp（9 张），本组件不引入新图片。
 */
const props = defineProps({
  /** 形象 key，见 spec.js 的 DECO_MOODS */
  mood: { type: String, required: true },
  /** 尺寸档：inline（行内 44）/ corner（边角 44，半透明）/ hero（主插画 96） */
  tier: { type: String, default: 'inline' },
  /** 显式边长；给了就覆盖 tier 的缺省值 */
  size: { type: Number, default: 0 },
  /** 0~1，缺省按 tier 推导（corner 为 0.5） */
  opacity: { type: Number, default: -1 },
  /** 圆形裁切（带场景底的彩图用，配 aspectFill） */
  circle: { type: Boolean, default: false }
})

const src = computed(function () {
  return decoSrc(props.mood)
})

const mode = computed(function () {
  return decoMode({ circle: props.circle })
})

const style = computed(function () {
  return decoStyle({
    mood: props.mood,
    tier: props.tier,
    size: props.size || undefined,
    opacity: props.opacity >= 0 ? props.opacity : undefined,
    circle: props.circle
  })
})
</script>

<style scoped>
.deco {
  position: absolute;
  pointer-events: none;
  z-index: 0;
  display: block;
}
</style>
