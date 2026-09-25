<template>
  <view class="keypad">
    <button
      v-for="k in keys"
      :key="k"
      class="key"
      hover-class="key-hover"
      @click="onPress(k)"
    >{{ k === 'del' ? '⌫' : k }}</button>
  </view>
</template>

<script setup>
const emit = defineEmits(['press'])
const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del']

function onPress(k) {
  emit('press', k)
}
</script>

<style scoped>
.keypad {
  display: flex;
  flex-wrap: wrap;
  padding: 0 16px;
  gap: 8px;
}
.key {
  width: calc((100% - 16px) / 3);
  height: 48px;
  line-height: 48px;
  padding: 0;
  background: #fff;
  border-radius: 10px;
  font-size: 20px;
  color: #222426;
}
.key::after {
  border: none;
}
.key-hover {
  background: #eceef1;
}
</style>
