import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

describe("widget public build path", () => {
	it("keeps the public output directory owned by the root project scripts", () => {
		const rootPackageJsonPath = resolve(__dirname, "../../../package.json")
		const packageJsonPath = resolve(__dirname, "../package.json")
		const rootPackageJson = JSON.parse(readFileSync(rootPackageJsonPath, "utf8")) as {
			scripts: Record<string, string>
		}
		const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
			scripts: Record<string, string>
		}

		expect(rootPackageJson.scripts["build:widget"]).toContain("--outDir ../../public/sdk")
		expect(rootPackageJson.scripts["dev:widget"]).toContain("--outDir ../../public/sdk")
		expect(packageJson.scripts["build:public"]).not.toContain("--outDir")
		expect(packageJson.scripts["dev:public"]).not.toContain("--outDir")
		expect(packageJson.scripts).not.toHaveProperty("clean:public")
		expect(packageJson.scripts["build:public"]).not.toContain("clean:public")
		expect(packageJson.scripts["dev:public"]).not.toContain("clean:public")
	})

	it("does not emit a public source map for the stable UMD file", () => {
		const viteConfig = readFileSync(resolve(__dirname, "../vite.config.ts"), "utf8")

		expect(viteConfig).toContain("sourcemap: false")
		expect(viteConfig).not.toContain("sourcemap: true")
	})
})
