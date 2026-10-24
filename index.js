/**
 * 工作区旁按钮 — installed (bundle) HOST half.
 *
 * One job: be the cordis plugin the loader mounts, so the browser roster has a row to scan
 * for `exports["./client"]`. The control is drawn entirely in client.js; nothing about its
 * appearance, its channel table or its filtering is decided here.
 *
 * ES module, not CommonJS: package.json declares `"type": "module"`, and the loader imports
 * this file as an ES module URL. A `module.exports` here fails at import time with
 * `ReferenceError: module is not defined in ES module scope`, which the loader reports as
 * "entry did not activate" — the host row never appears and the browser half never mounts.
 *
 * What this half deliberately does NOT do, and why:
 *
 *   - No service, no event listener, no HTTP route. The panel half of @xmanrui/dsh-im
 *     already owns one route per channel (`dsh-im/<channel>`, method `connection.status`);
 *     a second reader would be a second source of truth for the same fact.
 *   - No `Config`. There is no quantity here that has one right answer per user: which
 *     channels are in the row is decided by which ones hold an account, and what each entry
 *     does is decided by the channel table. A Config with nothing to read is an invalid
 *     declaration, and the browser half needs no preference to start.
 *   - No filesystem access, no subprocess, no socket.
 *
 * A failing host half must never take the buttons down: client.js is loaded by the web
 * modules roster from `dsh.client`, not from here, so a logger that throws costs the log
 * line and nothing else.
 */

const PLUGIN_ID = 'dsh-im-workspace-buttons'

/**
 * Mount the plugin.
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx - Owning plugin context.
 */
export function apply(ctx) {
  try {
    ctx.logger?.info?.(
      `${PLUGIN_ID}: host half mounted. The 工作区 row's channel entries are drawn entirely ` +
        `in the browser half (exports["./client"]); this entry registers no services, opens ` +
        `no routes, and exports no Config by design (see the header).`,
    )
  } catch (error) {
    /* A logger that throws must not stop the row from mounting: the browser half is what
     * draws the buttons, and it loads independently of this call. */
  }
}

export const name = PLUGIN_ID
