<template>
  <view class="tx-item" hover-class="tx-hover" @click="$emit('click')">
    <view class="tx-icon" :style="{ backgroundColor: tintOf(category.id) }">{{ category.icon }}</view>
    <view class="tx-main">
      <text class="tx-name">{{ category.name }}</text>
      <text v-if="record.note" class="tx-note">{{ record.note }}</text>
    </view>
    <text class="tx-amount" :class="record.type">{{ formatted }}</text>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import { formatSigned } from '../../utils/money.js'
import { tintOf } from '../../utils/palette.js'

const props = defineProps({
  record: { type: Object, required: true },
  category: { type: Object, required: true }
})
defineEmits(['click'])

const formatted = computed(function () {
  return formatSigned(props.record.amount_cents, props.record.type)
})
</script>

<style scoped>
.tx-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 13px 16px;
  /* 分隔线改用暖棕半透明细线：玻璃卡上的实色线会显脏 */
  border-bottom: 1px solid var(--cd-line-ink);
  transition: background-color var(--cd-dur) var(--cd-ease-smooth);
}
.tx-item:last-child {
  border-bottom: 0;
}
/* 按下时的整行反馈：比底色略深一档的暖白 */
.tx-hover {
  background: rgba(255, 228, 160, 0.28);
}
.tx-icon {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  border: 1.5px solid rgba(255, 255, 255, 0.9);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  flex: none;
}
.tx-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.tx-name {
  font-size: 15px;
  font-weight: 700;
  color: var(--cd-ink);
}
.tx-note {
  font-size: 12px;
  color: var(--cd-ink-2);
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* 金额 ≥19px 粗体：既是视觉焦点，也满足语义色作为"大字号"的对比度要求；
   tabular-nums 让数字等宽，滚动与编辑时不跳动 */
.tx-amount {
  font-size: 19px;
  font-weight: 800;
  letter-spacing: 0.2px;
  font-variant-numeric: tabular-nums;
}
.tx-amount.expense {
  color: var(--cd-expense);
}
.tx-amount.income {
  color: var(--cd-income);
}
</style>
