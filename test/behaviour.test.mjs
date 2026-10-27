/**
 * The one import every test file starts with. Installing the browser globals before the mount
 * is imported is the whole contract: src/runtime.js reads `document` at call time, so a test
 * gets whichever document is current when the mount runs.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { use } from './browser-globals.mjs'
import { createDom, createServices } from './fake-dom.mjs'

/**
 * 工作区旁按钮 — behaviour, run against the production code.
 *
 * Two artifacts, one set of assertions:
 *   runtime — src/runtime.js, a real ES module, imported.
 *   shipped — client.js, evaluated the way the module loader evaluates it: one classic script
 *             whose single call to window.__ModuleLoader__.load describes the plugin.
 *
 * Nothing here reimplements the mount. Every press, every re-render and every dispose goes
 * through the real closures.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = path => readFileSync(join(root, path), 'utf8')

const { mountWorkspaceButtons } = await import('../src/runtime.js')

const flush = async () => {
  // The click loop runs one official click per animation frame (see browser-globals.mjs),
  // so a flush has to let the macrotask queue turn over a few times, not just microtasks.
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 10; j++) await Promise.resolve()
    await new Promise(resolve => setImmediate(resolve))
  }
}

/* Three channels hold an account, one answers "no", the rest never answer. */
const HOLDING = {
  weixin: { bots: [{ botId: 'wx-1' }] },
  feishu: { bots: [{ botId: 'fs-1' }] },
  office: { configured: true },
  dingtalk: { bots: [] },
}
const CHANNEL_ORDER = ['weixin', 'feishu', 'office']
const BUTTON = 'data-eva-im-button'
const TAG = 'data-eva-im-tag'

/**
 * Mount against a fresh document. src/runtime.js reads the page globals each time it runs, so
 * each test points them at its own fixture before mounting.
 */
function mountAgainst(dom, services) {
  use(dom)
  return mountWorkspaceButtons({ get: name => services.services[name] })
}

/** Load client.js as the page does, returning the plugin it published. */
function loadShipped(dom) {
  const registrations = []
  const window = Object.assign(Object.create(dom.window), {
    __ModuleLoader__: { load: value => registrations.push(value) },
    requestIdleCallback: fn => { fn(); return 1 },
    cancelIdleCallback() {},
  })
  vm.runInNewContext(read('client.js'), {
    window,
    document: dom.document,
    MutationObserver: dom.MutationObserverClass,
    queueMicrotask,
    setTimeout,
    clearTimeout,
    setInterval: () => 0,
    clearInterval() {},
    Promise,
    Error,
    console,
  })
  assert.equal(registrations.length, 1, 'client.js must register exactly one module')
  assert.equal(registrations[0].id, 'dsh-im-workspace-buttons')
  return registrations[0].factory(name => { throw Error(`unexpected require: ${name}`) })
}

/* ------------------------------------------------------------------ the row */

test('the row: one entry per channel that holds an account, in the table order', async () => {
  const services = createServices({ answers: HOLDING })
  const dom = createDom({ groups: [{ title: 'Work', sessions: [] }] })
  const dispose = mountAgainst(dom, services)

  assert.equal(dom.buttons().length, 0, 'an entry was drawn before any status answered')
  assert.equal(services.asked.length, 12, 'every channel is asked on the first pass')
  assert.equal(services.asked[0].method, 'connection.status')
  assert.equal(services.asked[0].root, '/api')

  await flush()
  assert.deepEqual(dom.buttons().map(b => b.getAttribute(BUTTON)), CHANNEL_ORDER)
  assert.equal(dom.buttons()[0].getAttribute('aria-label'), '只看微信会话')
  assert.equal(dom.buttons()[0].getAttribute('aria-pressed'), 'false')
  assert.equal(dom.buttons()[0].getAttribute('data-eva-im-state'), 'off')
  assert.equal(dom.buttons()[0].getAttribute('title'), null, 'hover must show no wording')
  assert.match(dom.buttons()[0].innerHTML, /^<svg/, 'the entry draws the channel icon')
  dispose()
})

