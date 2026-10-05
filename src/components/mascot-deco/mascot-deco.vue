<template>
  <!--
    占位模式：只画框 + 短说明，不嵌真实图片。
    框的宽/高/圆角与真图模式**完全相同**（都取自 slots.js），
    所以后续把 :placeholder 改成 false（或上传素材后改 slots.file），
    视觉与排版都不会发生位移。
  -->
  <view v-if="placeholder" class="ph deco" :style="style">
    <text class="ph-label" :style="labelStyle">{{ label }}</text>
    <text v-if="hintVisible" class="ph-hint">{{ slotData ? slotData.size : '' }}</text>
  </view>

  <!-- 真图模式：与占位框共用同一个盒子 -->
  <image
    v-else
    class="deco"
    :src="src"
    :mode="mode"
    :style="style"
    :lazy-load="lazy"
  />
</template>

<script setup>
import { computed } from 'vue'
import { decoSrc, decoStyle, decoMode } from './spec.js'
import { placeholderStyle, placeholderLabel, showHint } from '../asset-slot/ph.js'
import { slot as slotOf, hasSlot } from '../../utils/asset-slots.js'

/**
 * 奶龙 IP 装饰件。
 *
 * 两种模式（placeholder 切换）：
 * - true  → 画占位框 + 用途说明，**不加载任何图片**（当前默认）
 * - false → 加载 slots.js 里登记的真实素材
 *
 * 硬约束（改这个组件前先读）：
 * 1. 根节点 position:absolute —— 永不占布局流，不把正文挤变形；
 * 2. pointer-events:none —— 压在按钮上也不抢点击；
 * 3. 两种模式必须共用 decoStyle 算出的盒子，否则替换素材就会位移。
 */
const props = defineProps({
  /** 形象 key，见 spec.js 的 DECO_MOODS（真图模式用） */
  mood: { type: String, default: 'milo' },
  /** 尺寸档：inline / corner / hero */
  tier: { type: String, default: 'inline' },
  /** 显式边长；给了就覆盖档缺省 */
  size: { type: Number, default: 0 },
  /** 0~1，缺省按 tier 推导（corner 为 0.5） */
  opacity: { type: Number, default: -1 },
  /** 圆形裁切（配 aspectFill） */
  circle: { type: Boolean, default: false },
  /**
   * 插槽 id（见 utils/asset-slots.js）。给了就以登记表为准：
   * 占位框尺寸、用途文字、建议素材规格都从那里读，页面不用重复写。
   */
  slotId: { type: String, default: '' },
  /** true=只画占位框；false=加载真图。默认占位，等用户上传素材后再切。 */
  placeholder: { type: Boolean, default: true },
  /** 是否在占位框里显示建议素材尺寸（框太小会自动隐藏） */
  withHint: { type: Boolean, default: false }
})

/** 登记表里查到的插槽；没给 slotId 就返回 null */
const slotData = computed(function () {
  if (!props.slotId) return null
  if (!hasSlot(props.slotId)) {
    throw new Error('未登记的图片插槽：' + props.slotId)
  }
  return slotOf(props.slotId)
})

/**
 * 尺寸优先级：显式 size > 插槽登记尺寸 > 尺寸档缺省。
 * 这样插槽一旦登记，页面就不必再关心具体像素 —— 登记表是唯一事实源。
 */
const box = computed(function () {
  const s = slotData.value
  if (s) return { w: s.w, h: s.h, crop: s.crop, usage: s.usage }
  return { w: 0, h: 0, crop: props.circle ? 'fill-circle' : 'fit', usage: 'deco' }
})

const style = computed(function () {
  if (props.placeholder) {
    const s = slotData.value
    return placeholderStyle({
      w: box.value.w,
      h: box.value.h,
      tone: s ? toneOf(s.usage) : 'ghost',
      crop: box.value.crop,
      opacity: props.opacity >= 0 ? props.opacity : undefined
    })
  }
  return decoStyle({
    mood: props.mood,
    tier: props.tier,
    size: props.size || (slotData.value ? slotData.value.w : undefined),
    opacity: props.opacity >= 0 ? props.opacity : undefined,
    circle: props.circle || (slotData.value ? slotData.value.crop === 'fill-circle' : false)
  })
})

const label = computed(function () {
  const s = slotData.value
  if (!s) return placeholderLabel({ w: box.value.w, h: box.value.h, usage: '装饰图' })
  return placeholderLabel({ w: s.w, h: s.h, usage: usageLabel(s.usage) })
})

const labelStyle = computed(function () {
  // 框小于 64px 时不写小字，改为只留一个居中的小圆点，避免文字挤爆框
  return (box.value.w || 0) < 64 ? { display: 'none' } : {}
})

/** 建议素材尺寸要不要显示：开关打开**且**框够大（44px 框塞不下「180×180」） */
const hintVisible = computed(function () {
  if (!props.withHint) return false
  return showHint({ w: box.value.w || 0, size: slotData.value ? slotData.value.size : '' })
})

const src = computed(function () {
  return decoSrc(props.mood)
})

const mode = computed(function () {
  return decoMode({ circle: props.circle || (box.value.crop === 'fill-circle') })
})

/** 装饰件一律不 lazy：首屏必见，开 lazy 只会有闪烁（理由见 asset-slots.js 注释） */
const lazy = computed(function () {
  return slotData.value ? !!slotData.value.lazy : false
})

function toneOf(usage) {
  if (usage === 'hero' || usage === 'avatar' || usage === 'logo') return 'primary'
  if (usage === 'icon') return 'icon'
  if (usage === 'empty') return 'ink3'
  if (usage === 'banner') return 'blush'
  return 'ghost'
}

function usageLabel(usage) {
  if (usage === 'hero') return '主视觉'
  if (usage === 'avatar') return '头像'
  if (usage === 'icon') return '图标'
  if (usage === 'empty') return '空态插画'
  if (usage === 'banner') return '横幅插图'
  if (usage === 'logo') return 'Logo'
  return '装饰图'
}
</script>

<style scoped>
.deco {
  position: absolute;
  pointer-events: none;
  z-index: 0;
  display: block;
}

/* 占位框：虚线边框 + 淡黄底。pointer-events:none 保证绝不挡下层按钮。 */
.ph {
  position: absolute;
  pointer-events: none;
  z-index: 0;
  box-sizing: border-box;
  border-width: 1.5px;
  border-style: dashed;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.ph-label {
  font-size: 10px;
  line-height: 1.2;
  color: var(--cd-ink-2);
  text-align: center;
  padding: 0 2px;
}
.ph-hint {
  font-size: 9px;
  line-height: 1.2;
  color: var(--cd-ink-3);
  text-align: center;
  padding: 0 2px;
}
</style>
