import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

describe("sidebar menu active feedback", () => {
	it("keeps touch click feedback neutral while preserving data-active selection styling", async () => {
		const source = await readFile(
			resolve(process.cwd(), "src/components/shadcn-ui/sidebar.tsx"),
			"utf8",
		)

		// Touch devices should not show a transient active or WebKit tap-highlight background after tapping sidebar rows.
		expect(source).not.toContain("active:bg-sidebar-accent")
		expect(source).toContain("[-webkit-tap-highlight-color:transparent]")
		expect(source).toContain("data-[active=true]:bg-sidebar-accent")
	})

	it("uses Tailwind hover capability gating instead of a duplicate has-hover variant", async () => {
		const source = await readFile(
			resolve(process.cwd(), "src/components/shadcn-ui/sidebar.tsx"),
			"utf8",
		)
		const tailwindConfig = await readFile(resolve(process.cwd(), "tailwind.config.js"), "utf8")

		// Tailwind wraps hover, group-hover, and peer-hover with input-capability media queries.
		expect(tailwindConfig).toContain("hoverOnlyWhenSupported: true")
		expect(tailwindConfig).not.toContain('addVariant("has-hover"')
		expect(source).not.toContain("has-hover:")
	})

	it("overrides antd anchor hover color on coarse touch sidebar links", async () => {
		const source = await readFile(
			resolve(process.cwd(), "src/components/shadcn-ui/sidebar.tsx"),
			"utf8",
		)

		// Antd injects a global a:hover link color; sidebar anchors neutralize it on iPad touch layouts.
		expect(source).toContain(
			"no-hover:[&:not([data-active=true]):hover]:!text-sidebar-foreground",
		)
	})
})
