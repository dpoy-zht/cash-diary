<template>
  <view class="page">
    <nav-bar title="明细" />

    <view class="month-bar">
      <view class="mb-btn" hover-class="mb-hover" @click="metaStore.shift(-1)">‹</view>
      <text class="mb-label">{{ monthLabel }}</text>
      <view class="mb-btn" hover-class="mb-hover" @click="metaStore.shift(1)">›</view>
    </view>

    <view class="month-summary">
      <view class="ms-item">
        <text class="ms-label">支出</text>
        <text class="ms-num expense">{{ formatCents(summary.expenseCents) }}</text>
      </view>
      <view class="ms-item">
        <text class="ms-label">收入</text>
        <text class="ms-num income">{{ formatCents(summary.incomeCents) }}</text>
      </view>
    </view>

    <view class="list-scroll">
      <view v-if="!groups.length" class="empty">
        <mascot :size="108" mood="sleep" float />
        <text class="empty-text">这个月还没有记录，去「记一笔」补上吧</text>
      </view>

      <view v-for="g in groups" :key="g.day" class="day-card">
        <view class="day-head">{{ dayLabel(g.day) }}</view>
        <tx-item
          v-for="r in g.items"
          :key="r.id"
          :record="r"
          :category="catOf(r.category_id)"
          @click="openEdit(r)"
        />
      </view>
    </view>

    <edit-sheet
      :record="editing"
      :categories="editingCats"
      @close="editing = null"
      @save="onSave"
      @remove="onRemove"
    />
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { useTxStore } from '../../stores/tx.js'
import { useMetaStore } from '../../stores/meta.js'
import { useCategoryStore } from '../../stores/category.js'
import { groupByDay, dayLabel } from '../../utils/date.js'
import { formatCents } from '../../utils/money.js'
import { useNavScrollWatch } from '../../utils/nav-scroll.js'

const txStore = useTxStore()
const metaStore = useMetaStore()
const categoryStore = useCategoryStore()

// 滚动时采集帧率，供吸顶导航决定是否退回纯色档
useNavScrollWatch()

const editing = ref(null)

const monthLabel = computed(function () {
  return metaStore.ym.replace('-', '年') + '月'
})
const summary = computed(function () {
  return txStore.summary
})
const groups = computed(function () {
  return groupByDay(txStore.records)
})
const editingCats = computed(function () {
  if (!editing.value) return []
  return editing.value.type === 'expense' ? categoryStore.expenseCats : categoryStore.incomeCats
})

function catOf(id) {
  const c = categoryStore.list.find(function (item) { return item.id === id })
  return c || { icon: '❓', name: '未知' }
}

function openEdit(r) {
  editing.value = r
}

async function refresh() {
  await txStore.loadMonth(metaStore.ym)
}

async function onSave(payload) {
  try {
    await txStore.update(metaStore.ym, editing.value.id, payload)
    editing.value = null
    uni.showToast({ title: '已保存', icon: 'none' })
  } catch (err) {
    uni.showToast({ title: (err && err.message) || '保存失败', icon: 'none' })
  }
}

function onRemove() {
  uni.showModal({
    title: '删除记录',
    content: '确定删除这条记录吗？',
    success: function (res) {
      if (!res.confirm) return
      const id = editing.value.id
      editing.value = null
      txStore.remove(metaStore.ym, id).then(function () {
        uni.showToast({ title: '已删除', icon: 'none' })
      })
    }
  })
}

onShow(function () {
  refresh()
})
</script>

<style scoped>
.page {
  /* 整页滚动（不再自己撑 100vh + 内部滚动区）：
     这样流水才能从吸顶导航下方穿过去，毛玻璃才有作用对象 */
  padding-bottom: 16px;
}

/* ---- 月份切换 ---- */
.month-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px 8px;
}
/* 34px 圆形按钮，触达面积靠 padding 补足到 44px */
.mb-btn {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: 700;
  color: var(--cd-ink);
  background: var(--cd-surface);
  box-shadow: var(--cd-sh-1);
}
.mb-hover {
  background: var(--cd-primary-lt);
}
.mb-label {
  font-size: 16px;
  font-weight: 700;
  color: var(--cd-ink);
}

/* ---- 月合计：两张并排小卡 ---- */
.month-summary {
  display: flex;
  gap: 10px;
  margin: 0 16px 10px;
}
.ms-item {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 14px;
  background: var(--cd-surface);
  border-radius: var(--cd-r-md);
  box-shadow: var(--cd-sh-1);
}
.ms-label {
  font-size: 12px;
  color: var(--cd-ink-2);
}
/* 19px 粗体：语义色的"大字号"档，同时便于一眼比较两个合计 */
.ms-num {
  font-size: 19px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ms-num.expense {
  color: var(--cd-expense);
}
.ms-num.income {
  color: var(--cd-income);
}

/* ---- 流水列表：按天分组，每组一张圆角卡 ----
   容器不再自己滚动（见 .page 说明），整页一起滚 */
.list-scroll {
  padding-bottom: 4px;
}
.day-card {
  margin: 0 16px 10px;
  background: var(--cd-surface);
  border-radius: var(--cd-r-md);
  box-shadow: var(--cd-sh-1);
  overflow: hidden;
}
.day-head {
  font-size: 12px;
  font-weight: 600;
  color: var(--cd-ink-2);
  padding: 12px 16px 8px;
}

/* ---- 空状态：打盹的吉祥物 ---- */
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18px;
  padding: 56px 32px 60px;
}
.empty-text {
  font-size: 13px;
  line-height: 1.9;
  text-align: center;
  color: var(--cd-ink-2);
}
</style>
