# 批次 5 设计文档（范围已调整）

> 项目：奶龙记账 / cash-diary ｜ 版本基线：v2.2.2（2026-10-01 已发布）
> 本文档是批次 5 的开发依据。**约定：先出设计文档再开发**（见 `.workbuddy/memory` 中四处记录）。

---

## 0. 范围

| 编号 | 任务 | 本次是否实现 | 说明 |
|---|---|---|---|
| T5.1 | 标签维度 | ✅ 实现 | 给流水打自定义标签，可按标签筛选与汇总 |
| T5.2 | 资产账户与转账 | ❌ **不做** | **用户明确指示排除**，本次不设计、不实现、不预留半成品接口 |
| T5.3 | 桌面小组件 | ⚠️ **待决策** | 纯 uni-app 无法实现（见 §3），需用户在三条件路径中选择 |
| T5.4 | 小票图片附件 | ✅ 实现 | 给流水挂收据照片，含备份取舍（见 §2.4） |

**排除 T5.2 的连带清理**：不做「账户余额」「账户间转账」「资产净值」相关表、字段、UI、文案。
`account` 表保持现状（仅作为多账本容器），不在此次范围内扩展为"资产账户"。

---

## 1. 现状与扩展点（实现前必须对齐的四处）

| 扩展点 | 位置 | 本次要做的改动 |
|---|---|---|
| 表结构版本化 | `src/db/schema.js` 的 `MIGRATIONS`（现到 v5） | 追加 v6（标签）、v7（图片附件），**不修改已发布版本** |
| 表清单 | `src/db/sqlite.js` 与 `src/db/memory.js` 的 `TABLE_COLS` | 新表必须**两边同步**加入，`dumpAll/restoreAll` 才能带上；适配器方法数保持两边一致 |
| 备份格式 | `src/utils/backup.js` 的 `BACKUP_VERSION`(现 2) / `buildBackup` / `validateBackup` | 升 v3，新增表字段；**v1/v2 老备份必须仍能恢复** |
| 查询拼装 | `src/db/tx-search-sql.js`（唯一 SQL 拼装点） | 标签筛选条件加在这里，动态值仍走 `sqlValue()` |

三条数据铁律继续适用：**金额整数分 / 时间毫秒戳按本地时区分桶 / 软删除 `deleted_at`**。

---

## 2. T5.1 标签维度

### 2.1 目标
给一笔流水挂 0..N 个用户自定义标签（如「报销」「出差」「给妈妈」），
支持按标签筛选流水、在月度报告里看标签占比。**与分类互补**：分类回答"这是什么开销"，标签回答"为什么/为谁花"。

### 2.2 数据模型（迁移 v6）

```sql
CREATE TABLE IF NOT EXISTS tag (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL DEFAULT 1,
  name       TEXT    NOT NULL,
  color      TEXT    NOT NULL DEFAULT '',   -- 8 色令牌里的 key，空=按序兜底
  sort       INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS transaction_tag (
  transaction_id INTEGER NOT NULL,
  tag_id         INTEGER NOT NULL,
  PRIMARY KEY (transaction_id, tag_id)
);
CREATE INDEX IF NOT EXISTS idx_tag_account ON tag(account_id);
CREATE INDEX IF NOT EXISTS idx_tx_tag_tag ON transaction_tag(tag_id);
```

**设计取舍**
- **标签不软删除**，与被删保护配套：`tag` 沿用 `category` 的做法（硬删），
  但**被任何流水引用过的标签不许删**（与"有流水的分类不许删"同一条规则，避免脏引用）。
- **不做 `deleted_at`**：junction 表随流水软删除一起忽略，恢复备份时按原样写回。
- **name 唯一性**由 `services/tag.js` "先查再插"保证（同 `budget` 的做法，不用数据库 UNIQUE）。
- 标签有上限（默认 30 个/账本），防止 chip 区被挤爆。

### 2.3 分层落点
| 层 | 文件 | 内容 |
|---|---|---|
| 仓储 | `src/db/repository/tag.js`（新增）+ 两适配器新增方法 | `tagList/tagInsert/tagUpdate/tagDelete/txTagSetForTx/txTagIdsByTx/txIdsByTags/tagRefCount` |
| 业务 | `src/services/tag.js` | 名称归一化（去空白、限长 12、同名拒绝）、增删改、给流水设置标签集合、查询某批流水的标签 |
| 状态 | `src/stores/tag.js`（新增） | 当前账本的标签列表 + 缓存失效（复用 `meta.bumpData` 机制） |
| 纯函数 | `src/utils/tag.js`（新增） | `normalizeTagName` / `parseTagInput`（逗号/空格分隔一次建多个）/ `pickTagColor` |
| SQL | `src/db/tx-search-sql.js` | 新增 `tagIds` 条件 → `EXISTS (SELECT 1 FROM transaction_tag tt WHERE tt.transaction_id = t.id AND tt.tag_id IN (...))` |

