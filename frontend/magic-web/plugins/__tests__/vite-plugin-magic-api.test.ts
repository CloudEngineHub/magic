import { TextDecoder, TextEncoder } from "node:util"
import vitePluginMagicApi from "../vite-plugin-magic-api"

const originalTextDecoder = globalThis.TextDecoder
const originalTextEncoder = globalThis.TextEncoder
const originalUint8Array = globalThis.Uint8Array

describe("vitePluginMagicApi", () => {
	afterEach(() => {
		Object.assign(globalThis, {
			TextDecoder: originalTextDecoder,
			TextEncoder: originalTextEncoder,
			Uint8Array: originalUint8Array,
		})
	})

	it("builds the prelude without requiring html-sandbox dist files", async () => {
		const encodedTextConstructor = new TextEncoder().encode("").constructor
		Object.assign(globalThis, {
			TextDecoder,
			TextEncoder,
			Uint8Array: encodedTextConstructor,
		})

		const plugin = vitePluginMagicApi({ projectRoot: process.cwd() })

		if (!("resolveId" in plugin) || typeof plugin.resolveId !== "function") {
			throw new Error("resolveId hook is required")
		}
		if (!("load" in plugin) || typeof plugin.load !== "function") {
			throw new Error("load hook is required")
		}

		const resolvedId = await plugin.resolveId.call(
			{} as never,
			"virtual:magic-api",
			undefined,
			{} as never,
		)

		expect(resolvedId).toBe("\0virtual:magic-api")

		const loaded = await plugin.load.call({} as never, resolvedId as string, {} as never)
		expect(String(loaded)).toContain("export default")
		expect(String(loaded)).toContain("MAGIC_API_PRELUDE_ERROR")
		expect(String(loaded)).not.toContain("@dtyq/html-sandbox/utils/parentOrigin")
	})
})
