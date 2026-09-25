# 现金日记 · cash-diary

> 3 秒记一笔的个人记账 App。离线优先，数据存本机。

目前处于 **MVP（阶段 1）**：快速记账 / 内置分类 / 流水列表 / 编辑删除 / 本地持久化。

## 技术栈

| 层次 | 选型 |
|---|---|
| 跨端框架 | uni-app（Vue3 + Vite），一套代码出 Android APK，预留微信小程序 |
| 开发工具 | HBuilderX（真机运行 / 云打包） |
| 状态管理 | Pinia |
| 本地存储 | SQLite（`plus.sqlite`，App 端）/ 内存演示存储（H5 与单元测试） |
| 单元测试 | vitest |

## 文档索引

| 文档 | 说明 |
|---|---|
| [`AGENTS.md`](./AGENTS.md) | 协作规范（每次改动必须 commit + 测试通过后交付） |
| [`PLAN.md`](./PLAN.md) | 开发起步方案与 5 阶段路线图 |
| [`docs/PRD.md`](./docs/PRD.md) | 产品设计文档（MVP 范围已冻结） |
| [`docs/技术方案.md`](./docs/技术方案.md) | 技术方案（架构 / 数据层 / 测试 / 风险） |
| [`demo/index.html`](./demo/index.html) | HTML 可交互原型（界面与交互以此为准） |

## 快速开始

```bash
# 1. 安装依赖（Node ≥ 18）
npm install

# 2. 跑单元测试
npm run test

# 3. 方式一：浏览器预览（走内存演示存储，快速验证界面）
npm run dev:h5

# 4. 方式二：真机运行（推荐，走真正的 SQLite）
#    用 HBuilderX 导入本目录 → 运行 → 运行到手机或模拟器
```

依赖安装缓慢时可保留仓库内 `.npmrc`（npmmirror 镜像）；若要改用官方源，删除该文件即可。

## 目录结构

```
├─ src/                uni-app 源码根（CLI 约定）
│  ├─ pages/           页面：quick-add（记一笔）/ transactions（明细）/ me（我的）
│  ├─ components/      公共组件：money-keyboard / category-grid / tx-item / edit-sheet
│  ├─ stores/          Pinia：category / tx / meta
│  ├─ services/        业务层：记账校验与编排、分类种子
│  ├─ db/              数据层：schema + sqlite/memory 双存储 + repository
│  ├─ utils/           money（分↔元换算）/ date（时间戳与分组）
│  ├─ App.vue          应用入口（启动初始化数据库与分类）
│  └─ pages.json / manifest.json
├─ tests/              vitest 单元与集成测试
├─ demo/               HTML 交互原型（UX 基准）
└─ docs/               产品与技术文档
```

> 采用 uni-app **CLI 工程结构**（源码在 `src/`）：`npm run dev:h5` / `npm run build:h5` / `npm run test` 是自动化验证通路；该结构同样可被 HBuilderX 打开并运行到手机。

## 三条数据铁律

1. **金额一律整数「分」存储**（1990 = ¥19.90），禁止浮点数参与存储与计算
2. **时间一律毫秒时间戳**，展示时才按本地时区格式化
3. **删除一律软删除**（`deleted_at`），为后续同步留后路

## 开发约定

- 任何改动都要有对应的 Git commit（见 `AGENTS.md`）
- 任何改动都要更新测试，且 `npm run test` 全绿后才能交付
- 架构级变更先改 `docs/技术方案.md`，再动代码
