/**
 * A fake browser for exercising the mount without a real one.
 *
 * The mount only touches a small, well-defined corner of the DOM: attribute reads and writes
 * on rows and buttons, one `querySelector` per selector in its vocabulary, `children`,
 * `parentElement`, `insertBefore` / `appendChild` / `removeChild`, `textContent`, one
 * `scrollTop`, one `MutationObserver` and three window/document event names. This file
 * implements exactly that corner and nothing else, so a call the production code does not
 * make cannot accidentally succeed.
 *
 * Selector support is deliberately narrow: the vocabulary below is the production one.
 * A selector outside it throws, which keeps the fixture honest about what it claims to model
 * instead of silently returning "no match" and making a test pass for the wrong reason.
 *
 * usage:
 *   const dom = createDom({ groups: [{ title: 'Work', sessions: [['weixin', 'WeChat · Ann']] }] })
 *   dom.row('session:a')        // a node from the rendered tree
 *   dom.window.document         // what the mount sees
 *   dom.observer.emit([...])    // drive a MutationObserver batch
 */

export class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase()
    this.attributes = new Map()
    this.children = []
    this.parentElement = null
    this.textContent = ''
    this.listeners = new Map()
    this.scrollTop = 0
    this.style = {}
    this.innerHTML = ''
    this.isConnected = true
  }

  get firstElementChild() {
    return this.children.length > 0 ? this.children[0] : null
  }

  /** The sibling before this one, or null — what a row insertion has to fall back on. */
  get previousElementSibling() {
    const parent = this.parentElement
    if (parent === null) return null
    const at = parent.children.indexOf(this)
    return at > 0 ? parent.children[at - 1] : null
  }

  get nextSibling() {
    const parent = this.parentElement
    if (parent === null) return null
    const at = parent.children.indexOf(this)
    return at >= 0 && at < parent.children.length - 1 ? parent.children[at + 1] : null
  }

  getAttribute(name) {
    return this.attributes.has(name) ? this.attributes.get(name) : null
  }

  hasAttribute(name) {
    return this.attributes.has(name)
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value))
    this.owner?.dirty()
  }

  removeAttribute(name) {
    this.attributes.delete(name)
    this.owner?.dirty()
  }

  appendChild(child) {
    return this.insertBefore(child, null)
  }

  insertBefore(child, before) {
    const at = before === null ? -1 : this.children.indexOf(before)
    if (child.parentElement !== null) child.parentElement.removeChild(child)
    if (at < 0) this.children.push(child)
    else this.children.splice(at, 0, child)
    child.parentElement = this
    this.owner?.dirty()
    return child
  }

  removeChild(child) {
    const at = this.children.indexOf(child)
    if (at >= 0) this.children.splice(at, 1)
    child.parentElement = null
    this.owner?.dirty()
    return child
  }

  contains(node) {
    let cursor = node
    while (cursor !== null && cursor !== undefined) {
      if (cursor === this) return true
      cursor = cursor.parentElement
    }
    return false
  }

  addEventListener(name, fn) {
    if (!this.listeners.has(name)) this.listeners.set(name, [])
    this.listeners.get(name).push(fn)
  }

  removeEventListener(name, fn) {
    const bag = this.listeners.get(name)
    if (!bag) return
    const at = bag.indexOf(fn)
    if (at >= 0) bag.splice(at, 1)
  }

  /** Fire a listener the mount registered, with the minimum event object it reads. */
  fire(name) {
    const event = {
      type: name,
      stopped: false,
      prevented: false,
      stopPropagation() { this.stopped = true },
      preventDefault() { this.prevented = true },
    }
    for (const fn of [...(this.listeners.get(name) ?? [])]) fn.call(this, event)
    return event
  }

  /** Every element in this subtree, in document order. */
  *walk() {
    yield this
    for (const child of this.children) yield* child.walk()
  }

  /** The production selector vocabulary. See matching() below for each shape. */
  querySelectorAll(selector) {
    const test = matching(selector)
    const out = []
    for (const node of this.walk()) {
      if (node !== this && test(node)) out.push(node)
    }
    return out
  }

  querySelector(selector) {
    const all = this.querySelectorAll(selector)
    return all.length > 0 ? all[0] : null
  }
}

/* ------------------------------------------------------------------ selectors */

