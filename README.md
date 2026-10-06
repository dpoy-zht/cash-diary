# 奶蛙记账 · naiwa-ledger

> 一只黄色小胖龙，盯着你花钱。

一个离线优先的个人记账 App。数据只存在你手机里，不上云、不联网、不分析你的消费习惯——因为根本没有服务器，想分析也分析不了。

> 奶蛙（那谁）温馨提示：记账不能让你变富，但能让你清楚地知道自己是**怎么穷的**。

> **📌 版本声明**：本项目已功能定版，不再新增功能，此后仅做数据修复与兼容性维护。
>
> - **v2.2.8（当前最新）**：新增自制 meme 形象素材包（与原图并存可切换）+ 账本/报告空态插画；检查更新超时放宽到 30s
> - v2.2.7：修正重复等号与未完成算式的显示问题 + 首页日期显示到日 + 计算器式金额输入
> - v2.2.6：计算器式金额输入 + 首页日期显示到日
> - v2.2.3：标签维度（多标签筛选 + 报告标签分布）
> - v2.2.4：定版清理（移除皮肤空占位入口）
>
> 决策依据见 [`docs/batch5-design.md`](./docs/batch5-design.md) §8；未做事项（深色模式 / 桌面小组件 / 小票图片附件 / 资产账户转账）为**有意不做**，非遗漏。
>
> ⚠️ 版权提示：App 内含两套形象素材 —— 原图为网络流传的奶蛙角色（**仅限个人自用**），新增一套为自制 meme（同人创作）。公开分发或上架前请自行评估授权风险。

## 📥 下载安装（不想碰代码的走这边）

