/**
 * Regenerate client.js's runtime section from src/runtime.js, or check that it is current.
 *
 * Why a copy at all: the client module loader evaluates a plugin's browser file as a
 * classic script, so client.js is one entry with no module graph and cannot import
 * src/runtime.js. The source therefore stays a real ES module (it exports the mount, so a
 * test can import it) and the build inlines it, exactly the way the theme's build inlines
 * `src/runtime/*.js` into its generated client.js.
 *
 * The two markers in client.js are the contract:
 *
 *   `// @@RUNTIME@@`            the line the copy is written to
 *   `/* ---- runtime: ...`      the opener the copy replaces up to
 *   `/* ---- end runtime ---- *\/`
 *
 * Between them sits one line holding src/runtime.js verbatim, six-space indented to match
 * the factory body:
 *
 *   conversion: `^export ` is dropped from the one export line, so the module and the
 *   inline copy declare the SAME function (`export function mountWorkspaceButtons` becomes
 *   `function mountWorkspaceButtons`). Nothing else is touched — no wrapping, no
 *   re-indenting beyond the six spaces, no comment stripping.
 *
 * Usage:
 *   node tools/build-client.mjs            # write client.js from src/runtime.js
 *   node tools/build-client.mjs --check    # exit 1 if client.js is stale
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = join(ROOT, 'src', 'runtime.js')
const TARGET = join(ROOT, 'client.js')
const OPEN = '    // @@RUNTIME@@'
const CLOSE = '    /* ---- end runtime ---- */'

const EXPORT = /^export (?=function |const |let |var |class |async )/gm
const MARKER_MARK = '// @@RUNTIME@@'

export function inline(source) {
  // `export ` is dropped only where it is followed by a declaration keyword, so this file's
  // own contract text (the marker example above) cannot be mistaken for a line to edit.
  const body = source.replace(/\r\n/g, '\n').replace(EXPORT, '')
  if (/^\s*export /m.test(body)) throw Error('src/runtime.js has an export this build does not handle.')
  return body
    .split('\n')
    .map(line => (line === '' ? '' : '      ' + line))
    .join('\n')
}

export function render(clientJs, source) {
  const start = clientJs.indexOf(OPEN)
  const end = clientJs.indexOf(CLOSE)
  if (start < 0 || end < 0 || end < start) {
    throw Error(`client.js is missing its runtime markers (${OPEN} / ${CLOSE}).`)
  }
  const head = clientJs.slice(0, start + OPEN.length)
  const tail = clientJs.slice(end)
  return head + '\n' + inline(source) + '\n' + tail
}

function main(args) {
  const check = args.includes('--check')
  const source = readFileSync(SOURCE, 'utf8')
  const current = readFileSync(TARGET, 'utf8')
  const next = render(current, source)
  if (check) {
    if (next !== current) {
      console.error('client.js is stale: run `node tools/build-client.mjs`.')
      process.exit(1)
    }
    console.log('client.js runtime section is current.')
    return
  }
  if (next !== current) writeFileSync(TARGET, next)
  console.log(next === current ? 'client.js already current.' : 'client.js rewritten from src/runtime.js.')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2))
