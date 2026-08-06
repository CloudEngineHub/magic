import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

describe("share topic message scroll padding", () => {
	it("masks scrolling rows while preserving the viewport top padding", async () => {
		const source = await readFile(resolve(__dirname, "../components/Topic/index.tsx"), "utf8")
		expect(source).toContain(
			'viewportClassName="p-2.5 max-md:pt-[calc(60px+var(--safe-area-inset-top,env(safe-area-inset-top)))]"',
		)
		expect(source).toContain("absolute inset-x-0 top-0 z-10 h-2.5")
		expect(source.match(/SHARE_MESSAGE_TOP_MASK_CLASS_NAME/g)).toHaveLength(2)
	})
})