前往 [**Releases 页面**](https://github.com/dpoy-zht/naiwa-ledger/releases/latest) 下载最新版安装包：

1. 下载 Assets 里的 `nailong-ledger-vX.X.X.apk`（仅支持 **Android**，iOS 用户此路不通）
2. 手机上直接安装；首次需允许「安装未知来源应用」
3. 小米 / HyperOS：安装外部包需登录小米账号，遇「风险应用」提示选继续
4. 首次打开请允许通知权限（超支提醒靠它）

升级同样去 Releases 下最新包覆盖安装即可，**账目数据都在**（卸载重装才会清空，动手前记得先在「我的页」导出备份）。

> **给家人的建议**：直接微信/QQ 传这个 apk 文件即可，不用进 GitHub。App 内「我的 → 检查更新」也支持热更（wgt 免安装升级），但受网络环境影响较大，**以手动覆盖安装最稳妥**。

## ✨ 功能亮点

- **🚀 3 秒记一笔**：四列记账键盘 + 「记好啦」大按键，比外卖小哥摁门铃还快
- **🧮 计算器式金额输入**：能连续运算，不用反复清空重输
- **📊 日 / 周 / 月 / 年统计**：环形图中心有一只奶蛙深情凝视你的钱包，想假装没花钱都不行
- **📈 近 6 个月趋势柱状图**：每月花销一目了然，哪个月手最欠，柱子最高那根会替你尴尬
- **🔍 流水搜索**：搜「奶茶」，本月喝掉的每一杯都会被拉出来公开处刑
- **🏷 标签维度**：一笔钱可挂多个标签，报告里能看到各标签占比（支持重叠提示）
- **🧾 多账本**：默认账本管生活，「小金库」管私房钱（合法合规的那种）
- **🎯 预算 + 超支弹窗**：花超了奶蛙会露出 Sad 脸看着你，比我妈的眼神还有杀伤力
- **🔔 超支系统通知**：App 在后台也不放过你，通知栏直接补刀（可关，关了就是自欺欺人模式）
- **🔁 固定支出**：每月固定几笔交给奶蛙，到期自动记账提醒
- **🩺 体检页**：孤儿记录、异常金额、备份新鲜度，一次看完数据有多健康
- **🔥 连续记账天数 & 等级**：从「记账萌新」一路升到「奶蛙首富」，断签一天重新做人
- **💾 备份 / 恢复**：JSON 文件导出（格式 v3，兼容读 v1/v2），卸载重装不丢账；恢复前整包校验，坏文件一个字节都进不了库
- **🌙 完全离线**：地铁里、深山里、飞行模式里都能记，没网是你的优势而不是它的缺陷
- **🎨 两套形象素材包**：原图与自制 meme 并存可切换，随时换心情

## 🚀 快速开始

```bash
# 1. 拉代码
git clone https://github.com/dpoy-zht/naiwa-ledger.git
cd naiwa-ledger

# 2. 装依赖（Node 18+；仓库内 .npmrc 已指向 npmmirror 镜像，装不动再研究）
npm install

# 3. 跑测试（先看奶蛙的脸色）
npm test

# 4. 浏览器里跑起来（内存存储，自带空白数据）
npm run dev:h5
```

可用脚本一览：

| 命令 | 作用 |
|---|---|
| `npm run dev:h5` | H5 开发服务器（内存存储） |
| `npm run dev:app` | App 端开发构建 |
| `npm run build:h5` | H5 生产构建 |
| `npm run build:app` | App 生产构建（产物 `dist/build/app`，云打包的输入） |
| `npm test` | 跑全部单元测试（717 条） |
| `npm run lint` | ESLint 检查 |

想在手机上跑 / 打出 APK：

1. 用 **HBuilderX** 打开项目根目录
2. 手机插 USB → 「运行 → 运行到手机或模拟器」（`plus.sqlite` 只在 App 端有，H5 是内存假数据）
3. 出正式包：「发行 → 原生 App-云打包」，或者玩命令行：

```bash
# HBuilderX CLI 云打包（配置文件里填你自己的证书信息）
E:/HBuilderX/cli.exe pack --config dist/pack-config.json
```

## 📦 发版流程（含热更包）

改完代码后按这个顺序走，**顺序错了会白打一轮 5 分钟的云打包**：

```bash
# 1. 升版本号：src/manifest.json 里的 versionName / versionCode

# 2. 构建 + 全量测试（改完代码再打，下面两步的产物才会含新代码）
npm test
npm run build:app

# 3. 打热更包 wgt（以上一版 wgt 为结构模板）
python dist/dev/gen-wgt.py dist/release/nailong-ledger-v2.2.8.wgt \
       dist/build/app dist/release/nailong-ledger-v2.2.9.wgt

# 4. 云打包出 APK（见上一节命令），然后归档：
cp dist/release/apk/__UNI__F1ADD03__<时间戳>.apk dist/release/nailong-ledger-v2.2.9.apk

# 5. 校验 + 上传 Release + 写入 wgt-sha256 / apk-sha256
python dist/dev/publish-release.py v2.2.9 --apply

# 6. 提交
git add -A && git commit && git push
```

> ⚠️ Release 说明里的 `wgt-sha256: <64位hex>` 是**发版硬约定**：写成 `wgt SHA-256：` 会导致 App 端热更时静默跳过完整性校验。`publish-release.py` 已自动处理。

## 🗂 项目结构速览

```
src/
├── pages/        # 11 页：home / add / stats / ledger / me（五页主 IA，互为 reLaunch）
│                 #       + report / health / budget / category / tag / fixed（二级页）
├── components/   # asset-slot（内容图插槽）、mascot-deco（装饰/联动插画）、
│                 # cat-icon、tab-bar、tx-item、filter-sheet 等
├── stores/       # Pinia：流水、分类、账本、预算（账本过滤在这统一注入）
├── services/     # 业务规则：金额校验、备份打包、搜索、更新检查、WebDAV 同步
├── db/           # sqlite.js + memory.js 双适配器（27 个方法签名严格一致）
├── utils/        # 纯函数：金额、日期、统计分桶、预算判断、通知、素材包、素材登记表
└── static/
    ├── milo/     # 原图形象素材 9 张（勿动，有 blob 校验）
    └── meme/     # 自制 meme 素材 9 张（新增，抠透明）
tests/            # vitest 34 个文件 / 717 条用例
docs/             # PRD、技术方案、素材清单、批次设计、UI 规范
demo/             # 设计基准原型 nailong-ledger.html（改 UI 前先看它）
dist/dev/         # 发版与维护脚本（gen-wgt / publish-release 等）
```

更多设计细节：[`docs/PRD.md`](./docs/PRD.md)（产品设计）、[`docs/技术方案.md`](./docs/技术方案.md)（架构与数据层）、[`docs/asset-checklist.md`](./docs/asset-checklist.md)（素材清单）、[`AGENTS.md`](./AGENTS.md)（协作规范：改动必 commit + 测试全绿）。

## 🎨 形象素材：两套包共存

项目里 `src/utils/asset-packs.js` 用一个常量控制用哪套素材，**页面与组件不需要改动**：

| 包 | 目录 | 状态 | 底色特征 |
|---|---|---|---|
| `milo` | `src/static/milo/` | **默认启用** | 7 张自带场景底、2 张抠透明 |
| `meme` | `src/static/meme/` | 备用 | 9 张全部抠透明，贴任意背景无白边 |

改 `ACTIVE_PACK` 一个常量即全站切换，详见该文件头部注释。`npm test` 里有 18 条断言守护「原图零改动」，误改会直接让测试变红。

## 📐 几条认真的设计铁律（奶蛙严肃脸）

1. **金额一律整数分存储**，浮点数禁止入场——`0.1 + 0.2 !== 0.3` 的教训，记账 App 不配拥有
2. **时间存毫秒时间戳**，统计按**手机本地日历月**分桶，月初 0 点的账不许跑到隔壁月
3. **删除一律软删除**（`deleted_at`），为将来云同步留后路，备份文件也要保留这个字段
4. **页面传输入字段名，数据库用 snake_case**，映射只走 `services/tx.js: buildAddInput()`——当年真机上「记好啦」点了没反应，就是字段名传串了
5. **金额与日期格式化禁用 `Intl` / `toLocaleString(locale, options)`**——App 端 app-service 引擎没有 `Intl`，`(1800).toLocaleString('zh-CN', {minimumFractionDigits: 2})` 会返回 `'1800'`。千分位走 `utils/money.js: groupThousands()`。H5 有完整 ICU，**浏览器截图永远掩盖此 bug，只能真机暴露**
6. **动态 SQL 只允许一处**：动态 WHERE 经 `db/tx-search-sql.js` 纯函数产出，动态值必须过 `sqlValue()`（`plus.sqlite` 无参数绑定）

## 📄 开源协议

[MIT](./LICENSE) —— 随便用、随便改、随便魔改，记得别删原作者署名。

## ⚠️ 版权声明（这条一点都不好笑）

「奶蛙」是**第七印象文化传媒（深圳）有限公司**的商业 IP。本项目中的原图形象素材**仅限个人学习使用**，请勿商用、请勿上架应用商店、请勿做成手机壳钥匙扣发大财。真想商业化，先去找第七印象谈授权（谈成了记得请作者喝奶茶）。

`src/static/meme/` 下的一套为自制同人素材，作者自有版权。

## 🙏 鸣谢

- 第七印象：奶蛙本龙
- DCloud：uni-app 与 HBuilderX，让一个人也能全端出货
- 我的钱包：为这个项目的数据采集做出了不可磨灭的贡献
