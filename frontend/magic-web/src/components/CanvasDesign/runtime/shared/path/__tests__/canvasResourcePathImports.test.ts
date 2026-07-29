import { describe, expect, it } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const testFileDir = path.dirname(fileURLToPath(import.meta.url))
const canvasRootDir = path.resolve(testFileDir, "..", "..", "..", "..")
const canvasResourcePathFacadeFile = path.join(
	canvasRootDir,
	"runtime",
	"shared",
	"path",
	"canvasResourcePath.ts",
)

function walkFiles(dir: string): string[] {
	const results: string[] = []
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const fullPath = path.join(dir, entry.name)
		if (entry.isDirectory()) {
			results.push(...walkFiles(fullPath))
			continue
		}
		results.push(fullPath)
	}
	return results
}

function readText(filePath: string): string {
	return fs.readFileSync(filePath, "utf8")
}

describe("canvas resource path import scan", () => {
	it("keeps CanvasDesign production code on the canvasResourcePath facade", () => {
		const files = walkFiles(canvasRootDir).filter((filePath) => {
			if (!/\.(ts|tsx)$/.test(filePath)) return false
			if (filePath.includes("__tests__")) return false
			return filePath !== canvasResourcePathFacadeFile
		})

		const forbiddenImportPattern =
			/from\s+["'][^"']*(?:pathUtils|runtime\/shared\/path\/internal|shared\/path\/internal|\/path\/internal|\.\/internal\/pathPrimitives|\.\.\/internal\/pathPrimitives)[^"']*["']/
		const offenders = files.filter((filePath) =>
			forbiddenImportPattern.test(readText(filePath)),
		)

		expect(offenders).toEqual([])
	})
})
