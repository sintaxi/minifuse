import { test } from "node:test"
import assert from "node:assert/strict"
import minifuse, { parseFlags, loadConfig, parseStdinJson, merge } from "minifuse"

const stdin = (value) => async () => value === undefined ? "" : JSON.stringify(value)

test("esm entry exposes the callable default plus named parts", () => {
  assert.equal(typeof minifuse, "function")
  assert.equal(typeof parseFlags, "function")
  assert.equal(typeof loadConfig, "function")
  assert.equal(minifuse.loadConfig, loadConfig)
})

test("parseFlags parses via minimist with aliases and types", () => {
  const flags = parseFlags(["-p", "8080", "--log-level", "debug", "--dev"], {
    string: ["port", "log-level"],
    boolean: ["dev"],
    alias: { p: "port", l: "log-level" }
  })
  assert.equal(flags.port, "8080")
  assert.equal(flags["log-level"], "debug")
  assert.equal(flags.dev, true)
})

test("parseStdinJson treats empty and whitespace stdin as no config", () => {
  assert.deepEqual(parseStdinJson(""), {})
  assert.deepEqual(parseStdinJson("  \n"), {})
})

test("parseStdinJson throws on malformed JSON", () => {
  assert.throws(() => parseStdinJson("{nope"), /stdin config must be valid JSON/)
})

test("parseStdinJson throws on JSON that is not a plain object", () => {
  for (const bad of ["[1]", "null", '"str"', "42", "true"]) {
    assert.throws(() => parseStdinJson(bad), /stdin config must be a JSON object/)
  }
})

test("merge goes deep on plain objects", () => {
  const out = merge({ staff: { issuer: "a", scopes: ["x"] } }, { staff: { clientId: "b" } })
  assert.deepEqual(out, { staff: { issuer: "a", scopes: ["x"], clientId: "b" } })
})

test("merge replaces arrays and scalars wholesale", () => {
  assert.deepEqual(merge({ scopes: ["a", "b"] }, { scopes: ["c"] }), { scopes: ["c"] })
  assert.deepEqual(merge({ port: 3000 }, { port: 4000 }), { port: 4000 })
})

test("merge skips undefined overrides but honors explicit null", () => {
  assert.deepEqual(merge({ host: "0.0.0.0" }, { host: undefined }), { host: "0.0.0.0" })
  assert.deepEqual(merge({ host: "0.0.0.0" }, { host: null }), { host: null })
})

test("merge drops undefined keys in nested override objects too", () => {
  const out = merge({ db: "sqlite" }, { db: { host: undefined, port: 5432 } })
  assert.deepEqual(out, { db: { port: 5432 } })
  assert.equal("host" in out.db, false)
})

test("merge never assigns __proto__ keys from piped JSON", async () => {
  const config = await loadConfig({}, {
    defaults: { staff: { issuer: "a" } },
    readInput: async () => '{"staff":{"__proto__":{"secretKey":"evil","isAdmin":true}}}'
  })
  assert.equal(config.staff.secretKey, undefined)
  assert.equal(config.staff.isAdmin, undefined)
  assert.equal(Object.getPrototypeOf(config.staff), Object.prototype)
  assert.equal({}.isAdmin, undefined) // no global pollution either
})

test("merge does not alias its inputs", async () => {
  const defaults = { server: { host: "0.0.0.0" }, scopes: ["openid"] }
  const config = await loadConfig({}, { defaults, readInput: async () => "" })
  config.server.host = "clobbered"
  config.scopes.push("clobbered")
  assert.equal(defaults.server.host, "0.0.0.0")
  assert.deepEqual(defaults.scopes, ["openid"])
})

test("loadConfig applies defaults < stdin < flags precedence", async () => {
  const config = await loadConfig(
    { port: "4000", "log-level": undefined },
    {
      defaults: { port: 3000, host: "0.0.0.0", logLevel: "info" },
      map: (f) => ({
        port: f.port !== undefined ? Number(f.port) : undefined,
        host: f.host,
        logLevel: f["log-level"]
      }),
      readInput: stdin({ port: 3500, logLevel: "debug", staff: { issuer: "https://x" } })
    }
  )
  assert.equal(config.port, 4000) // flag beats stdin beats default
  assert.equal(config.logLevel, "debug") // stdin beats default; absent flag skipped
  assert.equal(config.host, "0.0.0.0") // default survives
  assert.equal(config.staff.issuer, "https://x") // stdin-only block passes through
})

test("loadConfig with empty stdin yields defaults plus flags", async () => {
  const config = await loadConfig({ host: "127.0.0.1" }, {
    defaults: { port: 3000, host: "0.0.0.0" },
    readInput: async () => ""
  })
  assert.deepEqual(config, { port: 3000, host: "127.0.0.1" })
})

test("loadConfig default map passes everything through, positionals included", async () => {
  const flags = parseFlags(["input.txt", "--port", "9000"], {})
  const config = await loadConfig(flags, { readInput: stdin() })
  assert.deepEqual(config, { _: ["input.txt"], port: 9000 })
})

test("loadConfig rejects on malformed stdin JSON", async () => {
  await assert.rejects(
    () => loadConfig({}, { readInput: async () => "{bad" }),
    /stdin config must be valid JSON/
  )
})

test("loadConfig runs the validate hook against the merged config", async () => {
  await assert.rejects(
    () => loadConfig({}, {
      readInput: stdin({ staff: {} }),
      validate: (c) => { if (!c.staff?.issuer) throw new Error("staff.issuer is required") }
    }),
    /staff\.issuer is required/
  )
})
