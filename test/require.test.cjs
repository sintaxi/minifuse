"use strict"

const { test } = require("node:test")
const assert = require("node:assert/strict")
const minifuse = require("minifuse")

test("the package manifest is resolvable through the exports map", () => {
  assert.equal(require("minifuse/package.json").name, "minifuse")
})

test("cjs require returns the callable one-step api with named parts attached", () => {
  assert.equal(typeof minifuse, "function")
  assert.deepEqual(
    Object.keys(minifuse).sort(),
    ["loadConfig", "merge", "minifuse", "parseFlags", "parseStdinJson", "readStdin"]
  )
})

test("cjs loadConfig merges defaults, stdin and flags", async () => {
  const config = await minifuse.loadConfig({ port: 4000 }, {
    defaults: { port: 3000, logLevel: "info" },
    readInput: async () => JSON.stringify({ logLevel: "debug" })
  })
  assert.deepEqual(config, { port: 4000, logLevel: "debug" })
})
