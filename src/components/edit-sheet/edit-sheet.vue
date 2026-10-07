<template>
  <view v-if="record" class="sheet-wrap">
    <view class="mask" @click="$emit('close')"></view>
    <view class="sheet">
      <view class="sheet-grip"></view>
      <view class="sheet-title">
        <text class="sheet-title-text">编辑记录</text>
        <text class="stype">{{ record.type === 'expense' ? '支出' : '收入' }}</text>
      </view>

      <input v-model="amountStr" class="sheet-input" type="digit" placeholder="金额" />

      <!-- 一级 chip 条 -->
      <scroll-view scroll-x class="sheet-cats" :show-scrollbar="false">
        <view class="chip-line">
          <view
            v-for="n in topList"
            :key="n.cat.id"
            class="chip"
            :class="{ active: n.cat.id === sel.topId }"
            @click="pickTop(n.cat.id)"
          >
            <view class="chip-dot" :style="{ background: colorOf(n.cat) }" />
            <text class="chip-name">{{ n.cat.name }}</text>
          </view>
        </view>
      </scroll-view>

      <!-- 二级 chip 条：只在当前一级有子类时出现，一级自己作为「全部」 -->
      <scroll-view v-if="sel.children.length" scroll-x class="sheet-cats sub" :show-scrollbar="false">
        <view class="chip-line">
          <view class="chip" :class="{ active: sel.isTopSelected }" @click="catId = sel.topId">
            <view class="chip-dot" :style="{ background: colorOf(sel.top) }" />
            <text class="chip-name">全部{{ sel.top.name }}</text>
          </view>
          <view
            v-for="c in sel.children"
            :key="c.id"
            class="chip"
            :class="{ active: c.id === sel.selected }"
            @click="catId = c.id"
          >
            <view class="chip-dot" :style="{ background: colorOf(c) }" />
            <text class="chip-name">{{ c.name }}</text>
          </view>
        </view>
      </scroll-view>

      <view class="sheet-meta">
        <input v-model="note" class="sheet-input sheet-note" type="text" placeholder="备注（可选）" maxlength="30" />
        <picker mode="date" :value="dateStr" :start="minDateStr" :end="todayStr" @change="onDateChange">
          <view class="sheet-date">{{ dateStr.slice(5) }}</view>
        </picker>
      </view>

      <!-- 标签：已选状态由父级持有（这样"现场新建"后能立刻回填选中） -->
      <text class="sheet-label">标签</text>
      <tag-chips
        :model-value="tagIds"
        :tags="tags"
        @update:model-value="$emit('update:tagIds', $event)"
        @create="$emit('createTag')"
      />

      <view class="sheet-actions">
        <button class="btn-del" hover-class="btn-hover" @click="$emit('remove')">删除</button>
        <button class="btn-save" hover-class="btn-hover" @click="onSave">保存</button>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { colorOf } from '../../utils/palette.js'
import { selectionOf, nextOnPickTop } from '../../utils/category-ui.js'
import { toDateStr } from '../../utils/date.js'
import { clampFutureDate, minSelectableDate } from '../../utils/entry.js'
import TagChips from '../tag-chips/tag-chips.vue'

const props = defineProps({
  record: { type: Object, default: null },
  /** 两级分类树（buildTree 的产物：[{cat, children}]）—— 与记账页共用 category-picker 的同一套推导 */
  tree: { type: Array, default: function () { return [] } },
  /** 当前账本的全部标签 */
  tags: { type: Array, default: function () { return [] } },
  /** 这笔流水已选的标签 id（父级持有：现场新建后要能立刻回填选中） */
  tagIds: { type: Array, default: function () { return [] } }
})
const emit = defineEmits(['close', 'save', 'remove', 'update:tagIds', 'createTag'])

const amountStr = ref('')
const catId = ref(null)
const note = ref('')
const dateStr = ref(toDateStr(Date.now()))
/** 日期可选范围与记账页一致：不早于 5 年前、不晚于今天（T3.3 的同一套约束） */
const todayStr = ref(toDateStr(Date.now()))
const minDateStr = ref(minSelectableDate(todayStr.value))

