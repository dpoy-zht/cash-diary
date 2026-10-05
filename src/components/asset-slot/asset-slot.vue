<template>
  <!--
    占位模式：只画框 + 用途说明，**不加载任何真实图片**。
    宽/高/圆角全部取自 utils/asset-slots.js 登记表，与真图模式共用同一个盒子，
    所以用户上传素材后只需把 :placeholder 改 false，排版不会发生任何位移。
  -->
  <view v-if="placeholder" class="ph" :style="style">
    <text class="ph-label" :style="labelStyle">{{ label }}</text>
    <text v-if="hintVisible" class="ph-hint">{{ data.size }}</text>
  </view>

  <!-- 真图模式：与占位框共用同一个盒子（同一段计算逻辑） -->
  <image
    v-else
    :class="imgClass"
    :src="src"
    :mode="mode"
    :style="style"
    :lazy-load="lazy"
  />
</template>

<script setup>
import { computed } from 'vue'
import { hasSlot, slot as slotOf } from '../../utils/asset-slots.js'
import { packSrc } from '../../utils/asset-packs.js'
import { placeholderStyle, placeholderLabel, showHint, cropToMode, cropToRadius } from './ph.js'

/**
 * 登记表的 file 字段有两种写法：
 *   'milo-waving.webp'  → 不带分组前缀，按**当前包**（ACTIVE_PACK）解析
 *   'meme-milo.webp'   → 带 `meme-` 前缀，锁定 meme 包（用于"原图零改动"的新增插槽）
 * 这里反查成表情 key + 包 id，让 packSrc() 拼出正确路径。
 */
function parseFile(file) {
  // 带 meme- 前缀 → 锁定 meme 包（新增素材永远走自己的包，不受 ACTIVE_PACK 影响）
  const m = /^meme-(milo)(?:-(.+))?\.webp$/.exec(file)
  if (m) {
    return { pack: 'meme', mood: m[2] || 'milo' }
  }
  // 不带前缀 → 用当前包。'milo.webp' 是基础形象（无 '-<mood>' 后缀）
  const mood = file === 'milo.webp' ? 'milo' : file.replace(/^milo-/, '').replace(/\.webp$/, '')
  return { pack: undefined, mood: mood }
}

/**
 * 通用图片插槽 —— 覆盖 12 处内容图 + 4 处圆形/圆角裁切位。
 *
 * 与 mascot-deco 的分工：
 * - mascot-deco：绝对定位的**装饰件**（navbar 边角、卡片右上角），永不占流
 * - asset-slot：本来就在布局流里的**内容图**（余额卡主视觉、空状态、头像）
 *
 * ⚠️ 关键决定：占位框**不挂页面的 imgClass**。
 * 页面类里写着各自的 width/height/border-radius（如 .milo{72×90}、.caishen{84×84,50%}），
 * 一旦挂上去就会和登记表算出的值打架 —— 要么尺寸走页面（则登记表失真），
 * 要么两边都要写 CSS 变量覆盖（脆弱且难读）。
 * 所以规则是：**空间规格只认登记表**，页面类只保留 margin/flex/position 等布局声明。
 * 位置（top/right）由调用处的父容器定位上下文负责，组件本身不参与。
 */
const props = defineProps({
  /** 插槽 id（见 utils/asset-slots.js），尺寸与用途以登记表为准 */
  slotId: { type: String, required: true },
  /**
   * true=只画占位框；false=加载真图。
   * 默认 false：素材已到位（见 src/static/milo/），走真图。
   * 需要重新对位时临时改 true，占位框与真图共用同一个盒子，排版不会动。
   */
  placeholder: { type: Boolean, default: false },
  /** 真图模式下的 class（仅真图生效，用于 margin/flex 等布局声明） */
  imgClass: { type: String, default: '' },
  /** 占位框内是否显示建议素材尺寸（框太小会自动隐藏） */
  withHint: { type: Boolean, default: false },
  /** 覆盖登记表里的文件（换素材时不必改 utils） */
  file: { type: String, default: '' }
})

const data = computed(function () {
  if (!hasSlot(props.slotId)) throw new Error('未登记的图片插槽：' + props.slotId)
  return slotOf(props.slotId)
})

/**
 * 占位与真图共用的盒子。两种模式的宽/高/圆角来自同一份登记表，
 * 这是"替换素材不影响排版"的唯一保证。
 */
const style = computed(function () {
  if (props.placeholder) {
    return placeholderStyle({
      w: data.value.w,
      h: data.value.h,
      tone: toneOf(data.value.usage),
      crop: data.value.crop
    })
  }
  return {
    width: data.value.w + 'px',
    height: data.value.h + 'px',
    borderRadius: cropToRadius(data.value.crop),
    display: 'block'
  }
})

const label = computed(function () {
  return placeholderLabel({ w: data.value.w, h: data.value.h, usage: usageLabel(data.value.usage) })
})

const labelStyle = computed(function () {
  // 框小于 64px 时不写小字，否则「空态插画 140×140」会把 52px 的框撑爆
  return data.value.w < 64 ? { display: 'none' } : {}
})

/** 建议素材尺寸要不要显示：开关打开**且**框够大（44px 框塞不下「180×180」） */
const hintVisible = computed(function () {
  return props.withHint && showHint({ w: data.value.w, size: data.value.size })
})

/**
 * 真图路径。走分组清单拼，不写死目录：
 * - 给了 file（插槽自定义，可带分组前缀）→ 直接用
 * - 否则由登记表的文件名（不含前缀）反查当前包
 */
const src = computed(function () {
  // 调用处显式给了 file 就用它（可带包前缀）
  if (props.file) {
    const p = parseFile(props.file)
    return packSrc(p.mood, p.pack)
  }
  // 否则按登记表解析：带 meme- 前缀的锁定 meme 包，其余跟当前包
  const p = parseFile(data.value.file)
  return packSrc(p.mood, p.pack || (data.value.pack === undefined ? undefined : data.value.pack))
})

const mode = computed(function () {
  return cropToMode(data.value.crop)
})

/** 装饰与内容图都是首屏必见，一律不 lazy（理由见 asset-slots.js 顶部注释） */
const lazy = computed(function () {
  return !!data.value.lazy
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
.ph {
  box-sizing: border-box;
  border-width: 1.5px;
  border-style: dashed;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex: none;
}
.ph-label {
  font-size: 11px;
  line-height: 1.25;
  color: var(--cd-ink-2);
  text-align: center;
  padding: 0 3px;
}
.ph-hint {
  font-size: 10px;
  line-height: 1.2;
  color: var(--cd-ink-3);
  text-align: center;
  padding: 0 3px;
}
</style>
