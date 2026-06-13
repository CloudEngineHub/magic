import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const dirname = path.dirname(fileURLToPath(import.meta.url))

function countFileLines(relativePath: string): number {
	const filePath = path.resolve(dirname, relativePath)
	const content = fs.readFileSync(filePath, "utf8")
	return content.split(/\r?\n/).length
}

describe("SelfMediaHomePage structure", () => {
	it("keeps the main homepage orchestration file below the local 500-line split threshold", () => {
		expect(countFileLines("../components/SelfMediaHomePage.tsx")).toBeLessThanOrEqual(500)
	})
})
