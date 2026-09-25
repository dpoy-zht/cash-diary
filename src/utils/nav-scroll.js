import { onPageScroll } from '@dcloudio/uni-app'
import { useUiStore } from '../stores/ui.js'

/**
 * 接入"滚动时测帧率"的采样。
 *
 * 为什么必须挂在真实滚动上：毛玻璃的开销来自每帧的backdrop回读合成，
 * 页面静止时几乎不花钱。在 onMounted 里测只会得到一个漂亮的假数据，
 * 于是低端机上永远退不回纯色档。
 *
 * 页面用法（在 <script setup> 里一行）：
 *   import { useNavScrollWatch } from '../../utils/nav-scroll.js'
 *   useNavScrollWatch()
 *
 * 不滚动的页面（内容不足一屏）不必调用：没有滚动开销，也就无需降级。
 */
export function useNavScrollWatch() {
  const uiStore = useUiStore()
  onPageScroll(function () {
    uiStore.sampleOnScroll()
  })
}
