import { defineConfig } from 'vitest/config'

// 独立于 uni 构建链路的测试配置：只跑纯 JS 层的单元测试（utils / services / repository+内存存储）
// pool=forks + singleFork：单进程串行执行，规避多 worker 并行时写 SSR 缓存被宿主环境拦截的问题
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true }
    },
    fileParallelism: false
  }
})
