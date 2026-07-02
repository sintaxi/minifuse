# minifuse

Pipe a JSON config object on stdin and override pieces with CLI flags. A
[minimist](https://www.npmjs.com/package/minimist) superset for services that
take their configuration as a pipe:

```
cat config.json | myservice --port 8080
ssh ops@host service-config | myservice
```

**Precedence (low → high): built-in defaults → stdin JSON → CLI flags.**
No environment variables are consulted, ever.

Works from both ESM and CJS.

```js
import minifuse from "minifuse"        // ESM
const minifuse = require("minifuse")   // CJS
```

## Usage

One call, minimist's signature — parse your CLI's args exactly as minimist
would, fused with whatever JSON object is piped on stdin:

```js
#!/usr/bin/env node
import minifuse from "minifuse"

const argv = await minifuse(process.argv.slice(2))
console.log(argv)
```

```
$ ./mycli -x 3 -y 4 --name=beep
{ _: [], x: 3, y: 4, name: "beep" }

$ echo '{"name":"boop","level":2}' | ./mycli -x 3
{ name: "boop", level: 2, _: [], x: 3 }
```

`opts` is a superset of minimist's options — `string`, `boolean`, `alias`,
etc. pass straight through to minimist. The minifuse-specific keys layer in
defaults, help text, flag mapping, and validation as the CLI grows:

```js
#!/usr/bin/env node
import minifuse from "minifuse"

const argv = await minifuse(process.argv.slice(2), {
  string: ["port", "host", "log-level"],
  alias: { p: "port", h: "host", l: "log-level" },
  defaults: { port: 3000, host: "0.0.0.0", logLevel: "info" },
  help: `Usage: myservice [--port n] [--host h] [--log-level l]`,
  map: (f) => ({
    port: f.port !== undefined ? Number(f.port) : undefined,
    host: f.host,
    logLevel: f["log-level"]
  }),
  validate: (c) => {
    if (!c.staff?.secretKey) throw new Error("staff.secretKey is required")
  }
})

startServer(argv)
```

## API

### `minifuse(argv, opts?)` (default export)

The one-step entrypoint for bins. Guarantees the ordering: parse flags →
print `help` and **exit the process** on `--help` (before the pipe is read) →
read stdin → merge `defaults < stdin < map(flags)` → `validate` → return
config.

minifuse-specific keys in `opts`:

- `defaults` — object merged in at lowest precedence (default `{}`)
- `map(flags)` — selects and renames the flags that reach the config (e.g.
  `log-level` → `logLevel`, string → number coercion). Return `undefined` for
  absent flags and they are skipped, never clobbering stdin or defaults.
  Default: everything minimist produced passes through, `_` and `--`
  included. Service-style bins that want a pure config object use `map` as
  the allowlist.
- `help` — usage text; when set, `--help` prints it and exits 0 without
  touching stdin (and `help` is auto-registered as a boolean flag)
- `validate(config)` — called with the merged config; throw to reject it
- `readInput` — injectable async stdin reader for tests

All other keys go to minimist — except `default`, which is **rejected**:
minimist-level flag defaults surface as flags, the highest-precedence layer,
so they would silently override piped config. Config defaults belong in
`defaults`.

Because `minifuse()` exits the process on `--help`, it is for bin
entrypoints only. Everything it composes is exported for direct use:

### `parseFlags(argv, options)`

Straight passthrough to `minimist(argv, options)`. Use with `loadConfig` when
you need the flags object itself or custom help behavior.

### `loadConfig(flags, options?)`

Reads stdin, merges `defaults < stdin < map(flags)`, validates, returns the
config object. Takes `defaults`, `map`, `validate`, `readInput` as above.
Never prints or exits.

### `merge(base, override)`

Deep merge for plain objects. Arrays and scalars replace wholesale.
`undefined` override values are skipped; explicit `null` overrides.

### `parseStdinJson(raw)`

- empty / whitespace-only → `{}` (piped config is optional)
- malformed JSON → throws `stdin config must be valid JSON: <detail>`
- valid JSON that is not a plain object → throws
  `stdin config must be a JSON object`

### `readStdin(stream?)`

Reads the stream to EOF as utf8. Returns `""` immediately when the stream is
a TTY, so running interactively never hangs on a read.

## Behavior notes

- Secrets and structural config belong on stdin; CLI flags are for server
  knobs. `map` is the allowlist that enforces this.
- Absent flags map to `undefined` and are skipped by the merge — passing no
  flags changes nothing.
- Explicit `null` in stdin JSON deliberately clears a default.

## Test

```
npm test
```
