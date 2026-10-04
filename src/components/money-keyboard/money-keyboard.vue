<template>
  <view class="keypad">
    <!-- 主区 4×4：数字 / 小数点 / 退格 + 右侧四则运算符列 -->
    <button
      v-for="k in keys"
      :key="k.key"
      class="key"
      :class="[k.cls || '', { disabled: k.key === '=' && !canEquals, off: k.key === 'clear' && !canClear }]"
      hover-class="key-hover"
      :hover-stay-time="60"
      @click="tap(k)"
      @longpress="longpress(k)"
    >
      <text v-if="k.key !== 'del'" class="key-text">{{ k.label }}</text>
      <view v-else class="key-del" :style="delIcon" />
    </button>
  </view>
</template>

<script setup>
/**
 * 计算器式金额键盘（记一笔页）。
 *
 * 布局参考用户提供的原型图：数字区 3 列 + 右侧运算符列，与图逐格一致
 *   7 8 9 ÷
 *   4 5 6 ×
 *   1 2 3 −
 *   . 0 ⌫ +
 * 底部动作行：清空 | = | 完成（黄）
 *
 * **与原型的两处差异及原因**（需求要求"布局与交互与参考图一致"，这里做最小必要偏离）：
 * 1. 原型右侧列是「📅 今天 / + / − / 完成」；四则运算需要 4 个运算符位、还需要 `=` 与清空，
 *    所以**日期按钮保留在备注行原位**（与原型同一行位置），右侧列改给四则运算，
 *    `=` 与清空放底部动作行 —— 数字区与原型的相对位置完全一致。
 * 2. 退格键**长按 = 全部清空**（原型没给清空位，用长按补上，避免多加一列破坏版式）。
 *
 * 组件本身无状态：只发事件，状态与算式全在 utils/calc.js（纯函数，可单测）。
 */
import { svgMaskStyle } from '../../utils/svg-icon.js'

const props = defineProps({
  /** 等号是否可用（算式不完整时置灰，给用户"按了没反应"的预期） */
  canEquals: { type: Boolean, default: false },
  /** 是否有内容可清空 */
  canClear: { type: Boolean, default: false }
})

const emit = defineEmits(['key', 'equals', 'clear', 'confirm'])

const keys = [
  { label: '7', key: '7' },
  { label: '8', key: '8' },
  { label: '9', key: '9' },
  { label: '÷', key: '/', cls: 'op' },

  { label: '4', key: '4' },
  { label: '5', key: '5' },
  { label: '6', key: '6' },
  { label: '×', key: '*', cls: 'op' },

  { label: '1', key: '1' },
  { label: '2', key: '2' },
  { label: '3', key: '3' },
  { label: '−', key: '-', cls: 'op' },

  { label: '.', key: '.' },
  { label: '0', key: '0' },
  { label: '⌫', key: 'del' },
  { label: '+', key: '+', cls: 'op' },

  { label: '清空', key: 'clear', cls: 'ghost' },
  { label: '=', key: '=', cls: 'eq' },
  { label: '完成', key: 'confirm', cls: 'action' }
]

const delIcon = svgMaskStyle(
  'M22 3H7c-.69 0-1.23.35-1.59.88L0 12l5.41 8.11c.36.53.9.89 1.59.89h15c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-3 12.59L17.59 17 14 13.41 10.41 17 9 15.59 12.59 12 9 8.41 10.41 7 14 10.59 17.59 7 19 8.41 15.41 12 19 15.59z'
)

function tap(k) {
  if (k.key === 'confirm') { emit('confirm'); return }
  if (k.key === '=') {
    if (!props.canEquals) return
    emit('equals')
    return
  }
  if (k.key === 'clear') {
    if (!props.canClear) return
    emit('clear')
    return
  }
  // 运算符用显示符号传出（× ÷），calc.js 内部也认 * /
  emit('key', k.key === '*' ? '×' : k.key === '/' ? '÷' : k.key)
}

function longpress(k) {
  // 退格长按 = 全部清空（原型未给清空位）
  if (k.key === 'del') emit('clear')
}
</script>

<style scoped>
/* 奶黄键盘区：与主题令牌一致，不硬编码色值 */
.keypad {
  margin-top: 14px;
  background: var(--cd-line);
  border-radius: var(--cd-r-card) var(--cd-r-card) 0 0;
  padding: 12px 12px calc(12px + constant(safe-area-inset-bottom));
  padding-bottom: calc(12px + env(safe-area-inset-bottom));
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  flex-shrink: 0; /* 键盘永远保持原高，不被上方内容挤扁 */
}
.key {
  width: 100%; /* uni 的 button 默认不吃 grid 的 stretch，显式撑满格宽 */
  height: 50px;
  background: var(--cd-surface);
  border: none;
  border-radius: var(--cd-r-sm);
  padding: 0;
  margin: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  font-size: 22px;
}
.key::after {
  border: none;
}
.key-text {
  font-size: 22px;
  font-weight: 700;
  color: var(--cd-ink);
}
.key-hover {
  background: var(--cd-primary-lt);
}
/* 运算符列：与数字键同底色，靠字重与字号区分（不做成另一套颜色，免得键盘花掉） */
.key.op .key-text {
  font-size: 24px;
  font-weight: 800;
  color: var(--cd-ink);
}
/* 清空：弱化处理，存在感低于数字 */
.key.ghost {
  background: transparent;
}
.key.ghost .key-text {
  font-size: 15px;
  font-weight: 700;
  color: var(--cd-ink-3);
}
.key.ghost.off,
.key.eq.disabled {
  opacity: 0.38;
}
/* 等号：蛋黄浅底 + 深字，和"完成"拉开层级 */
.key.eq {
  background: var(--cd-primary-lt);
}
.key.eq .key-text {
  font-size: 24px;
  font-weight: 800;
  color: var(--cd-primary-deep);
}
/* "完成"动作键：蛋黄底白字（沿用原 .key.action 样式） */
.key.action {
  grid-column: span 2; /* 与原型一致：完成键占两格宽 */
  background: var(--cd-primary);
  box-shadow: var(--cd-sh-btn);
}
.key.action .key-text {
  color: var(--cd-btn-ink);
  font-size: 16px;
  font-weight: 800;
}
.key-del {
  width: 24px;
  height: 24px;
  background: var(--cd-icon);
}
</style>
