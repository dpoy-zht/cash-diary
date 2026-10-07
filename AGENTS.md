# AGENTS.md · 奶蛙记账协作规范

> 本文件是 AI 与人类协作者的**硬约定**。改代码前先读完，交付前逐条自查。

## 基础纪律（不可协商）

1. **每次改动完成后必须创建 Git commit**，提交信息清晰描述本次改动内容与动机。
2. **每次改动后必须编写或更新相关测试**，交付给用户前确保所有测试与验证全部通过。
3. **scope 变更需先审批**：新增功能、改数据契约、改技术栈前，先说明方案并等确认。

## 提交粒度

- 一个批次 = 一个 task ID = 一组相关改动 = 一个 commit
- 提交信息写清「改了什么」+「为什么」+「怎么验证的」
- 批次之间等用户确认，不要一口气连推多个 commit

## 项目特有铁律

### 数据层（三条，不可违背）
- **金额一律整数分存储**，禁止浮点数
- **时间存毫秒时间戳**，统计按**手机本地日历月**分桶
- **删除一律软删除**（`deleted_at`），备份文件也必须保留该字段
- 新增表必须同时改三处：`db/schema.js` 的 MIGRATIONS、两个适配器的表清单（`sqlite.js TABLE_COLS` / `memory.js TABLES`）、两侧 `clearAll`
- 存储适配层两实现方法签名必须严格一致，改一处必须同步另一处

### 分类体系（两级，2026-10-07 起）
- **唯一事实源 = `services/category.js: EXPENSE_TREE`**，种子（新装机）与迁移（老库）共用一份定义，防止两条路径产出不同分类
- `category.parent_id`：`NULL` = 一级，非 `NULL` = 所属一级 id，**最多两级**
- **老库迁移 `migrateCategoryTree()` 必须幂等**：判据是「库里还存在名字属于老叶子集合的平铺支出分类」，跑完自然为假，**不另存迁移标记**
- 老分类改名走「**别名改名**」而不是新插一条（如 住房 → 居住），否则历史流水会变孤儿
- 一级预算必须按**子树**汇总（`utils/budget.js: spentBySubtree`），否则给一级设预算形同虚设
- 统计圆环**按一级画**（49 个分类直接画会碎成一堆扇形），点一级再下钻看二级
- ⚠️ `plus.sqlite` 的 insert **拿不到 `lastInsertRowid`** → 插完一级要**重新查库**取 id 再挂二级

### App 端特有坑
- **禁用 `Intl` / `toLocaleString(locale, options)`**：App 端 app-service 引擎无 `Intl`，`(1800).toLocaleString('zh-CN',{minimumFractionDigits:2})` 返回 `'1800'`。千分位走 `utils/money.js: groupThousands()`，日期走 `utils/date.js`。**H5 有完整 ICU，浏览器截图永远掩盖此 bug，只能真机暴露**
- **动态 SQL 只允许一处**：`db/tx-search-sql.js` 纯函数产出，动态值必须过 `sqlValue()`（`plus.sqlite` 无参数绑定）

### 素材体系
- **原图 `src/static/milo/` 一个字节都不能改**，`tests/asset-packs.test.js` 有 18 条断言守护（含 blob 哈希比对）
- 新增素材走**独立包目录 + `meme-` 前缀**，不动原图；切换只改 `asset-packs.js` 的 `ACTIVE_PACK`
- **占位框绝不挂页面的 `img-class`**：空间规格只认 `asset-slots.js` 登记表，页面类只保留 margin/flex/position
- 改 `.vue` 批量正则前**必须先切段**（template/script/style/tail），只在 style 段操作，否则 CSS 会插进 `<script>` 炸编译
- **`<text>` 放进横向 flex 容器必须显式 `display:block`** —— 从 `column` 改 `row` 后会失去隐式块级，标题与副标题挤同一行

## 发版流程（顺序错了白打一轮 5 分钟云打包）

```bash
# 1. 升 src/manifest.json 的 versionName / versionCode
# 2. 改完代码后：
npm test && npm run build:app
# 3. 打 wgt（以上一版 wgt 为结构模板）
python dist/dev/gen-wgt.py dist/release/nailong-ledger-v<旧>.wgt dist/build/app dist/release/nailong-ledger-v<新>.wgt
# 4. HBuilderX 云打包（需 HBuilderX 已启动 + DCloud 登录态有效）
E:/HBuilderX/cli.exe pack --config dist/pack-config.json
cp dist/release/apk/__UNI__F1ADD03__<时间戳>.apk dist/release/nailong-ledger-v<新>.apk
# 5. 校验 + 上传 + 写双 sha256
python dist/dev/publish-release.py v<新> --apply
# 6. git commit + push
```

- **Release 说明必须含 `wgt-sha256: <64位hex>` 行**（正则 `/wgt[-_]sha256[:：=\s]+([0-9a-fA-F]{64})/`）。写成 `wgt SHA-256：` 会让校验被静默跳过 —— v2.2.0/2.2.1 踩过
- **重发同一 tag 必须先删线上资产**（GitHub 不允许同名共存，直接 POST 返 422）；`publish-release.py` 已自动处理
- **正式包覆盖安装后调试基座失效**（外置 www 热替换通道消失），需重装 `dist/debug/android_debug.apk`

## 真机验证限制（HyperOS / 小米 14 Pro 实测）

- **`input tap` 被 `INJECT_EVENTS` 拒绝** → 无法自动点击
- **改 `pages.json` 首位无效**：调试基座读的是已缓存的 `app-config-service.js`，启动页不在里面
- **H5 探针拿不到 shadow DOM 内的元素** → 验不了 shadow DOM 内部结构，只能真机或离屏渲染
- 结论：真机多页验证需**用户手动点**，AI 侧连拍 `screencap`；首页可独立验证

## 文档维护

- `docs/asset-checklist.md` **由代码生成**，改登记表后必须跑 `python scripts/gen-asset-checklist.py`，测试会断言文档与代码一致
- 素材清单、handoff 等历史文档**保留原貌**（不要回改历史），只在头部加「已过时 + 指向现行文档」的标注
- 版本号三处同步：`src/manifest.json`（真源）、`package.json`、README 版本声明
