<template>
  <view class="desk">
    <!-- 表头：跨两栏，不参与滚动 —— 两栏的"整体对齐"靠它成立 -->
    <view class="desk-head">
      <view class="dh-month">
        <view class="dh-arrow" @click="$emit('shift-month', -1)">
          <text class="dh-arrow-t">‹</text>
        </view>
        <text class="dh-month-t">{{ monthLabel }}</text>
        <view class="dh-arrow" @click="$emit('shift-month', 1)">
          <text class="dh-arrow-t">›</text>
        </view>
      </view>

      <view class="dh-figs">
        <view class="dh-fig">
          <text class="dh-fig-k">已存</text>
          <text class="dh-fig-v income">¥{{ incomeText }}</text>
        </view>
        <view class="dh-fig">
          <text class="dh-fig-k">已花</text>
          <text class="dh-fig-v">¥{{ expenseText }}</text>
        </view>
      </view>

      <text class="dh-budget" :class="{ over: budgetOver }">{{ budgetLine }}</text>

      <view class="dh-add" @click="$emit('add')">
        <text class="dh-add-t">＋ 记一笔</text>
      </view>
    </view>

    <view class="desk-body">
      <!-- ================= 左：列表 ================= -->
      <view class="desk-pane desk-left">
        <view class="desk-search">
          <view class="desk-search-bar">
            <input
              class="desk-search-input"
              :value="kw"
              placeholder="搜备注或分类，比如 奶茶"
              placeholder-class="desk-ph"
              confirm-type="search"
              @input="onKwInput"
            />
            <text v-if="kw" class="desk-search-clear" @click="$emit('clear-search')">×</text>
          </view>
          <view class="desk-filter" @click="$emit('filter')">
            <text class="desk-filter-t">筛选</text>
            <text v-if="filterCount" class="desk-filter-n">{{ filterCount }}</text>
          </view>
        </view>

        <view v-if="!searching" class="desk-seg">
          <view
            v-for="s in segs"
            :key="s.key"
            class="desk-seg-item"
            :class="{ on: seg === s.key }"
            @click="$emit('seg', s.key)"
          >{{ s.name }}</view>
        </view>

        <view v-if="!groups.length" class="desk-empty">
          <text class="desk-empty-t">{{ searching ? '没找到相关记录' : '这个月还没有流水' }}</text>
          <text class="desk-empty-s">{{ searching ? '换个关键词试试' : '点右上角「记一笔」开始' }}</text>
          <!-- 宽屏空库时也得有个"看看有数据是什么样"的入口，
               否则桌面端第一次打开只有一片空白（移动端空状态里有这个按钮） -->
          <view v-if="!searching" class="desk-seed" @click="$emit('seed')">
            <text class="desk-seed-t">载入示例账目 · 先看看有数据的样子</text>
          </view>
        </view>

        <block v-for="g in groups" :key="g.day">
          <view class="desk-day">
            <text class="desk-day-date">{{ dayLabel(g.day) }}</text>
            <text class="desk-day-sum">支出 ¥{{ formatCents(dayExpense(g.day)) }}</text>
          </view>
          <tx-item
            v-for="r in g.items"
            :key="r.id"
            :record="r"
            :category="catOf(r.category_id)"
            :tags="tagsOf(r.id)"
            :index="indexOf(r.id)"
            @click="$emit('edit', r)"
          />
        </block>
      </view>

      <!-- ================= 右：统计 ================= -->
      <view class="desk-pane desk-right">
        <desk-stats :records="records" :categories="categories" :summary="summary" />
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import TxItem from '../tx-item/tx-item.vue'
import DeskStats from './desk-stats.vue'
import { formatCents } from '../../utils/money.js'

/**
 * 桌面两栏页面（H5 + 宽屏才渲染）。
 *
 * ## 为什么是"纯展示 + 父级持有状态"
 * 月份、分段、搜索词、筛选条件全在 `home.vue`（它才是这个 App 的首页逻辑所在地）。
 * 这个组件只负责排版与派发事件 —— 好处是：
 *   · 分组/查表/汇总只有一份实现（都在 home.vue 与 utils/ 里），不会两栏一个口径；
 *   · 缩窄窗口退回单列时，用户选好的月份和搜索词不会丢（状态根本没搬过家）。
 * 所以下面这些"解析器"是**从父级传进来的函数**，不是在这里重新实现一遍。
 *
 * ## 主题与布局的开关放在 html 上
 * 深浅色令牌（`theme-dark.css`）与画布放宽（`desk-layout.css`）都写在
 * `html.cd-dark` / `html.cd-desk` 选择器下。挂载时给 documentElement 加类，
 * 卸载时摘掉 —— 这样底部 tab 栏、弹层这些**不在本组件内**的元素也会一起变深，
 * 而退回单列时不会留下深色残留。
 */
