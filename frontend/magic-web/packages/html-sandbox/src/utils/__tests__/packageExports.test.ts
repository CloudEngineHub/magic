import { readFileSync } from "node:fs"
import { resolve } from "node:path"

interface PackageJson {
	exports?: Record<string, unknown>
}

describe("package exports", () => {
	it("exposes parentOrigin for external runtime plugins", () => {
		const packageJson = JSON.parse(
			readFileSync(resolve(process.cwd(), "package.json"), "utf8"),
		) as PackageJson

		expect(packageJson.exports?.["./utils/parentOrigin"]).toEqual({
			types: "./src/utils/parentOrigin.ts",
			import: "./dist/utils/parentOrigin.js",
		})
	})
})
