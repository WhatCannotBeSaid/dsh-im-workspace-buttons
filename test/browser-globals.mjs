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
