# Workspace Channel Buttons

[![licence: MIT](https://img.shields.io/badge/licence-MIT-yellow.svg)](#licence)

English | [中文](README.zh.md)

One 28×28 icon button per [@xmanrui/dsh-im](https://www.npmjs.com/package/@xmanrui/dsh-im)
channel that holds an account, placed in the official 「工作区」 (Workspaces) header row.
Pressing one shows only that channel's conversations; pressing it again restores the
official list.

This is the single feature extracted from `eva-inspired-theme`: the buttons and nothing
else. No skin, no theme replacement, no dependency on the theme's CSS, locale namespace
or build pipeline.

## Install

```bash
# 1. install the package
npm install dsh-im-workspace-buttons --prefix ~/.dsh/profiles/desktop --registry=https://registry.npmjs.org

# 2. add it to the profile's bundle list (<profileDir> = ~/.dsh/profiles/desktop)
#    append "dsh-im-workspace-buttons" to dsh.profile.bundles in package.json
```

Restart DSH afterwards. The package ships its own `dsh.bundle.patch`, so
`cordis.patch.yml` needs no hand edit — but the profile's `dsh.profile.bundles` must list
this package, or the loader never mounts it.

Requires [`@xmanrui/dsh-im`](https://www.npmjs.com/package/@xmanrui/dsh-im) and at least
one channel with a connected account; by design no buttons appear otherwise.

## Migrating from the theme edition

`eva-inspired-theme` 1.2.0 no longer contains these buttons. Do **not** install both:

- The theme edition uses the `data-eva-im-*` contract and the `eva-im-filter` locale
  namespace; this package uses `data-dsh-im-*` and `dsh-im-workspace-buttons`. Installed
  together they draw two sets of buttons on the same row, and neither stylesheet covers
  the other's.
- Upgrading to `eva-inspired-theme@1.2.0` and installing this package is a drop-in swap:
  interaction, icons, order and the visibility rule are identical.

## Behaviour

| | |
|---|---|
| Plugin id | `dsh-im-workspace-buttons` (also the client module id and the locale namespace) |
| Where | The header row carrying the official `sidebar.workspaces.directoryFlow` marker, left of the search slot, in the plugin's own channel order |
| Visibility | An entry appears only when the channel **has an account**: `connection.status` returns a non-empty `botId` in `bots[]`, or the older `configured: true`. An inconclusive probe (RPC not ready, request failed) draws nothing on the first pass and keeps the previous verdict after that |
| Click | Shows only that channel's conversation rows (recognised by `data-dsh-im-session-channel` or the row's text prefix); a second click restores the official list |
| Collapsed groups | Unfolded, paged and scrolled to the channel's first conversation only on click, capped at `CLICK_LIMIT = 200` steps |
| Labels | Through the Client locale service; follows the profile language, falls back to Chinese when the registry is absent |
| Untouched | Official grouping, collapsed state, spy counts, conversation order; nothing is reordered or hidden |

## Style contract

The runtime injects its own `<style data-dsh-im-workspace-buttons-sheet>`; every colour
comes from a `--dsw-*` token:

| Selector | Effect |
|---|---|
| `[data-eva-im-button]` | 28×28, no border, no background, `--dsw-radius-sm` corners, `--dsw-alias-label-secondary` foreground |
| `[data-eva-im-button]:hover` | Foreground turns `--dsw-alias-label-primary` |
| `[data-eva-im-state='on']` | The lit entry turns `--dsw-alias-brand-primary` |
| `[data-eva-im-tree] [data-row-key]:not([data-eva-im-row='on'])` | Every row not in this channel is hidden |

The `data-eva-im-*` prefix is kept verbatim from the extraction; renaming it would break
style compatibility with `eva-inspired-theme`. Note the fourth rule: an "off" state can
never be expressed by omitting the attribute — `data-eva-im-row='on'` must be written
explicitly, or no row is hidden at all.

## Dependencies

| Dependency | Kind |
|---|---|
| `@xmanrui/dsh-im` | **Required at runtime.** The channel table and the status probe both read its `connection.status`; without it no button appears |
| Host client services `sessions` / `workspaces` / `locale` / `connection` | Taken through `ctx.get` only, never imported |
| `eva-inspired-theme` | **Not needed.** Styles, locale namespace and build are all self-contained |

## Development

```bash
node tools/build-client.mjs          # rewrite the runtime section of client.js from src/runtime.js
node tools/build-client.mjs --check  # assert client.js and src/runtime.js agree
node --test --test-timeout=15000 test/*.test.mjs   # 14 behaviour tests, fake DOM, no browser
node test/render.mjs                 # real browser: isolated profile + this package + dsh-im
```

The runtime inside `client.js` is a **copy**, not an import: the client module loader
evaluates `client.js` as a classic script, so the file cannot contain a module graph.
`tools/build-client.mjs` keeps the copy honest.

## Files

| File | Purpose |
|---|---|
| `index.js` | Host entry, ESM, `export apply(ctx)`; one log line, no service / route / Config |
| `client.js` | Browser entry, `window.__ModuleLoader__.load({ id, factory })`, carries the runtime copy |
| `src/runtime.js` | Runtime source of truth (`export function mountWorkspaceButtons(ctx)`) |
| `cordis.patch.yml` | `- insert: [{ id, name }]`; also the browser roster entry |
| `locale/zh.json` · `locale/en.json` | `meta.title` / `meta.description` plus the 12 channel labels |
| `tools/build-client.mjs` | Inlines `src/runtime.js` into `client.js`, `--check` verifies it |
| `test/fake-dom.mjs` · `test/behaviour.test.mjs` | Fake DOM and 14 behaviour assertions |

## Three deviations from the theme edition

1. **Locale namespace** renamed `eva-im-filter` → `dsh-im-workspace-buttons`. The registry
   keeps the first registration for a namespace, so two packages sharing one would
   overwrite each other's dictionary. The fallback language also moved from `DICT.en` to
   `DICT.zh`, because these strings were written in Chinese — an untranslated language
   reading Chinese beats reading English.
2. **Styles moved from `theme.css` into the runtime's own `<style>`**
   (`data-dsh-im-workspace-buttons-sheet`). The four rules are copied verbatim; selectors,
   sizes and colour tokens are unchanged.
3. **The disposer also calls `removeSheet()`.** In the theme the styles live with the skin
   document, so the rules survived unloading; in a standalone package "uninstalling must
   stop affecting the document" is a hard rule, so the buttons and the rules leave together.

Beyond these three, behaviour, channel table, icons, probe interval, click limit and
selectors are identical to the theme edition.

## Licence

MIT — see [LICENSE](LICENSE).
