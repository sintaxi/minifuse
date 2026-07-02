import { test } from "node:test"
import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import minifuse from "minifuse"

const run = promisify(execFile)
// Lives outside test/ — node --test would otherwise execute it as a test file
// and hang awaiting stdin.
const FIXTURE = new URL("../fixtures/demo.mjs", import.meta.url).pathname

const stdin = (value) => async () => value === undefined ? "" : JSON.stringify(value)

test("one-step call parses flags and merges in one go", async () => {
  const config = await minifuse(["--port", "4000"], {
    string: ["port"],
    defaults: { port: 3000, host: "0.0.0.0" },
    map: (f) => ({ port: f.port !== undefined ? Number(f.port) : undefined }),
    readInput: stdin({ host: "10.0.0.1" })
  })
  assert.deepEqual(config, { port: 4000, host: "10.0.0.1" })
})

test("one-step call rejects minimist `default` to protect precedence", async () => {
  await assert.rejects(
    () => minifuse([], { default: { port: 9999 }, readInput: stdin() }),
    /minimist `default` is not supported/
  )
})

test("one-step call without help option leaves --help as an ordinary flag", async () => {
  const config = await minifuse(["--help"], { readInput: stdin() })
  assert.deepEqual(config, { _: [], help: true })
})

test("fixture: --help prints usage and exits 0 without reading stdin", async () => {
  const { stdout } = await run(process.execPath, [FIXTURE, "--help"])
  assert.match(stdout, /Usage: demo/)
})

test("fixture: defaults < piped stdin < flags over a real pipe", async () => {
  const child = run(process.execPath, [FIXTURE, "--port", "4000"])
  child.child.stdin.end(JSON.stringify({ port: 3500, logLevel: "debug" }))
  const { stdout } = await child
  assert.deepEqual(JSON.parse(stdout), { port: 4000, host: "0.0.0.0", logLevel: "debug" })
})

test("fixture: no flags, no pipe content yields the defaults", async () => {
  const child = run(process.execPath, [FIXTURE])
  child.child.stdin.end()
  const { stdout } = await child
  assert.deepEqual(JSON.parse(stdout), { port: 3000, host: "0.0.0.0", logLevel: "info" })
})

test("fixture: malformed piped JSON fails loudly", async () => {
  const child = run(process.execPath, [FIXTURE])
  child.child.stdin.end("{nope")
  await assert.rejects(child, /stdin config must be valid JSON/)
})
