// minifuse — pipe a JSON config object in, override pieces on the command line.
//
// Precedence (low → high): built-in defaults, stdin JSON object, CLI flags.
// No environment variables are consulted anywhere.

"use strict"

const minimist = require("minimist")

// minimist passthrough. Parse argv before reading stdin so a --help flag can
// exit without consuming the pipe.
function parseFlags(argv, options) {
  return minimist(argv, options)
}

async function readStdin(stream = process.stdin) {
  if (stream.isTTY) return ""
  let data = ""
  stream.setEncoding("utf8")
  for await (const chunk of stream) data += chunk
  return data
}

function parseStdinJson(raw) {
  const trimmed = String(raw ?? "").trim()
  if (!trimmed) return {}
  let parsed
  try {
    parsed = JSON.parse(trimmed)
  } catch (e) {
    throw new Error("stdin config must be valid JSON: " + e.message)
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("stdin config must be a JSON object")
  }
  return parsed
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

// "__proto__" as an own key (JSON.parse creates one) becomes a prototype set
// when assigned with out[key] = value — piped JSON must never reach that.
const UNSAFE_KEYS = new Set(["__proto__"])

// Deep copy, dropping unsafe keys and `undefined` values along the way. The
// merge result must not alias its inputs: callers reuse their defaults object
// across calls and may mutate the returned config.
function copy(value) {
  if (Array.isArray(value)) return value.map(copy)
  if (!isObject(value)) return value
  const out = {}
  for (const [key, entry] of Object.entries(value)) {
    if (entry === undefined || UNSAFE_KEYS.has(key)) continue
    out[key] = copy(entry)
  }
  return out
}

// Deep merge for plain objects; arrays and scalars replace wholesale.
// `undefined` overrides are skipped so absent CLI flags never clobber a base
// value; explicit `null` does override.
function merge(base, override) {
  if (!isObject(override)) return override === undefined ? copy(base) : copy(override)
  if (!isObject(base)) return copy(override)

  const out = copy(base)
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined || UNSAFE_KEYS.has(key)) continue
    out[key] = isObject(value) && isObject(out[key]) ? merge(out[key], value) : copy(value)
  }
  return out
}

// Compose the config: defaults < stdin JSON < mapped CLI flags. Without a
// caller-supplied map, everything minimist produced passes through — `_` and
// `--` included, as minimist users expect. Callers wanting an allowlist or
// kebab→camel renames supply `map`.
//   map        selects/renames the flags that reach the config
//   validate   throws if the merged config is unacceptable
//   readInput  injectable stdin reader for tests
async function loadConfig(flags = {}, { defaults = {}, map = (f) => f, validate, readInput = readStdin } = {}) {
  const stdin = parseStdinJson(await readInput())
  const config = merge(merge(defaults, stdin), map(flags))
  if (validate) await validate(config)
  return config
}

// Make sure --help parses as a boolean even if the caller didn't list it.
function withHelpFlag(flagOpts) {
  const bool = flagOpts.boolean
  if (bool === true) return flagOpts
  const list = bool === undefined ? [] : Array.isArray(bool) ? bool : [bool]
  return list.includes("help") ? flagOpts : { ...flagOpts, boolean: [...list, "help"] }
}

// One-step entrypoint for bins: minimist's signature, opts is a superset of
// minimist's. Owns the ordering guarantee — parse flags, print `help` and exit
// on --help before the pipe is read, then read stdin, merge, validate.
//
// Exits the process on --help; library callers wanting the flags object or
// no-exit behavior use parseFlags + loadConfig directly.
async function minifuse(argv, opts = {}) {
  const { defaults, map, validate, help, readInput, ...flagOpts } = opts
  if ("default" in flagOpts) {
    throw new Error("minimist `default` is not supported: flag defaults outrank piped config — use `defaults` instead")
  }

  const flags = parseFlags(argv, help === undefined ? flagOpts : withHelpFlag(flagOpts))
  if (help !== undefined && flags.help) {
    console.log(help)
    process.exit(0)
  }

  return loadConfig(flags, { defaults, map, validate, readInput })
}

module.exports = minifuse
Object.assign(module.exports, { minifuse, parseFlags, loadConfig, readStdin, parseStdinJson, merge })
