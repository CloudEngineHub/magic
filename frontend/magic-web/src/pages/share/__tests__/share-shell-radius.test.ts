import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

describe("share shell radius", () => {
	it("clips the desktop share shell bottom corners while keeping document-flow capture unchanged", async () => {
		const source = await readFile(resolve(__dirname, "../index.tsx"), "utf8")

		expect(source).toContain("shareDisplayOptions.documentFlowFullscreen")
		expect(source).toContain('"rounded-b-[5px] max-md:rounded-none"')
	})
})
