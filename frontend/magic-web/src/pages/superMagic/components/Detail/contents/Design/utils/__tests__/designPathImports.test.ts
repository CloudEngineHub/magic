import { describe, expect, it } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const testFileDir = path.dirname(fileURLToPath(import.meta.url))
const designRootDir = path.resolve(testFileDir, "..", "..")
const messageEditorRootDir = path.resolve(designRootDir, "..", "..", "..", "MessageEditor")
const designPathFacadeFile = path.join(designRootDir, "utils", "designPath.ts")

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

describe("design path import scan", () => {
	it("keeps production code on the designPath facade", () => {
		const files = [...walkFiles(designRootDir), ...walkFiles(messageEditorRootDir)].filter(
			(filePath) => {
				if (!/\.(ts|tsx)$/.test(filePath)) return false
				if (filePath.includes("__tests__")) return false
				return filePath !== designPathFacadeFile
			},
		)

		const offenders = files.filter((filePath) =>
			readText(filePath).match(
				/from\s+["'][^"']*(designDslPathUtils|designAttachmentPathLookup|designPathPrimitives|designAttachmentLookup|components\/CanvasDesign\/runtime\/shared\/path\/(?:pathUtils|internal)|runtime\/shared\/path\/internal)["']/,
			),
		)

		expect(offenders).toEqual([])
	})

	it("does not add new production findFileBySrc call sites", () => {
		const files = [...walkFiles(designRootDir), ...walkFiles(messageEditorRootDir)].filter(
			(filePath) => {
				if (!/\.(ts|tsx)$/.test(filePath)) return false
				if (filePath.includes("__tests__")) return false
				return true
			},
		)

		const offenders = files.filter((filePath) => /findFileBySrc\s*\(/.test(readText(filePath)))
		expect(offenders).toEqual([])
	})
})
