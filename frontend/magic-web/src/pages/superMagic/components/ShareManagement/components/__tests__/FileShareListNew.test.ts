import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

describe("FileShareListNew edit modal contract", () => {
	it("passes project name into the edit modal", async () => {
		const source = await readFile(resolve(__dirname, "../FileShareListNew.tsx"), "utf8")

		// Recording share names are generated from projectName, so edit mode must keep this context.
		expect(source).toContain("projectName={selectedItem.project_name}")
	})
})
