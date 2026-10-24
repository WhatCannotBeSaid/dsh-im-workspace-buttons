# 工作区旁按钮 · Workspace Channel Buttons

在官方「工作区」表头行里，每个已接入的 [@xmanrui/dsh-im](https://www.npmjs.com/package/@xmanrui/dsh-im)
渠道放一枚 28×28 图标按钮。点一枚只说该渠道的会话；再点一次回到官方列表。

本包是从 `eva-inspired-theme` 里剥出来的单功能插件：只保留这组按钮，不带来皮肤、不做主题替换，
不依赖主题的 CSS、locale 命名空间或构建流程。

## 安装

```bash
# 1. 装包
npm install dsh-im-workspace-buttons --prefix ~/.dsh/profiles/desktop --registry=https://registry.npmjs.org

# 2. 把它加进 profile 的 bundle 列表（<profileDir> = ~/.dsh/profiles/desktop）
#    package.json 的 dsh.profile.bundles 里追加 "dsh-im-workspace-buttons"
```

装完**重启 DSH**。本包自带 `dsh.bundle.patch`，不需要手改 `cordis.patch.yml`；但 profile 的
`dsh.profile.bundles` 必须包含本包名，否则 loader 不会挂载它。

前置条件：[`@xmanrui/dsh-im`](https://www.npmjs.com/package/@xmanrui/dsh-im) 与至少一个已接账号的渠道，
否则按设计一枚按钮都不显示。

## 从主题版迁移

`eva-inspired-theme` 1.2.0 起不再包含这组按钮。两个包**不要同时装**：

- 主题版用的是 `data-eva-im-*` 契约与 `eva-im-filter` locale 命名空间，本包用 `data-dsh-im-*`
  与 `dsh-im-workspace-buttons`。同时装会在同一行出现两套按钮，且样式互不覆盖。
- 升级到 `eva-inspired-theme@1.2.0` 后装上本包即可无缝替换；交互、图标、顺序、可见性规则一致。

## 行为

| | |
|---|---|
| 插件 id | `dsh-im-workspace-buttons`（client 模块 id、locale 命名空间同名） |
| 出现在哪 | 官方 `sidebar.workspaces.directoryFlow` 标记所在的表头行，搜索槽左侧，按渠道表顺序 |
| 显示条件 | 对应渠道**已接入**才显示：`connection.status` 返回 `bots[]` 里有非空 `botId`，或旧版返回的 `configured: true`；探测不出结论（RPC 未就绪、请求失败）时隐藏首轮、保留上次结论 |
| 点击 | 只显示该渠道的会话行（按 `data-dsh-im-session-channel` 或行文本前缀认出）；再点一次回到官方列表 |
| 折叠分组 | 只有点击时才展开、翻页、滚动到该渠道的首个会话，且以 `CLICK_LIMIT = 200` 步为上限 |
| 标签 | 走 Client locale 服务；跟随 profile 语言切换，注册表缺失时回退中文 |
| 不受影响 | 官方分组、折叠状态、spy 计数、会话顺序；不重排、不隐藏官方按钮 |

## 样式契约

样式由 runtime 自己注入一份 `<style data-dsh-im-workspace-buttons-sheet>`，颜色全走 `--dsw-*` 令牌：

| 选择器 | 作用 |
|---|---|
| `[data-eva-im-button]` | 28×28、无边框、无背景、`--dsw-radius-sm` 圆角、`--dsw-alias-label-secondary` 前景 |
| `[data-eva-im-button]:hover` | 前景转 `--dsw-alias-label-primary` |
| `[data-eva-im-state='on']` | 已选中的那枚转 `--dsw-alias-brand-primary` |
| `[data-eva-im-tree] [data-row-key]:not([data-eva-im-row='on'])` | 非该渠道的会话行隐藏 |

选择器前缀沿用 `data-eva-im-*`（提取时逐字保留，未改名），改前缀会破坏与 `eva-inspired-theme` 的样式兼容性。
注意第三条规则：不能用「JS 不写属性」表达 off —— 必须显式写 `data-eva-im-row='on'`，否则一行都藏不住。

## 依赖

| 依赖 | 性质 |
|---|---|
| `@xmanrui/dsh-im` | **运行时必需**。渠道表与状态探测都读它的 `connection.status`；未安装则一枚按钮都不显示 |
| 宿主 client 服务 `sessions` / `workspaces` / `locale` / `connection` | 只通过 `ctx.get` 取，不 import 宿主包 |
| `eva-inspired-theme` | **不需要**。样式、locale 命名空间、构建都已内置 |

## 开发

```bash
node tools/build-client.mjs          # 用 src/runtime.js 重写 client.js 的 runtime 段
node tools/build-client.mjs --check  # 断言 client.js 与 src/runtime.js 一致
node --test --test-timeout=15000 test/*.test.mjs   # 14 条行为测试，假 DOM，不需要浏览器
node test/render.mjs                 # 真浏览器：隔离 profile + 本包 + dsh-im，截图与交互断言
```

`client.js` 里的 runtime 是**副本**不是 import：client 模块加载器按经典脚本求值 client.js，
文件里不能有模块图。`tools/build-client.mjs` 负责保持一致。

## 文件

| 文件 | 作用 |
|---|---|
| `index.js` | host 入口，ESM，`export apply(ctx)`；只打一行日志，无 service / route / Config |
| `client.js` | 浏览器入口，`window.__ModuleLoader__.load({ id, factory })`，内含 runtime 副本 |
| `src/runtime.js` | runtime 真源（`export function mountWorkspaceButtons(ctx)`） |
| `cordis.patch.yml` | `- insert: [{ id, name }]`，同时是浏览器 roster 的入口 |
| `locale/zh.json` · `locale/en.json` | `meta.title` / `meta.description` + 12 渠道文案 |
| `tools/build-client.mjs` | 把 `src/runtime.js` 内联进 `client.js`，`--check` 校验一致 |
| `test/fake-dom.mjs` · `test/behaviour.test.mjs` | 假 DOM 与 14 条行为断言 |

## 与主题版的三处偏离

1. **locale 命名空间** 从 `eva-im-filter` 改为 `dsh-im-workspace-buttons`。注册表对同名命名空间
   取先注册者的字典，两个包共用会互相盖掉；回退语言从 `DICT.en` 改为 `DICT.zh`，因为这套文案本来
   就是中文写的，未翻译的语言读中文比读英文对。
2. **样式从 `theme.css` 搬进 runtime 自己的 `<style>`**（`data-dsh-im-workspace-buttons-sheet`）。
   四条规则逐字照抄，选择器、尺寸、颜色令牌不动。
3. **disposer 多收一次 `removeSheet()`**。主题里样式跟着皮肤文档走，插件卸掉后规则还留在 `<style>`
   里；独立包里「卸载后不应继续影响文档」是必须遵守的约定，所以按钮和规则一起撤。

除这三处外，行为、渠道表、图标、探测间隔、点击上限、选择器都与主题版逐字一致。