test('the row: entries sit in the official header, left of the auto-margined search slot', async () => {
  const services = createServices({ answers: HOLDING })
  const dom = createDom({ groups: [] })
  const dispose = mountAgainst(dom, services)
  await flush()

  const header = dom.marker.parentElement
  const children = [...header.children]
  const entryAt = children.flatMap((child, at) => (child.hasAttribute(BUTTON) ? [at] : []))
  assert.equal(children[0].textContent, '工作区', 'the label keeps the row open')
  assert.equal(entryAt.length, 3)
  assert.ok(entryAt.every(at => at > 0), 'the 工作区 label stays leftmost')
  // The marker is what every entry is inserted before, so it has to follow them, and drawing
  // the next entry must land right after the last one without moving the marker.
  assert.equal(dom.marker.previousElementSibling?.getAttribute(BUTTON) ?? null, 'office', 'the marker follows the last entry')
  assert.equal(children[children.length - 1], dom.marker, 'nothing is appended after the marker')
  dispose()
})

test('the row: a re-render that drops an entry gets it back in place', async () => {
  const services = createServices({ answers: HOLDING })
  const dom = createDom({ groups: [] })
  const dispose = mountAgainst(dom, services)
  await flush()

  const header = dom.marker.parentElement
  const first = dom.buttons()[0]
  header.removeChild(first)
  assert.equal(dom.buttons().length, 2)

  dom.observer.emit([{ type: 'childList', target: header, addedNodes: [], removedNodes: [first] }])
  await flush()
  assert.deepEqual(dom.buttons().map(b => b.getAttribute(BUTTON)), CHANNEL_ORDER)
  dispose()
})

test('the row: a channel that unbound its account leaves, the others keep their order', async () => {
  const services = createServices({ answers: HOLDING })
  const dom = createDom({ groups: [] })
  const dispose = mountAgainst(dom, services)
  await flush()
  assert.deepEqual(dom.buttons().map(b => b.getAttribute(BUTTON)), CHANNEL_ORDER)

  services.answer('feishu', { bots: [] })
  dom.listeners.get('focus')()
  await flush()
  assert.deepEqual(dom.buttons().map(b => b.getAttribute(BUTTON)), ['weixin', 'office'])
  dispose()
})

test('the row: a failed probe keeps the last word instead of dropping the entry', async () => {
  const services = createServices({ answers: HOLDING })
  const dom = createDom({ groups: [] })
  const dispose = mountAgainst(dom, services)
  await flush()
  const before = dom.buttons().map(b => b.getAttribute(BUTTON))

  services.answer('weixin', 'reject')
  services.answer('feishu', 'throw')
  dom.listeners.get('focus')()
  await flush()
  assert.deepEqual(dom.buttons().map(b => b.getAttribute(BUTTON)), before, 'a failed probe dropped an entry')
  dispose()
})

/* ------------------------------------------------------------------ the filter */

/* Round 66: with no channel lit the tree still carries its MARKER -- 'none' -- so the sheet
   can hide the rows the mount tagged `off` (every non-dsh-im row, and every dsh-im row) and
   the host's grouped views show no dsh-im conversation at all. What "untouched" means here
   is the host's own attributes: no row is tagged `on`, and every other row is left alone. */
const MARKER = 'data-eva-im-tree'

test('the filter: a press shows the channel and nothing else, a second press shows the official list', async () => {
  const services = createServices({ answers: HOLDING })
  const dom = createDom({
    groups: [
      { title: 'Work', sessions: [['weixin', 'WeChat · Ann'], ['feishu', 'Feishu · Bob'], [null, '写周报']] },
      { title: 'Home', sessions: [['weixin', 'WeChat · Cy']] },
    ],
    expanded: ['Work', 'Home'],
  })
  const dispose = mountAgainst(dom, services)
  await flush()
  const tag = key => dom.row(key).getAttribute(TAG)
  assert.equal(dom.tree.getAttribute(MARKER), 'none', 'the grouped list hides its dsh-im rows even unlit')
  assert.deepEqual(dom.tagged(), [], 'nothing is kept open while no view is lit')
  assert.equal(tag('session:Work:写周报'), null, 'an official conversation is the host\'s own row')
  assert.equal(tag('session:Work:Feishu · Bob'), 'off', 'another channel waits for its own view')

  const weixin = dom.buttons().find(button => button.getAttribute(BUTTON) === 'weixin')
  const press = weixin.fire('click')
  assert.equal(press.stopped, true, 'the row underneath must not also act on the press')
  assert.equal(press.prevented, true)
  await flush()

  assert.equal(dom.tree.getAttribute(MARKER), 'weixin')
  assert.deepEqual(dom.tagged().sort(), ['session:Home:WeChat · Cy', 'session:Work:WeChat · Ann'],
    'only the channel\'s own session rows are lit')
  assert.equal(tag('session:Work:写周报'), 'off', 'the view is the channel\'s conversations, not the host\'s list')
  assert.equal(tag('session:Work:Feishu · Bob'), 'off', 'and no other channel\'s')
  assert.equal(tag('workspace:Work'), 'off', 'the group header steps aside with the rows it held')
  assert.equal(weixin.getAttribute('data-eva-im-state'), 'on')
  assert.equal(weixin.getAttribute('aria-pressed'), 'true')
  assert.equal(weixin.getAttribute('aria-label'), '显示全部会话', 'a lit entry is the way back')

  weixin.fire('click')
  await flush()
  assert.equal(dom.tree.getAttribute(MARKER), 'none', 'the grouped list is back to hiding dsh-im again')
  assert.equal(dom.tree.querySelectorAll(`[${TAG}='on']`).length, 0, 'no row is left lit')
  assert.equal(tag('session:Work:写周报'), null, 'the official conversation is the host\'s again')
  assert.equal(tag('workspace:Work'), null, 'and so is its group header')
  assert.equal(weixin.getAttribute('data-eva-im-state'), 'off')
  dispose()
})

