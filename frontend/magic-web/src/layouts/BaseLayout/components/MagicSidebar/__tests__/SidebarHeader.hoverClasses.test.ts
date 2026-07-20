import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

describe("SidebarHeader hover capability classes", () => {
	it("keeps the collapsed expand action available on coarse pointer desktop layouts", async () => {
		const source = await readFile(
			resolve(
				process.cwd(),
				"src/layouts/BaseLayout/components/MagicSidebar/SidebarHeader.tsx",
			),
			"utf8",
		)

		// This source-level assertion avoids importing app stores while still protecting the iPad touch fallback.
		expect(source).toContain("no-hover:pointer-events-auto")
		expect(source).toContain("no-hover:opacity-100")
	})
})
