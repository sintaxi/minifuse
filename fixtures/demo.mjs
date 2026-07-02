// Fixture bin for end-to-end tests: the one-step golden path.
import minifuse from "minifuse"

const argv = await minifuse(process.argv.slice(2), {
  string: ["port", "host", "log-level"],
  alias: { p: "port", h: "host", l: "log-level" },
  defaults: { port: 3000, host: "0.0.0.0", logLevel: "info" },
  help: "Usage: demo [--port n] [--host h] [--log-level l]",
  map: (f) => ({
    port: f.port !== undefined ? Number(f.port) : undefined,
    host: f.host,
    logLevel: f["log-level"]
  })
})

console.log(JSON.stringify(argv))