test('the filter: switching channels lights one entry, never two', async () => {
  const services = createServices({ answers: HOLDING })
  const dom = createDom({
    groups: [{ title: 'Work', sessions: [['weixin', 'WeChat · Ann'], ['feishu', 'Feishu · Bob']] }],
    expanded: ['Work'],
  })
  const dispose = mountAgainst(dom, services)
  await flush()

  const byId = id => dom.buttons().find(button => button.getAttribute(BUTTON) === id)
  byId('weixin').fire('click')
  await flush()
  byId('feishu').fire('click')
  await flush()

  assert.equal(dom.tree.getAttribute(MARKER), 'feishu')
  assert.equal(byId('feishu').getAttribute('data-eva-im-state'), 'on')
  assert.equal(byId('weixin').getAttribute('data-eva-im-state'), 'off')
  assert.deepEqual(dom.tagged(), ['session:Work:Feishu · Bob'])
  assert.equal(dom.row('session:Work:WeChat · Ann').getAttribute(TAG), 'off', 'the channel left behind is hidden again')
  dispose()
})

test('the filter: a title lead keeps a look-alike session out of the channel view', async () => {
  // The trailing dot in the lead is load-bearing: an ordinary session called 微信… is not the
  // WeChat channel's.
  /* The look-alike carries NO channel stamp -- that is the only way it can pass for one, and
     the lead test is the only thing that keeps it out. */
  const services = createServices({ answers: HOLDING })
  const dom = createDom({
    groups: [{ title: 'Work', sessions: [['weixin', 'WeChat · Ann'], [null, '微信归来计划']] }],
    expanded: ['Work'],
  })
  const dispose = mountAgainst(dom, services)
  await flush()
  assert.equal(dom.tree.getAttribute(MARKER), 'none', 'an ordinary session is not a dsh-im row')
  assert.equal(dom.row('session:Work:微信归来计划').getAttribute(TAG), null)

  dom.buttons().find(button => button.getAttribute(BUTTON) === 'weixin').fire('click')
  await flush()
  assert.deepEqual(dom.tagged(), ['session:Work:WeChat · Ann'])
  assert.equal(dom.row('session:Work:微信归来计划').getAttribute(TAG), 'off', 'the look-alike is hidden with the rest of the list')
  dispose()
})

test('the filter: dropping the account that is lit puts the official list back', async () => {
  const services = createServices({ answers: HOLDING })
  const dom = createDom({
    groups: [{ title: 'Work', sessions: [['weixin', 'WeChat · Ann']] }],
    expanded: ['Work'],
  })
  const dispose = mountAgainst(dom, services)
  await flush()

  dom.buttons().find(button => button.getAttribute(BUTTON) === 'weixin').fire('click')
  await flush()
  assert.equal(dom.tree.getAttribute(MARKER), 'weixin')

  services.answer('weixin', { bots: [] })
  dom.listeners.get('focus')()
  await flush()
  assert.equal(dom.tree.getAttribute(MARKER), 'none', 'a lit view whose account is gone has no way back')
  assert.ok(!dom.buttons().some(button => button.getAttribute(BUTTON) === 'weixin'))
  dispose()
})

