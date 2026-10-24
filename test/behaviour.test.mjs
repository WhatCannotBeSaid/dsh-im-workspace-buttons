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

const flush = async () => { for (let i = 0; i < 40; i++) await Promise.resolve() }

/* Three channels hold an account, one answers "no", the rest never answer. */
const HOLDING = {
  weixin: { bots: [{ botId: 'wx-1' }] },
  feishu: { bots: [{ botId: 'fs-1' }] },
  office: { configured: true },
  dingtalk: { bots: [] },
}
const CHANNEL_ORDER = ['weixin', 'feishu', 'office']
const BUTTON = 'data-eva-im-button'
const TAG = 'data-eva-im-row'

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

test('the filter: a press shows only that channel, a second press shows the official list', async () => {
  const services = createServices({ answers: HOLDING })
  const dom = createDom({
    groups: [
      { title: 'Work', sessions: [['weixin', 'WeChat · Ann'], ['feishu', 'Feishu · Bob']] },
      { title: 'Home', sessions: [['weixin', 'WeChat · Cy']] },
    ],
    expanded: ['Work', 'Home'],
  })
  const dispose = mountAgainst(dom, services)
  await flush()
  assert.equal(dom.tree.getAttribute('data-eva-im-tree'), null)

  const weixin = dom.buttons().find(button => button.getAttribute(BUTTON) === 'weixin')
  const press = weixin.fire('click')
  assert.equal(press.stopped, true, 'the row underneath must not also act on the press')
  assert.equal(press.prevented, true)
  await flush()

  assert.equal(dom.tree.getAttribute('data-eva-im-tree'), 'weixin')
  assert.deepEqual(
    dom.tree.querySelectorAll(`[${TAG}]`).map(row => row.getAttribute('data-row-key')).sort(),
    ['session:Home:WeChat · Cy', 'session:Work:WeChat · Ann'],
    'only the channel\'s own session rows stay tagged',
  )
  assert.equal(weixin.getAttribute('data-eva-im-state'), 'on')
  assert.equal(weixin.getAttribute('aria-pressed'), 'true')
  assert.equal(weixin.getAttribute('aria-label'), '显示全部会话', 'a lit entry is the way back')

  weixin.fire('click')
  await flush()
  assert.equal(dom.tree.getAttribute('data-eva-im-tree'), null, 'the list comes back whole')
  assert.equal(dom.tree.querySelectorAll(`[${TAG}]`).length, 0, 'no row is left tagged')
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

  assert.equal(dom.tree.getAttribute('data-eva-im-tree'), 'feishu')
  assert.equal(byId('feishu').getAttribute('data-eva-im-state'), 'on')
  assert.equal(byId('weixin').getAttribute('data-eva-im-state'), 'off')
  assert.deepEqual(
    dom.tree.querySelectorAll(`[${TAG}]`).map(row => row.getAttribute('data-row-key')),
    ['session:Work:Feishu · Bob'],
  )
  dispose()
})

test('the filter: a title lead keeps a look-alike session out of the channel view', async () => {
  // The trailing dot in the lead is load-bearing: an ordinary session called 微信… is not the
  // WeChat channel's.
  const services = createServices({ answers: HOLDING })
  const dom = createDom({
    groups: [{ title: 'Work', sessions: [['weixin', 'WeChat · Ann'], ['none', '微信归来计划']] }],
    expanded: ['Work'],
  })
  const dispose = mountAgainst(dom, services)
  await flush()

  dom.buttons().find(button => button.getAttribute(BUTTON) === 'weixin').fire('click')
  await flush()
  assert.deepEqual(
    dom.tree.querySelectorAll(`[${TAG}]`).map(row => row.getAttribute('data-row-key')),
    ['session:Work:WeChat · Ann'],
  )
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
  assert.equal(dom.tree.getAttribute('data-eva-im-tree'), 'weixin')

  services.answer('weixin', { bots: [] })
  dom.listeners.get('focus')()
  await flush()
  assert.equal(dom.tree.getAttribute('data-eva-im-tree'), null, 'a lit view whose account is gone has no way back')
  assert.ok(!dom.buttons().some(button => button.getAttribute(BUTTON) === 'weixin'))
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
  assert.notEqual(dom.tree.getAttribute('data-eva-im-tree'), null)

  dispose()
  assert.equal(dom.buttons().length, 0, 'every entry goes')
  assert.equal(dom.tree.getAttribute('data-eva-im-tree'), null, 'the list attribute goes')
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
  assert.equal(dom.tree.getAttribute('data-eva-im-tree'), 'weixin')

  effects[0]()
  assert.equal(dom.buttons().length, 0, 'the disposer the loader calls removes the row')
  assert.equal(dom.style(), null)
  assert.equal(dom.tree.getAttribute('data-eva-im-tree'), null)
})
