<template>
  <view class="tc-wrap">
    <view class="tc-mask" @click="$emit('close')"></view>
    <view class="tc-sheet" @click.stop>
      <text class="tc-title">{{ title }}</text>
      <input
        v-model="text"
        class="tc-input"
        :placeholder="placeholder"
        :maxlength="64"
        :focus="true"
        confirm-type="done"
        @confirm="submit"
      />
      <text class="tc-tip">{{ tip }}</text>
      <view class="tc-actions">
        <button class="tc-btn tc-cancel" hover-class="tc-hover" @click="$emit('close')">取消</button>
        <button class="tc-btn tc-ok" hover-class="tc-hover" @click="submit">确定</button>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { MAX_TAGS, MAX_TAG_NAME, parseTagInput } from '../../utils/tag.js'

/**
 * 新建标签输入框（T5.1）。
 *
 * 为什么不用 `uni.showModal({ editable: true })`：editable 在 App / H5 / 各小程序端
 * 的支持程度不一致，一旦不支持就是"点了没反应"。自己写一个底部输入框，
 * 三个端行为完全一致，也便于把"一次建多个"的提示写清楚。
 *
 * 组件只负责收集文本并 emit，**建标签由调用方做**（它才知道要 toast 什么、要不要自动选中）。
 */
// 模板里直接用 title / placeholder / tip，不需要接住返回值
defineProps({
  title: { type: String, default: '新建标签' },
  placeholder: { type: String, default: '如：报销、出差' },
  tip: {
    type: String,
    default: '一次可以写多个，用逗号或空格隔开；单个最多 ' + MAX_TAG_NAME + ' 字，最多 ' + MAX_TAGS + ' 个'
  }
})
const emit = defineEmits(['close', 'submit'])

const text = ref('')

function submit() {
  const names = parseTagInput(text.value)
  if (!names.length) {
    uni.showToast({ title: '先写个标签名嘛~', icon: 'none' })
    return
  }
  emit('submit', names)
}
</script>

<style scoped>
/* 外壳 fixed、遮罩 absolute —— 与 filter-sheet / edit-sheet / webdav-sheet 同一套结构 */
.tc-wrap {
  position: fixed;
  inset: 0;
  z-index: 120;
}
.tc-mask {
  position: absolute;
  inset: 0;
  background: rgba(93, 78, 55, 0.45);
  animation: cd-fade-in 200ms ease both;
}
.tc-sheet {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--cd-surface);
  border-radius: var(--cd-r-card) var(--cd-r-card) 0 0;
  padding: 18px 16px calc(18px + var(--status-bar-height, 0px));
  box-shadow: var(--cd-sh-pop);
}
.tc-title {
  display: block;
  font-size: 16px;
  font-weight: 800;
  color: var(--cd-ink);
  margin-bottom: 12px;
}
.tc-input {
  height: 44px;
  background: var(--cd-bg);
  border-radius: var(--cd-r-md);
  padding: 0 14px;
  font-size: 15px;
  color: var(--cd-ink);
}
.tc-tip {
  display: block;
  margin-top: 8px;
  font-size: 12px;
  color: var(--cd-ink-3);
  line-height: 1.5;
}
.tc-actions {
  display: flex;
  gap: 10px;
  margin-top: 16px;
}
.tc-btn {
  flex: 1;
  height: 44px;
  line-height: 44px;
  border-radius: var(--cd-r-pill);
  font-size: 15px;
  font-weight: 800;
  border: none;
}
/* uni-app 会把 <button> 编成 <uni-button>，样式必须挂在类名上而不是标签名 */
.tc-btn::after {
  border: none;
}
.tc-cancel {
  background: var(--cd-bg);
  color: var(--cd-ink-2);
}
.tc-ok {
  background: var(--cd-primary);
  color: var(--cd-btn-ink);
}
.tc-hover {
  opacity: 0.85;
}
</style>
