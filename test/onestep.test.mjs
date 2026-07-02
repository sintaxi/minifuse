import { test } from "node:test"
import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { fileURLToPath } from "node:url"
import minifuse from "minifuse"

const run = promisify(execFile)
// Lives outside test/ — node --test would otherwise execute it as a test file
// and hang awaiting stdin.
const FIXTURE = fileURLToPath(new URL("../fixtures/demo.mjs", import.meta.url))

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

test("declared booleans the user never passed do not clobber stdin config", async () => {
  const config = await minifuse([], { boolean: ["dev"], readInput: stdin({ dev: true }) })
  assert.equal(config.dev, true)
})

test("explicitly passed booleans still win: --dev, --no-dev, and short aliases", async () => {
  const on = await minifuse(["--dev"], { boolean: ["dev"], readInput: stdin({ dev: false }) })
  assert.equal(on.dev, true)

  const off = await minifuse(["--no-dev"], { boolean: ["dev"], readInput: stdin({ dev: true }) })
  assert.equal(off.dev, false)

  const short = await minifuse(["-d"], { boolean: ["dev"], alias: { d: "dev" }, readInput: stdin({ dev: false }) })
  assert.equal(short.dev, true)
  assert.equal(short.d, true)
})

test("booleans after a bare -- are positionals, not flags", async () => {
  const config = await minifuse(["--", "--dev"], { boolean: ["dev"], readInput: stdin({ dev: true }) })
  assert.equal(config.dev, true)
  assert.deepEqual(config._, ["--dev"])
})

test("help option never leaks a phantom help:false into the config", async () => {
  const config = await minifuse([], {
    help: "usage",
    readInput: stdin({ help: "https://docs.example" })
  })
  assert.equal(config.help, "https://docs.example")

  const bare = await minifuse([], { help: "usage", readInput: stdin() })
  assert.equal("help" in bare, false)
})

test("fixture: --help prints usage and exits 0 without reading stdin", async () => {
  const { stdout } = await run(process.execPath, [FIXTURE, "--help"])
  assert.match(stdout, /Usage: demo/)
})

test("fixture: --help output larger than a pipe buffer is fully flushed", async () => {
  const bighelp = fileURLToPath(new URL("../fixtures/bighelp.mjs", import.meta.url))
  const { stdout } = await run(process.execPath, [bighelp, "--help"], { maxBuffer: 2 * 1024 * 1024 })
  assert.equal(stdout.length, 512 * 1024 + 1) // help + trailing newline
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