/* Round 66: the reason the sheet reaches rows the old rule could not see. A grouped list
   draws ONLY the Session's own name (:1027-1046), so a dsh-im conversation no workspace
   record claims -- the 未分组 bucket -- has no lead on screen at all. It must still be the
   channel's, or pressing the entry finds nothing. The group header next to it is not a
   conversation, whatever it is called. */
test('the filter: the ungrouped bucket hides its dsh-im rows, and still finds them once lit', async () => {
  /* Round 66: the fixture's own row, with no record to group it under -- the 未分组 bucket,
     where the grouped list draws the Session's own name and nothing else. Its key carries the
     host's empty group name (`session:${''}:${...}`), which is the point of the case. */
  const services = createServices({ answers: HOLDING })
  const own = { title: null, sessions: [['weixin', 'WeChat · Ann'], ['feishu', 'Feishu · Bob']] }
  const dom = createDom({
    groups: [own, { title: 'AI Office · 项目', sessions: [[null, '由办公室接管']] }],
    expanded: ['AI Office · 项目'],
  })
  const dispose = mountAgainst(dom, services)
  await flush()
  const byKey = key => dom.rows().find(row => row.getAttribute('data-row-key') === key)

  assert.equal(dom.tree.getAttribute(MARKER), 'none')
  assert.equal(byKey('session:WeChat · Ann').getAttribute(TAG), 'off', 'ungrouped dsh-im waits for its own view')
  assert.equal(byKey('session:Feishu · Bob').getAttribute(TAG), 'off')
  assert.equal(
    byKey('session:AI Office · 项目:由办公室接管').getAttribute(TAG),
    null,
    'an official session under a lead-named group is the host\'s to draw',
  )

  dom.buttons().find(button => button.getAttribute(BUTTON) === 'weixin').fire('click')
  await flush()
  assert.deepEqual(dom.tagged(), ['session:WeChat · Ann'], 'the own-name row joins its channel')
  assert.equal(byKey('session:Feishu · Bob').getAttribute(TAG), 'off')
  assert.ok(!dom.tag('session:WeChat · Ann').includes(`[${TAG}='off']`), 'the lit row is drawn')
  assert.equal(
    byKey('session:AI Office · 项目:由办公室接管').getAttribute(TAG),
    'off',
    'the official session under the next group is out of this view too',
  )
  assert.equal(byKey('workspace:AI Office · 项目').getAttribute(TAG), 'off', 'and the header above it')
  dispose()
})

/* The single list draws its rows outside [role=tree] (:3896-4029): they are reachable only
   through the flat container's own name, which is what imView() writes on the lit view. */
test('the filter: the single flat list hides dsh-im until a channel is lit', async () => {
  const services = createServices({ answers: HOLDING })
  const dom = createDom({
    groups: [{ title: null, sessions: [['weixin', 'WeChat · Ann'], ['feishu', 'Feishu · Bob'], [null, '写周报']] }],
    flat: true,
    expanded: [],
  })
  const dispose = mountAgainst(dom, services)
  await flush()
  const byKey = key => dom.rows().find(row => row.getAttribute('data-row-key') === key)
  const list = dom.document.querySelector('[data-testid="session-list"]')

  assert.equal(list.getAttribute(MARKER), null, 'nothing lit: the flat page keeps no marker of its own')
  assert.equal(byKey('session:WeChat · Ann').getAttribute(TAG), 'off', 'the single list hides dsh-im without a view')
  assert.equal(byKey('session:Feishu · Bob').getAttribute(TAG), 'off')
  assert.equal(byKey('session:写周报').getAttribute(TAG), null, 'an ordinary session is never touched')

  dom.buttons().find(button => button.getAttribute(BUTTON) === 'weixin').fire('click')
  await flush()
  assert.equal(list.getAttribute(MARKER), 'weixin', 'a lit view reaches the rows the flat page drew')
  assert.deepEqual(dom.tagged(), ['session:WeChat · Ann'])
  assert.equal(byKey('session:Feishu · Bob').getAttribute(TAG), 'off', 'another channel stays hidden')
  assert.equal(byKey('session:写周报').getAttribute(TAG), 'off', 'and so does every other conversation')

  dom.buttons().find(button => button.getAttribute(BUTTON) === 'weixin').fire('click')
  await flush()
  assert.equal(list.getAttribute(MARKER), null, 'and back to the host\'s own page')
  assert.equal(byKey('session:WeChat · Ann').getAttribute(TAG), 'off', 'dsh-im waits for its view again')
  assert.equal(byKey('session:写周报').getAttribute(TAG), null, 'the official row is the host\'s again')
  dispose()
})

