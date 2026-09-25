<template>
  <view class="tx-item" @click="$emit('click')">
    <view class="tx-icon">{{ category.icon }}</view>
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
  padding: 12px 16px;
  background: #fff;
  border-bottom: 1px solid #ebedf0;
}
.tx-icon {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: #f4f5f7;
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
  color: #222426;
}
.tx-note {
  font-size: 12px;
  color: #8a8f99;
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tx-amount {
  font-size: 16px;
  font-weight: 600;
}
.tx-amount.expense {
  color: #e24b4a;
}
.tx-amount.income {
  color: #12924f;
}
</style>
