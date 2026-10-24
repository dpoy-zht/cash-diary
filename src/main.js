import { createSSRApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'

/**
 * 网页版专属样式（桌面画布 / 鼠标反馈 / 焦点环）。
 * 用条件编译引入，`uni build -p app` 时整段会被剔除，
 * App 端产物里不会有这份 CSS —— 原 App 不受任何影响。
 */
// #ifdef H5
import './styles/h5-shell.css'
// #endif

export function createApp() {
  const app = createSSRApp(App)
  app.use(createPinia())
  return { app }
}
