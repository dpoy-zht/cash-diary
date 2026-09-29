<template>
  <view class="sheet-wrap">
    <view class="mask" @click="$emit('close')"></view>
    <view class="sheet">
      <view class="sheet-grip"></view>
      <view class="sheet-title">
        <text class="sheet-title-text">WebDAV 云备份</text>
        <text class="sheet-close" @click="$emit('close')">×</text>
      </view>

      <text class="f-label">服务器地址</text>
      <input v-model="url" class="f-input" type="text" placeholder="https://dav.jianguoyun.com/dav" />

      <text class="f-label">账号</text>
      <input v-model="user" class="f-input" type="text" placeholder="登录邮箱" />

      <text class="f-label">密码 / 应用密码</text>
      <input v-model="pass" class="f-input" :password="true" placeholder="建议用单独生成的应用密码" />

      <text class="tip">
        备份会传到你自己填的这个目录下（文件名 {{ fileName }}），不经过任何第三方服务器。
      </text>
      <text class="tip warn">
        密码只是「混淆」后存在本机，不是加密 —— 挡得住顺手看一眼，挡不住有心人。
        建议在网盘里单独生成一个只能访问该目录的应用密码，别用主账号密码。
      </text>

      <view class="sheet-actions">
        <button class="sheet-btn btn-clear" hover-class="btn-hover" @click="$emit('close')">取消</button>
        <button class="sheet-btn btn-apply" hover-class="btn-hover" @click="onSave">保存</button>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, watch } from 'vue'
import { WEBDAV_FILE, normalizeConfig } from '../../utils/webdav.js'

/**
 * WebDAV 配置表单（T4.5）。
 * 组件不做校验也不落盘：只把三个字段原样交出去，归一化与保存都在 services/webdav.js，
 * 这样"界面值 → 存储值"的转换只有一处（同 filter-sheet 的思路）。
 */
const props = defineProps({
  config: { type: Object, default: null }
})
const emit = defineEmits(['close', 'save'])

const fileName = WEBDAV_FILE
const url = ref('')
const user = ref('')
const pass = ref('')

watch(
  function () { return props.config },
  function (c) {
    const v = normalizeConfig(c)
    url.value = v.url
    user.value = v.user
    pass.value = v.pass
  },
  { immediate: true }
)

function onSave() {
  emit('save', { url: url.value, user: user.value, pass: pass.value })
}
</script>

<style scoped>
.sheet-wrap {
  position: fixed;
  inset: 0;
  z-index: 99;
}
.mask {
  position: absolute;
  inset: 0;
  background: rgba(93, 78, 55, 0.45);
  animation: cd-fade-in 200ms ease both;
}
.sheet {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--cd-surface);
  border-radius: 28px 28px 0 0;
  padding: 8px 16px 24px;
  padding-bottom: calc(24px + env(safe-area-inset-bottom));
  animation: cd-sheet-up 240ms var(--cd-ease) both;
}
.sheet-grip {
  width: 44px;
  height: 5px;
  border-radius: var(--cd-r-pill);
  background: var(--cd-line);
  margin: 4px auto 14px;
}
.sheet-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}
.sheet-title-text {
  font-size: 16px;
  font-weight: 800;
  color: var(--cd-ink);
}
.sheet-close {
  font-size: 22px;
  line-height: 1;
  color: var(--cd-icon-3);
  padding: 0 4px;
}
.f-label {
  display: block;
  font-size: 12px;
  font-weight: 700;
  color: var(--cd-ink-2);
  margin: 12px 0 6px;
}
.f-input {
  box-sizing: border-box;
  width: 100%;
  border: 1px solid var(--cd-line);
  border-radius: var(--cd-r-sm);
  background: var(--cd-bg);
  padding: 11px 14px;
  font-family: var(--cd-font);
  font-size: 14px;
  color: var(--cd-ink);
}
.tip {
  display: block;
  margin-top: 12px;
  font-size: 11px;
  line-height: 1.7;
  color: var(--cd-ink-2);
}
.tip.warn {
  color: var(--cd-danger-ink);
}
.sheet-actions {
  display: flex;
  gap: 10px;
  margin-top: 16px;
}
/* 用类选择器而不是 button 标签：uni-app H5 把 <button> 渲染成 <uni-button> */
.sheet-btn {
  flex: 1;
  height: 50px;
  line-height: 50px;
  border-radius: var(--cd-r-pill);
  font-family: var(--cd-font);
  font-size: 16px;
  font-weight: 800;
}
.sheet-btn::after {
  border: none;
}
.btn-clear {
  background: var(--cd-surface);
  color: var(--cd-icon);
  border: 1.5px solid var(--cd-primary);
}
.btn-apply {
  flex: 2;
  background: var(--cd-primary);
  color: var(--cd-btn-ink);
  box-shadow: var(--cd-sh-btn);
}
.btn-hover {
  opacity: 0.9;
  transform: scale(0.97) translateY(1px);
}
</style>
