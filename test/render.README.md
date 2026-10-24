# 真浏览器验证 · Render Verification

用 `dsh web` 起一个隔离 profile，把本包与 `@xmanrui/dsh-im` 同时挂上，在真实 Chromium 里
截图、点按钮、读 DOM。整轮不碰正式 profile，跑完删掉临时 profile。

## 前置

- Node 22+ / `dsh` CLI
- Playwright 与 Chromium（`npx playwright install chromium` 一次）
- 一个能跑的 `@xmanrui/dsh-im`（探测请求要有结论；没接任何渠道时按钮不出现，这本身也是断言）

## 跑

```bash
node test/render.mjs            # 起隔离 profile → 截图 → 交互断言 → 清理
node test/render.mjs --keep     # 保留临时 profile，便于手点
```

产物写在 `C:\Work\scratch\im-x\render\`（截图与 DOM dump），不落在包目录里。

## 断言

1. 表头行里出现 `[data-eva-im-button]`，数量等于已接入渠道数
2. 每枚按钮矩形 28×28、左缘在搜索槽左缘左边
3. 点一枚：`[data-eva-im-tree]` 值等于该渠道 id，只余该渠道的会话行
4. 再点一次：属性消失，会话行恢复
5. 卸载插件：按钮、行标记、`<style>` 一并消失