const SELECTORS = [
  // Tag-only takes the group, not the whole match: `node.tagName === 'INPUT'`, never the regex arrays.
  ['tag only', /^([a-z][a-z0-9]*)$/, ([, tag]) => node => node.tagName === tag.toUpperCase()],
  ['has attribute', /^\[([a-z-]+)\]$/, ([, name]) => node => node.hasAttribute(name)],
  // A probe may compound a slot with the tag that owns it. Must sit after the plain forms above.
  ['tag + slot', /^([a-z]+)\[data-slot='([^']+)'\]$/, ([, tag, slot]) => node =>
    node.tagName === tag.toUpperCase() && node.getAttribute('data-slot') === slot],
  ['tag + attribute', /^([a-z]+)\[([a-z-]+)\]$/, ([, tag, name]) => node => node.tagName === tag.toUpperCase() && node.hasAttribute(name)],
  ['single quote', /^\[([a-z-]+)='([^']*)'\]$/, ([, name, value]) => node => node.getAttribute(name) === value],
  ['double quote', /^\[([a-z-]+)="([^"]*)"\]$/, ([, name, value]) => node => node.getAttribute(name) === value],
  ['tree role', /^\[role='tree'\]$/, () => node => node.getAttribute('role') === 'tree'],
  ['slot', /^\[data-slot='([^']+)'\]$/, ([, slot]) => node => node.getAttribute('data-slot') === slot],
  ['style marker', /^style\[([a-z-]+)\]$/, ([, name]) => node => node.tagName === 'STYLE' && node.hasAttribute(name)],
  // `A B` descendant, used for tree-then-row. Both parts must be in the vocabulary above.
  ['descendant', /^\[([a-z-]+)\] (\[[^\]]+\])$/, ([, outer, inner]) => {
    const outerTest = matching(`[${outer}]`)
    const innerTest = matching(inner)
    return node => {
      if (!innerTest(node)) return false
      let cursor = node.parentElement
      while (cursor !== null) {
        if (outerTest(cursor)) return true
        cursor = cursor.parentElement
      }
      return false
    }
  }],
]

export function matching(selector) {
  for (const [label, pattern, build] of SELECTORS) {
    const hit = pattern.exec(selector)
    if (hit !== null) return build(hit)
  }
  throw Error(`fake-dom: selector not modelled: ${selector}`)
}

/* ------------------------------------------------------------------ fixture */

function el(tagName, attributes = {}, children = []) {
  const node = new FakeElement(tagName)
  for (const [name, value] of Object.entries(attributes)) node.attributes.set(name, value)
  for (const child of children) node.insertBefore(child, null)
  return node
}

/**
 * Build the corner of the sidebar the mount looks for:
 *
 *   sidebar[data-slot='sidebar.workspaces']
 *     div[role='tree']
 *       div[data-row-key='workspace:<id>']      a group header
 *       div[data-row-key='session:<id>']        its sessions
 *       div[data-row-key='overflow:<id>']       show-more control
 *     header                                     the 工作区 row
 *       h2                                      the label
 *       label > input                            the search slot (margin-left: auto)
 *       div[data-slot='sidebar.workspaces.directoryFlow']   what an entry is inserted before
 *
 * A group is folded unless `expanded` is true; folded groups render no session rows, which is
 * the case the mount has to open before a channel's view can be seen.
 */
export function createDom({ groups = [], expanded = [] } = {}) {
  const state = { dirtyCount: 0, dirty() {} }
  const observerBatches = []

  const body = new FakeElement('body')
  const tree = el('div', { role: 'tree' })
  const slot = el('div', { 'data-slot': 'sidebar.workspaces' })
  const header = el('div', {})
  const label = el('h2', {})
  label.textContent = '工作区'
  const marker = el('div', { 'data-slot': 'sidebar.workspaces.directoryFlow' })
  // The search slot is the marker's own child: the mount looks for it as a child holding an
  // input, and inserts each entry before the marker, so the slot has to live under it.
  const search = el('label', {}, [el('input', { type: 'search' })])
  marker.insertBefore(search, null)

  slot.insertBefore(tree, null)
  cell(slot)
  header.insertBefore(label, null)
  header.insertBefore(marker, null)
  const head = new FakeElement('head')
  body.insertBefore(head, null)
  slot.insertBefore(header, null)
  body.insertBefore(slot, null)

  const index = new Map()
  const rows = []

  function cell(parent) {
    const div = el('div')
    parent.insertBefore(div, null)
    return div
  }

  function addSession(id, channel, title) {
    const row = el('div', { 'data-row-key': `session:${id}` })
    // children[0] is the channel-logo slot, children[1] is the title cell the mount reads.
    cell(row)
    const titleCell = cell(row)
    titleCell.setAttribute('data-dsh-im-session-channel', channel)
    titleCell.textContent = title
    return row
  }

  for (const group of groups) {
    const row = el('div', { 'data-row-key': `workspace:${group.title}` })
    cell(row)
    const title = cell(row)
    title.textContent = group.title
    tree.insertBefore(row, null)
    rows.push(row)
    index.set(`workspace:${group.title}`, row)
    if (expanded.includes(group.title)) {
      for (const [channel, text] of group.sessions) {
        const session = addSession(`${group.title}:${text}`, channel, text)
        tree.insertBefore(session, null)
        rows.push(session)
        index.set(`session:${group.title}:${text}`, session)
      }
    }
  }
  // The overflow control a virtualised list puts in its last rendered row; the filter hides it
  // because it carries no tag, which is the sheet's rule and not the mount's business.
  const overflow = el('div', { 'data-row-key': 'overflow:0' })
  tree.insertBefore(overflow, null)
  index.set('overflow:0', overflow)

  const listeners = new Map()
  const document = {
    body,
    head,
    hidden: false,
    documentElement: body,
    querySelector: selector => body.querySelector(selector),
    querySelectorAll: selector => body.querySelectorAll(selector),
    createElement: tagName => {
      const node = new FakeElement(tagName)
      node.owner = state
      return node
    },
    addEventListener(name, fn) { listeners.set(name, fn) },
    removeEventListener(name) { listeners.delete(name) },
  }
  const window = {
    document,
    addEventListener(name, fn) { listeners.set(name, fn) },
    removeEventListener(name) { listeners.delete(name) },
  }
  const MutationObserverClass = class {
    constructor(fn) { this.fn = fn; this.observed = null; state.observer = this }
    observe(target, options) { this.observed = { target, options } }
    disconnect() { this.observed = null }
    emit(records) {
      if (this.observed === null) return
      observerBatches.push(records)
      this.fn(records)
    }
  }

  state.dirty = () => { state.dirtyCount += 1 }
  state.observer = null

  return {
    body, head, slot, tree, header, label, marker, search,
    document, window, state,
    MutationObserverClass,
    get observer() { return state.observer },
    index,
    row: key => index.get(key) ?? null,
    rows: () => rows,
    buttons: () => header.querySelectorAll('[data-eva-im-button]'),
    // The sheet is found from the furthest reachable root, which is where a document has it:
    // head before body, the way a page grows its own head.
    style: () => document.querySelector('style[data-dsh-im-workspace-buttons-sheet]'),
    listeners,
    observerBatches,
  }
}

