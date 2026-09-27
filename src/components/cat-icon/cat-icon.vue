<template>
  <view class="ci" :style="{ background: color, width: size + 'px', height: size + 'px' }">
    <view v-if="mask" class="ci-glyph" :style="mask" />
    <text v-else class="ci-emoji">{{ emoji }}</text>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import { colorOf, iconMaskStyle } from '../../utils/palette.js'

/**
 * 分类图标：v2.0 风格 = 彩色正圆底 + 白色面性图标（CSS mask 渲染）。
 * 老数据里没有 SVG 映射的分类名，自动退回 emoji（category.icon 字段）。
 * 尺寸由 size  prop 控制（正圆），父级也可直接覆盖。
 */
const props = defineProps({
  category: { type: Object, default: () => ({}) },
  size: { type: Number, default: 40 }
})

const color = computed(function () {
  return colorOf(props.category)
})
const mask = computed(function () {
  return iconMaskStyle(props.category)
})
const emoji = computed(function () {
  return (props.category && props.category.icon) || '•'
})
</script>

<style scoped>
.ci {
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
}
/* 白色 glyph：mask 裁出图标形状，元素本身纯白。
   ⚠️ 这里要的是"看起来饱满"，不是"外框占满"：
   Material 图标 path 在 24×24 viewBox 里自带约 21% 留白（实测 19 个图标平均着色只占 78.9%），
   所以外框取 56% 时视觉上只有圆底的 44%，明显偏小。
   取 70% 后视觉 ≈ 55%，既饱满又留得住边距。改这个值前先想清楚它是"外框"而不是"视觉尺寸"。 */
.ci-glyph {
  width: 70%;
  height: 70%;
  background: #ffffff;
}
/* emoji 兜底（老数据）：emoji 字形本身几乎撑满字框，所以字号比上面的外框小一档才视觉一致 */
.ci-emoji {
  font-size: 58%;
  line-height: 1;
}
</style>
