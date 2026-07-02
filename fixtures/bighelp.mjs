// Fixture bin with help text far larger than a pipe buffer, to prove --help
// output is flushed before exit.
import minifuse from "minifuse"

await minifuse(process.argv.slice(2), {
  help: "x".repeat(512 * 1024),
  readInput: async () => ""
})