const topList = computed(function () {
  return (Array.isArray(props.tree) ? props.tree : []).filter(function (n) { return n && n.cat })
})
const sel = computed(function () {
  return selectionOf(props.tree, catId.value)
})

/** 点一级只切一级，不把已选好的二级顶掉（规则与记账页共用同一个纯函数） */
function pickTop(topId) {
  const next = nextOnPickTop(sel.value, topId)
  if (next == null) return
  catId.value = next
}

function onDateChange(e) {
  dateStr.value = clampFutureDate(e.detail.value, todayStr.value)
}

watch(
  function () { return props.record },
  function (r) {
    if (!r) return
    amountStr.value = (r.amount_cents / 100).toFixed(2)
    catId.value = r.category_id
    note.value = r.note || ''
    dateStr.value = toDateStr(r.occurred_at)
  },
  { immediate: true }
)

function onSave() {
  emit('save', {
    amountStr: amountStr.value,
    categoryId: catId.value,
    note: note.value,
    type: props.record.type,
    dateStr: dateStr.value,
    // 标签一起交出去，由父级在保存时统一落库（与记账页同一条链路）
    tagIds: Array.isArray(props.tagIds) ? props.tagIds.slice() : []
  })
}
</script>

<style scoped>
.sheet-wrap {
  position: fixed;
  inset: 0;
  z-index: 99;
}
/* 暖色调遮罩，替代纯黑半透明，避免画面发灰 */
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
  /* 留出全面屏底部安全区；不支持 env() 时上一行兜底 */
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
  margin-bottom: 12px;
}
.sheet-title-text {
  font-size: 16px;
  font-weight: 800;
  color: var(--cd-ink);
}
.stype {
  font-size: 12px;
  font-weight: 700;
  color: var(--cd-ink);
  background: var(--cd-primary-lt);
  padding: 3px 10px;
  border-radius: var(--cd-r-pill);
}
.sheet-input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--cd-line);
  border-radius: var(--cd-r-sm);
  background: var(--cd-bg);
  padding: 12px 14px;
  font-family: var(--cd-font);
  font-size: 16px;
  font-weight: 700;
  color: var(--cd-ink);
  font-variant-numeric: tabular-nums;
  margin-bottom: 10px;
}
.sheet-cats {
  white-space: nowrap;
  padding: 2px 0 10px;
}
/* 二级条：贴着一级条下面，少留一点间距（两条同属"选分类"一组） */
.sheet-cats.sub {
  padding-top: 0;
}
/* chips 靠 inline-flex 撑开宽度，让 scroll-view 能横向滚动（flex 容器会撑不满/被压缩） */
.chip-line {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
/* 备注 + 日期同一行：备注自适应宽度，日期按钮不换行 */
.sheet-label {
  display: block;
  font-size: 12px;
  font-weight: 700;
  color: var(--cd-ink-2);
  margin: 2px 0 8px;
}
.sheet-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}
.sheet-note {
  flex: 1;
  min-width: 0;
  margin-bottom: 0;
}
.sheet-date {
  border: 1px solid var(--cd-line);
  border-radius: var(--cd-r-sm);
  background: var(--cd-bg);
  padding: 13px 14px;
  font-size: 14px;
  font-weight: 700;
  color: var(--cd-ink);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: var(--cd-r-pill);
  background: var(--cd-bg);
  padding: 8px 14px;
  margin-right: 8px;
  transition: transform var(--cd-dur) var(--cd-ease);
}
.chip-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}
.chip-name {
  font-size: 13px;
  font-weight: 700;
  color: var(--cd-ink);
}
/* 选中的 chip：蛋黄实底深棕字（= 参考包选中语言） */
.chip.active {
  background: var(--cd-primary);
}
.chip.active .chip-name {
  font-weight: 800;
}
.sheet-actions {
  display: flex;
  gap: 10px;
  margin-top: 6px;
}
.sheet-actions button {
  flex: 1;
  height: 50px;
  line-height: 50px;
  border-radius: var(--cd-r-pill);
  font-family: var(--cd-font);
  font-size: 16px;
  font-weight: 800;
}
.sheet-actions button::after {
  border: none;
}
.btn-del {
  background: var(--cd-surface);
  color: var(--cd-danger-ink);
  border: 1.5px solid var(--cd-primary);
}
.btn-save {
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
