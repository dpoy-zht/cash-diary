<template>
  <view class="cat-grid">
    <view
      v-for="c in categories"
      :key="c.id"
      class="cat-item"
      :class="{ active: c.id === modelValue }"
      @click="$emit('update:modelValue', c.id)"
    >
      <view class="cat-icon">{{ c.icon }}</view>
      <text class="cat-name">{{ c.name }}</text>
    </view>
  </view>
</template>

<script setup>
defineProps({
  categories: { type: Array, default: function () { return [] } },
  modelValue: { type: [Number, String], default: null }
})
defineEmits(['update:modelValue'])
</script>

<style scoped>
.cat-grid {
  display: flex;
  flex-wrap: wrap;
  padding: 8px;
  background: #fff;
  border-top: 1px solid #ebedf0;
  border-bottom: 1px solid #ebedf0;
}
.cat-item {
  width: 25%;
  padding: 10px 0 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.cat-icon {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: #f1f2f4;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
}
.cat-name {
  font-size: 12px;
  color: #8a8f99;
}
.cat-item.active .cat-icon {
  background: #e7f5f0;
  border: 1.5px solid #0f6e56;
}
.cat-item.active .cat-name {
  color: #0f6e56;
  font-weight: 600;
}
</style>
