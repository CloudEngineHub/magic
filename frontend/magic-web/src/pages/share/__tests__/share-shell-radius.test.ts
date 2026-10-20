import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

describe("share playback bar radius", () => {
	it("rounds the desktop playback bar so its fixed white surface does not square off the page corners", async () => {
		const source = await readFile(resolve(__dirname, "../components/Topic/index.tsx"), "utf8")

		expect(source).toContain('data-testid="share-playback-controls"')
		expect(source).toContain("rounded-b-lg")
		expect(source).toContain("max-md:rounded-none")
	})
})
