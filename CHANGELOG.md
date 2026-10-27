# Changelog

All notable changes are recorded here. Versions follow SemVer; a new feature raises
the minor version, a pure fix raises the patch version.

## 1.0.2 — 2026-10-27

### Fixed

- **A dsh-im conversation was just as likely to read as 未分组 as its real workspace.**
  `candidates()` filed a conversation's group from a set of exact, often-failing tests
  (`workspace.sessionIds` membership exactly as written, then `session.cwd ===
  workspace.path`), and anything that fell through was filed as Ungrouped — while the
  host's own list drew the same conversation under its workspace. A cwd that differed only
  by a trailing separator, by case, or that had moved on after the session was created was
  enough to split the two. The rebuilt map also reused `path` as a key for the owner map,
  so a conversation whose id was a path could be re-filed. Ownership is now answered once,
  by `home()`, in the host's own order: a record's `sessionIds` claims it, everything left
  over is Ungrouped (ui-workspace `groupByWorkspace` :1027-1046). A cwd is not consulted:
  the host does not group by it.
- **The flat list stayed filtered to five rows.** In a flat list the group key is `''` —
  the empty key of the Ungrouped bucket, which in the grouped views is a group with no
  header row. `closeStep()` therefore could not close a control it had opened, and
  `openStep()` asked for a workspace header that does not exist there. The flat page is
  now recorded under a key no workspace can hold, and only its own single control is
  opened, so a channel view can reach a conversation past the first page.
- The row tag now follows the row's channel marker rather than the selected channel's
  title prefix, so a row already tagged cannot keep a stale tag across a channel switch.

### Changed

- **The Ungrouped header is no longer the target of anything.** `candidates()` names the
  groups a channel's conversations sit in; the empty key is asked for only through its
  show-more control (`overflow:` with nothing after the colon), never through a header
  click.

## 1.0.4 — 2026-10-27

### Fixed

- **A press did not isolate the channel — it unrolled the whole list.** In a channel view
  the mount tagged the channel's own rows and left everything else alone, while the pump
  opened every folded group and paged every show-more control so the channel's rows could
  be drawn. The result was the opposite of the intent: pressing Telegram expanded the
  sidebar past a hundred rows — every other conversation, every group header, every
  show-more control — and pressing it again collapsed them. That is what read as "the
  button shows the conversations, the button hides them".
- **A channel view now hides everything that is not that channel.** `mark()` tags the rows
  the view must not draw with `data-eva-im-tag='off'`: other channels, ordinary sessions,
  every group header and every show-more control. The official list keeps its old
  behaviour — dsh-im rows hidden, official rows and headers untouched — so dropping back
  out of a view restores exactly what the host drew.
- The pump still clicks those controls before they are hidden (a hidden control is still
  clickable), so a folded group or a second page of a channel's conversations is still
  reached; the rows are simply not shown until the view wants them.

### Changed

- `README.md` / `README.zh.md`: the click row now says what a view does to every other row,
  the style-contract row names the sheet's real rule (`[data-eva-im-tag='off']`), and the
  flat-list row stops claiming the rows live outside `[role='tree']` — this host draws both
  lists through `AnimatedRows`, inside the same tree.

## 1.0.3 — 2026-10-27

### Fixed

- **dsh-im conversations were never hidden.** The sheet hid a row with
  `[data-eva-im-tree] [data-row-key]:not([data-eva-im-row='on'])`, but the mount wrote a
  tag only on rows it accepted and left every other row untagged — so the negation matched
  nothing and every conversation stayed on screen, in the flat list as much as in the two
  grouped views. The tag is now written on every dsh-im row (`off`), a channel view flips
  its own to `on`, and a row that is not a dsh-im conversation is never tagged at all,
  which is what keeps every other conversation exactly as the host draws it.
- **A grouped list draws only the Session's own name.** `groupByWorkspace` (:1027-1046)
  renders the title with the channel lead stripped, so a dsh-im conversation in the
  Ungrouped bucket — or in any group, once pressed — carried no lead on screen and was
  refused by the old detection. `surface()` now takes the recency of the
  `data-dsh-im-session-channel` stamp into account and answers for the lit channel when the
  stamp does not name one in the table. This is also why a conversation used to fall into
  未分组 while its workspace was right: the host's grouping was never the problem, the
  recognition was.
- **The single list was out of reach.** Its rows are drawn outside `[role='tree']`, and the
  mount looked for a tree and gave up without one. `tree()` now answers with the container
  the rows are actually in, `[data-testid="session-list"]` for the flat page, so the sheet's
  marker lands where the rows are and a lit view can show them.
- **The row tag moved off `data-eva-im-row`.** That attribute is in the effect's own
  MutationObserver filter; tagging rows there made every pass schedule another, and the
  tags never settled. Rows now carry `data-eva-im-tag`, and `data-eva-im-row` is no longer
  written at all.

## 1.0.1 — 2026-10-25

### Changed

- **Bilingual README.** `README.md` is now the English edition and `README.zh.md` the
  Chinese one, with a language switch at the top of each, matching the convention
  `eva-inspired-theme` already uses. Both are published in the tarball; npm renders
  `README.md`, so the English edition is the one shown on the package page.

No code change: `client.js`, `src/runtime.js`, the locale files and the patch are
byte-identical to 1.0.0 (`build-client --check` in sync, 14/14 tests).

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
