<script setup>
import { onLaunch } from '@dcloudio/uni-app'
import { initDB } from './db/index.js'
import { useCategoryStore } from './stores/category.js'

onLaunch(() => {
  const categoryStore = useCategoryStore()
  initDB()
    .then(() => categoryStore.init())
    .catch((err) => console.error('[cash-diary] 初始化失败：', err))
})
</script>

<style>
page {
  background: #f6f7f9;
}
</style>
