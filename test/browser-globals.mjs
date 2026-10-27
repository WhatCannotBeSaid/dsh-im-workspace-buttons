/**
 * The test harness's browser global.
 *
 * src/runtime.js is written for a page: it reaches for `document`, `MutationObserver` and
 * `window` as globals, which is what lets the shipped copy run in a loader sandbox without a
 * single import. Node has none of these, so this module installs a fake on globalThis before
 * the mount is imported. `src/runtime.js` must therefore be imported dynamically, after this
 * file — which is why every test file imports this one first.
 */
export const globals = {}
export let dom = null

/**
 * The mount schedules its click loop with requestAnimationFrame, and Node has neither that
 * nor requestIdleCallback. Without a stand-in the call throws inside the click handler --
 * and, because the handler that throws is the button's own listener, the press looks
 * handled while nothing is scheduled any more. These two stand-ins run one frame later on
 * the macrotask queue, so a test's flush() sees the frame it is waiting for.
 */
if (globals.requestAnimationFrame === undefined) {
  let nextFrame = 1
  const frames = new Map()
  globals.requestAnimationFrame = (fn) => {
    const id = nextFrame++
    frames.set(id, fn)
    setImmediate(() => {
      const run = frames.get(id)
      if (run === undefined) return
      frames.delete(id)
      run(0)
    })
    return id
  }
  globals.cancelAnimationFrame = (id) => { frames.delete(id) }
  globals.requestIdleCallback = (fn) => {
    setImmediate(() => fn({ didTimeout: false, timeRemaining: () => 50 }))
    return 1
  }
  globals.cancelIdleCallback = () => {}
}

if (globals.document === undefined) {
  const { createDom } = await import('./fake-dom.mjs')
  dom = createDom({ groups: [], expanded: [] })
  globals.document = dom.document
  globals.window = dom.window
  globals.MutationObserver = dom.MutationObserverClass
  Object.assign(globalThis, globals)
}

/** Point the page globals at another fixture for the rest of this call and its async work. */
export function use(dom) {
  globalThis.document = dom.document
  globalThis.window = dom.window
  globalThis.MutationObserver = dom.MutationObserverClass
  return dom
}