### 2.4 UI 落点
- **记一笔页**：金额键盘下方一排标签 chips（可多选，可直接"+ 新建"）
- **流水编辑弹层**：同样一排 chips，可改
- **流水列表项**：标签以小圆点/chip 显示在备注行（超过 2 个折叠为 `+N`）
- **筛选面板**：新增「标签（可多选）」一行
- **月度报告**：新增「按标签 TOP5」区块（无标签时不显示该区块，避免空区块）
- **我的 → 标签管理**：改名 / 换色 / 排序 / 删除（被引用时禁用并提示）

### 2.5 备份
`buildBackup` 输出新增 `tag`、`transaction_tag`；`BACKUP_VERSION` → 3。
`validateBackup`：v1/v2 缺这两张表 → 按空数组处理（老备份照常恢复）；
v3 起缺任一 → 判为不完整。CSV 导出增加 `tags` 列（`|` 连接）。

### 2.6 验收
- 迁移：已有库从 v5 升到 v6 后，原数据零丢失、可正常记账
- 打标签 → 列表显示 → 按标签筛出正确的条数 → 月度报告标签占比正确
- 删除被引用的标签被拒；解除全部引用后可删
- 备份 v3 导出 → 恢复 → 标签与关联完整；**v2 老备份仍能恢复**
- 全量测试绿；两适配器方法签名一致

---

## 3. T5.3 桌面小组件 —— 可行性结论（本次的硬约束）

### 3.1 结论：**在当前技术栈内无法实现**
已核实的两条依据：
1. **DCloud 官方答复**：uni-app（含 UTS）**无法直接生成桌面小组件（App Widget）**——
   它属于系统级原生能力，必须依赖原生代码；UTS 无法把页面暴露成小组件入口。
2. **本项目现状**：没有 `uni_modules`，没有 `nativeplugins`，
   `manifest.json` 的 `app-plus.modules` 只有 `Push` 与 `SQLite`、`distribute.plugins` 为空。
   → 现在**没有任何原生扩展通道**可用。

技术上不可回避的三件事（无论走哪条路）：
- 需要 `AndroidManifest.xml` 注册 `AppWidgetProvider` + 一套 `RemoteViews` 原生 XML 布局
  （**小组件 UI 不是 Vue 页面**，uni-app 的样式体系完全用不上）；
- 小组件与 App **不同进程**，读不到 App 私有目录里的 `plus.sqlite` 数据库
  → 必须额外做**数据桥接**：App 侧在数据变化时把「本月已花/剩余预算」写成一个 JSON 快照到共享位置，小组件读它；
  这就意味着一个额外的**一致性面**（快照过期、写失败、跨设备时区）。
- 调试必须走**自定义调试基座**，每次改原生代码都要重新打基座（社区实测每次约 3 分钟量级）。

### 3.2 三条可选路径（需要你选）

| 路径 | 做法 | 代价 | 风险 |
|---|---|---|---|
| **A. 用插件市场的现成插件** | 引入「桌面小组件」类 Android 原生插件（市场有，仅 Android） | 需购买/引入插件；仍要自定义基座 + 云打包 | 插件质量与后续维护不可控；功能通常是「图标 + 静态/简单数据」，未必满足"显示本月花费" |
| **B. 自己写 UTS 原生插件** | 在项目内建 `uni_modules/<插件>/utssdk/app-android/`，用 Kotlin 写 `AppWidgetProvider` + RemoteViews + 数据桥接 | 需要 Android 原生开发能力；每轮调试重打基座；云打包需带上插件 | 工作量最大，但完全可控、能和本项目的数据结构精确对齐 |
| **C. 离线打包 + Android Studio 原生工程** | 脱离云打包，用原生工程集成 uni-app 资源 | 需要维护两套构建；现有云打包/热更链路要改 | 与当前「wgt 热更 + GitHub Releases」分发方式冲突，回退成本高 |

**我的建议：本次先不做 T5.3。** 理由：它是唯一会**改变构建与分发链路**的任务
（自定义基座 + 云打包带插件 + 热更可能失效），而收益（桌面看一眼本月花费）远小于代价。
若确实想要，推荐走 **B**，并且**单独作为一批**来做（先做一个只显示「本月已花金额」的最小小组件打通链路，再谈交互）。