/* ------------------------------------------------------------------ disposition */

test('disposition: disposal gives the document back exactly as it found it', async () => {
  const services = createServices({ answers: HOLDING })
  const dom = createDom({
    groups: [{ title: 'Work', sessions: [['weixin', 'WeChat · Ann']] }],
    expanded: ['Work'],
  })
  const dispose = mountAgainst(dom, services)
  await flush()

  assert.ok(dom.style() !== null, 'the control keeps its own sheet in the document')
  dom.buttons().find(button => button.getAttribute(BUTTON) === 'weixin').fire('click')
  await flush()
  assert.notEqual(dom.tree.getAttribute(MARKER), null)

  dispose()
  await flush()
  assert.equal(dom.buttons().length, 0, 'every entry goes')
  assert.equal(dom.tree.getAttribute(MARKER), null, 'the list attribute goes')
  assert.equal(dom.tree.querySelectorAll(`[${TAG}]`).length, 0, 'the row tags go')
  assert.equal(dom.style(), null, 'the sheet goes with the control that injected it')
  assert.equal(dom.listeners.size, 0, 'no document or window listener is left behind')
  assert.equal(services.subscriptions.length, 0, 'no sessions or locale subscription is left behind')
})

test('disposition: an answer that arrives after disposal stays inert', async () => {
  const services = createServices({ answers: {} })
  const dom = createDom({ groups: [] })
  const dispose = mountAgainst(dom, services)
  dispose()
  services.answer('weixin', { bots: [{ botId: 'late' }] })
  await flush()
  assert.equal(dom.buttons().length, 0)
})

/* ------------------------------------------------------------------ locale */

test('locale: labels follow the registry language, and read Chinese without one', async () => {
  for (const [language, expected] of [['zh', '只看微信会话'], ['en', 'Show WeChat conversations']]) {
    const services = createServices({ answers: HOLDING, language })
    const dom = createDom({ groups: [] })
    const dispose = mountAgainst(dom, services)
    await flush()
    assert.equal(dom.buttons()[0].getAttribute('aria-label'), expected, `language ${language}`)
    dispose()
  }

  // No locale service at all: the copy this control carries is Chinese, so an untranslated
  // profile reads Chinese rather than English.
  const connection = createServices({ answers: HOLDING }).services.connection
  const dom = createDom({ groups: [] })
  const dispose = mountAgainst(dom, { services: { connection } })
  await flush()
  assert.equal(dom.buttons()[0].getAttribute('aria-label'), '只看微信会话')
  dispose()
})

/* ------------------------------------------------------------------ the shipped artifact */

test('shipped: client.js registers one module that names every service it reads', () => {
  const plugin = loadShipped(createDom({ groups: [] }))
  assert.equal(plugin.name, 'dsh-im-workspace-buttons')
  assert.equal(typeof plugin.apply, 'function')
  assert.deepEqual(
    [...plugin.inject],
    ['theme', 'locale', 'uiSession', 'sessions', 'workspaces', 'connection'],
    'a service read through ctx.get but not named lets apply run before it exists',
  )
})

test('shipped: the shipped mount draws, filters and disposes like the source module', async () => {
  const services = createServices({ answers: HOLDING })
  const dom = createDom({
    groups: [{ title: 'Work', sessions: [['weixin', 'WeChat · Ann'], ['feishu', 'Feishu · Bob']] }],
    expanded: ['Work'],
  })
  // The shipped file is evaluated in a sandbox whose document and MutationObserver are this
  // fixture, so it needs no global swap of its own.
  const plugin = loadShipped(dom)

  const effects = []
  plugin.apply({
    get: name => services.services[name],
    effect(fn) { effects.push(fn()) },
  })
  assert.equal(effects.length, 1, 'the plugin registers exactly one effect')
  await flush()

  assert.deepEqual(dom.buttons().map(b => b.getAttribute(BUTTON)), CHANNEL_ORDER)
  dom.buttons().find(button => button.getAttribute(BUTTON) === 'weixin').fire('click')
  await flush()
  assert.equal(dom.tree.getAttribute(MARKER), 'weixin')

  effects[0]()
  assert.equal(dom.buttons().length, 0, 'the disposer the loader calls removes the row')
  assert.equal(dom.style(), null)
  assert.equal(dom.tree.getAttribute(MARKER), null)
})
