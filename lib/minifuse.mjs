// ESM entry — re-exports the CJS implementation as named bindings.
import minifuse from "./minifuse.cjs"

export const { parseFlags, loadConfig, readStdin, parseStdinJson, merge } = minifuse
export { minifuse }
export default minifuse