> 如果你希望我做，请明确选 A / B / C；选 B 的话我会先出**插件级设计文档**（含数据桥接协议）再动手。

---

## 4. T5.4 小票图片附件

### 4.1 目标
给一笔流水挂 1..3 张收据/小票照片，详情页可查看、可删除。

### 4.2 数据模型（迁移 v7）

```sql
CREATE TABLE IF NOT EXISTS receipt (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_id INTEGER NOT NULL,
  file_name      TEXT    NOT NULL,   -- 相对 _doc/receipts/ 的文件名，不存绝对路径
  bytes          INTEGER NOT NULL DEFAULT 0,
  width          INTEGER NOT NULL DEFAULT 0,
  height         INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL,
  deleted_at     INTEGER              -- 软删除：备份要带上，否则恢复后图片记录"复活"
);
CREATE INDEX IF NOT EXISTS idx_receipt_tx ON receipt(transaction_id);
```

### 4.3 存储与平台差异
- **App 端**：图片存 `_doc/receipts/`（私有目录，卸载即清）；拍照/相册用 `uni.chooseImage`，
  用 `uni.compressImage` 压到长边 ≤1600px、目标 ≤300KB；数据库只存**文件名**，不存绝对路径
  （绝对路径在换机/系统升级后会变，存路径必然后续"图片找不到"）。
- **H5 端**：无持久文件系统 → 功能隐藏（与通知/WebDAV 同样的降级策略），并在界面说明。
- **权限**：Android 相机 `CAMERA`；Android 13+ 相册 `READ_MEDIA_IMAGES`。
  `manifest.json` 增加声明；权限被拒时给可操作提示（复用 T4.1 的 `explainNotifyDenied` 同款思路）。

### 4.4 备份的取舍（**需要你确认的产品决策**）
图片二进制**不能塞进 JSON 备份**（几张照片就能让备份从几 KB 变成几 MB，且 base64 会膨胀 33%）。

| 方案 | 做法 | 结果 |
|---|---|---|
| **① 只备份元数据（推荐 v1）** | 备份仍存 `receipt` 行，但不含图片文件 | 恢复后**图片会丢**，记录行变成"图片已失效"占位；界面必须**明确写清楚**，不能让用户以为照片备好了 |
| ② 备份打包成 zip（含图片） | 备份改为 `.zip`（JSON + receipts/） | 图片跟着走，但**破坏现有 JSON 备份的兼容性与恢复链路**，工作量与风险显著上升 |

**建议 v1 走 ①**，并在：数据体检新增一类「有附件但附件未随备份走」提示；
恢复后把找不到文件的 `receipt` 行标记为失效（不崩溃、不静默）。

### 4.5 其他
- 删除流水 → 其图片一并软删除，并在「我的 → 存储空间」里可一键清理孤儿图片文件
- 列表页显示 📎 角标（有附件才显示），详情页可全屏预览（`uni.previewImage`）
- 「我的 → 存储空间」显示 receipts 目录占用，可清理

### 4.6 验收
- 拍照/选图 → 压缩 → 入库 → 详情页可看 → 删除后文件被清理
- 备份 v3 导出（不含图片）→ 恢复 → 图片标记失效但**不崩溃**、不丢其它数据
- 图片文件缺失（手动删掉）时页面降级为占位，不白屏
- 权限被拒时的提示可操作

---

## 5. 建议的交付顺序

1. **T5.1 标签维度**（纯前端 + 数据层，风险最低，价值最高） → 一个批次，独立 commit
2. **T5.4 小票图片附件**（涉及权限与文件系统，需真机验证） → 一个批次
3. **T5.3 桌面小组件** → **等你决策后再启动**，若走 B 则先出插件级设计

每个子任务闭环：改代码 → 补测试 → 全量测试绿 → （App 端改动）真机验证 → 单独 commit。

---

## 6. 风险登记

| 风险 | 影响 | 对策 |
|---|---|---|
| 新表漏加进 `TABLE_COLS` | 备份/恢复静默丢表 | 加一条"两适配器表集合一致"的守门测试 |
| 备份版本升级破坏老备份 | 用户恢复不了历史备份 | 单测覆盖 v1/v2/v3 三档恢复 |
| 标签筛选 SQL 注入 | 安全 | 条件只在 `tx-search-sql.js` 生成，动态值走 `sqlValue()`，逐字断言 |
| 图片让库/备份膨胀 | 体验 | 压缩上限 + 张数上限 + 存储空间页 |
| 小组件改构建链路 | 热更/分发失效 | 本次不做；若做则单独成批 |