const props = defineProps({
  /** '2026-10' */
  ym: { type: String, default: '' },
  /** '2026年10月' */
  monthLabel: { type: String, default: '' },
  /** 已过滤的流水（月份 + 分段 + 搜索 + 筛选） */
  records: { type: Array, default: function () { return [] } },
  /** groupByDay 的产物：[{ day, items }] */
  groups: { type: Array, default: function () { return [] } },
  /** 分类表 */
  categories: { type: Array, default: function () { return [] } },
  /** { incomeCents, expenseCents } */
  summary: { type: Object, default: function () { return {} } },
  /** 预算提示文案与超支标记 */
  budgetLine: { type: String, default: '' },
  budgetOver: { type: Boolean, default: false },
  /** 分段控件 */
  seg: { type: String, default: 'all' },
  segs: { type: Array, default: function () { return [] } },
  /** 搜索 */
  kw: { type: String, default: '' },
  searching: { type: Boolean, default: false },
  /** 已生效的筛选条件数（0 表示未筛选） */
  filterCount: { type: Number, default: 0 },
  /** 父级提供的解析器：保证分组/查表只有一份实现 */
  catOf: { type: Function, default: function () { return { name: '其他', icon: '📦' } } },
  tagsOf: { type: Function, default: function () { return [] } },
  indexOf: { type: Function, default: function () { return -1 } },
  dayLabel: { type: Function, default: function (d) { return String(d) } },
  dayExpense: { type: Function, default: function () { return 0 } }
})

const emit = defineEmits([
  'shift-month',
  'seg',
  'kw-change',
  'clear-search',
  'filter',
  'add',
  'edit',
  'seed'
])

const incomeText = computed(function () {
  return formatCents(props.summary.incomeCents || 0)
})

const expenseText = computed(function () {
  return formatCents(props.summary.expenseCents || 0)
})

function onKwInput(e) {
  const v = e && e.detail && typeof e.detail.value === 'string' ? e.detail.value : ''
  emit('kw-change', v)
}

/* 主题/布局的开关类不在这里管 ——
 * 它们挂在 documentElement 上（要覆盖不在本组件内的 tab 栏与弹层），
 * 必须跟着**页面可见性**开关，否则跳到别的页面会留下深色宽画布。
 * 所以由 home.vue 的 onShow / onHide / watch(deskMode) 统一负责。 */
</script>

<style scoped>
/* 只是本组件的少量补充；主体样式在 src/styles/desk-layout.css（全局、按 html.cd-desk 生效）。
   放全局是因为要用 html 前缀压过 h5-shell.css 的 520px 画布 —— scoped 样式做不到跨层级命中。 */

.desk-search-clear {
  flex: none;
  font-size: 15px;
  font-weight: 800;
  color: var(--cd-ink-2);
  padding: 0 2px;
  cursor: pointer;
}

.desk-filter {
  flex: none;
  display: flex;
  align-items: center;
  gap: 4px;
  height: 38px;
  padding: 0 14px;
  border-radius: var(--cd-r-pill);
  background: var(--cd-surface-2);
  border: 1px solid var(--cd-line-soft);
  cursor: pointer;
  box-sizing: border-box;
}

.desk-filter-t {
  font-size: 13px;
  font-weight: 700;
  color: var(--cd-ink-2);
}

.desk-filter-n {
  font-size: 10px;
  font-weight: 800;
  color: var(--cd-btn-ink);
  background: var(--cd-primary);
  border-radius: 999px;
  padding: 1px 5px;
}

/* 日期分组头 */
.desk-day {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 2px 6px;
  border-bottom: 1px solid var(--cd-line-soft);
  margin-bottom: 6px;
}

.desk-day-date {
  font-size: 12px;
  font-weight: 800;
  color: var(--cd-ink);
  white-space: nowrap;
}

.desk-day-sum {
  font-size: 11px;
  font-weight: 700;
  color: var(--cd-ink-2);
  white-space: nowrap;
}

/* 输入框占位符（深色下默认灰偏暗，提一档） */
.desk-ph {
  color: var(--cd-ink-2);
}
</style>