/* ------------------------------------------------------------------ services */

/**
 * The client services the mount reads through `ctx.get`, in the shapes it reads them.
 *
 *   connection.rpc.call('/api', route, { method, payload })  -> Promise<{ ok, value }>
 *   sessions.list.getSnapshot() -> { byId: { [id]: { id, title, workspaceId } } }
 *   workspaces.list.getSnapshot() -> { items: [{ workspaceId, sessionIds }] }
 *   locale.register(ns, dict) / locale.bind(ns) -> (key) => string / locale.subscribe(fn)
 *
 * `answers` maps a channel id to the status value its route resolves with, or to a rejecting
 * sentinel -- so a test says "weixin holds an account, feishu does not, the rest do not
 * answer" in one line.
 */
export function createServices({ answers = {}, sessions = {}, items = [], language = 'zh' } = {}) {
  const asked = []
  const subscriptions = []
  const live = { ...answers }
  const rpc = {
    call(root, route, body) {
      asked.push({ root, route, method: body?.method, payload: body?.payload })
      const channel = route.replace(/^dsh-im\//, '')
      return new Promise((resolve, reject) => {
        const answer = live[channel]
        if (answer === 'throw') throw Error('route threw')
        if (answer === 'reject') reject(Error('route down'))
        // Undefined is the "nothing answered" case the mount has to treat as "not yet": it
        // arrives as a shape the mount cannot read, not as a boolean false.
        else resolve(answer === undefined ? { ok: true, value: { unmatched: true } } : { ok: true, value: answer })
      })
    },
  }
  const dicts = new Map()
  const locale = {
    register(ns, dict) {
      if (dicts.has(ns)) return
      dicts.set(ns, dict)
    },
    bind(ns) {
      // A translator last looks its namespace up at call time, which is what the real service
      // does: a dictionary registered after the bind is still found.
      return key => dicts.get(ns)?.[language]?.[key]
    },
    subscribe(fn) {
      subscriptions.push(fn)
      return () => subscriptions.splice(subscriptions.indexOf(fn), 1)
    },
  }
  const sessionsList = {
    subscribe(fn) {
      subscriptions.push(fn)
      return () => subscriptions.splice(subscriptions.indexOf(fn), 1)
    },
    getSnapshot() {
      const byId = {}
      for (const [id, value] of Object.entries(sessions)) {
        byId[id] = { id, ...value }
      }
      return { byId }
    },
  }
  const workspacesList = { getSnapshot: () => ({ items }) }
  return {
    asked,
    dicts,
    subscriptions,
    /** Change what a channel's route answers with from now on, as binding an account would. */
    answer(channel, value) { live[channel] = value },
    services: {
      theme: {},
      locale,
      uiSession: {},
      connection: { rpc },
      sessions: { list: sessionsList },
      workspaces: { list: workspacesList },
    },
  }
}  // A slot holding a control is matched by a descendant step ('[data-slot] input'), so a
  // compound tag+slot selector has to resolve to the slot itself. Production code uses
  // '[data-slot] input' nowhere; this exists for the probe below.

