# Changelog

All notable changes are recorded here. Versions follow SemVer; a new feature raises
the minor version, a pure fix raises the patch version.

## 1.0.0 — 2026-10-25

First standalone release. The feature is extracted verbatim from
`eva-inspired-theme` 1.1.0 (Round 64 runtime), so the two can be swapped without a
behavioural change.

### Added

- **工作区旁按钮** — one 28×28 channel entry per `@xmanrui/dsh-im` channel that
  holds an account, inserted into the official `sidebar.workspaces.directoryFlow`
  header row before the search slot, in the plugin's own channel order (12 channels:
  weixin, feishu, dingtalk, wecom, qq, slack, telegram, discord, whatsapp, imessage,
  matrix, office).
- Visibility rule: an entry appears only when `connection.status` proves the channel
  has an account (`bots[]` with a non-empty `botId`, or the older `configured: true`);
  an unanswered probe keeps the last verdict, so a dropped route never takes a control
  the user is using away.
- Click filtering: one view lit at a time; pressing a lit entry restores the official
  list. Collapsed groups are unfolded, paged and scrolled (limit `CLICK_LIMIT = 200`)
  only on click.
- Self-contained stylesheet injected as `<style data-dsh-im-workspace-buttons-sheet>`,
  four rules copied verbatim from the theme, all colours from `--dsw-*` tokens.
- Locale namespace `dsh-im-workspace-buttons` with `zh` and `en` dictionaries.

### Changed from the theme edition

- Locale namespace renamed `eva-im-filter` → `dsh-im-workspace-buttons`, so the two
  packages cannot overwrite each other's dictionary. Untranslated languages now fall
  back to Chinese instead of English.
- Styles moved out of `theme.css` into the runtime's own `<style>` element.
- The disposer also calls `removeSheet()`, so uninstalling leaves no rules behind.
- `window.requestIdleCallback` / `cancelIdleCallback` are read off the page instead of
  being used as bare globals — a sandboxed module scope would otherwise throw
  `ReferenceError` and take the whole apply down.

### Not carried over

- Theme skin, tokens, wallpapers, and every other theme feature.
- The `evangelion: im channel filters` effect wrapper: the client plugin calls
  `mountWorkspaceButtons` directly.
