import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const CONTENT_HOOK = "useOverlayInteractionScopeContentAttributes"

const overlayAdapters = [
	{ file: "context-menu.tsx", minimumHookReferences: 3 },
	{ file: "dialog.tsx", minimumHookReferences: 2 },
	{ file: "drawer.tsx", minimumHookReferences: 2 },
	{ file: "dropdown-menu.tsx", minimumHookReferences: 3 },
	{ file: "popover.tsx", minimumHookReferences: 2 },
	{ file: "select.tsx", minimumHookReferences: 2 },
]

describe("overlay interaction scope adapters", () => {
	it.each(overlayAdapters)(
		"marks content nodes in $file with the shared interaction protocol",
		async ({ file, minimumHookReferences }) => {
			const source = await readFile(
				resolve(process.cwd(), "src/components/shadcn-ui", file),
				"utf8",
			)
			const hookReferences = source.split(CONTENT_HOOK).length - 1

			expect(hookReferences).toBeGreaterThanOrEqual(minimumHookReferences)
		},
	)

	it("does not depend on component-specific data-slot selectors", async () => {
		const source = await readFile(
			resolve(process.cwd(), "src/components/shadcn-ui/overlay-interaction-scope.tsx"),
			"utf8",
		)

		expect(source).toContain(
			'const OVERLAY_CONTENT_ATTRIBUTE = "data-overlay-interaction-content"',
		)
		expect(source).not.toContain("OVERLAY_CONTENT_SELECTOR")
		expect(source).not.toContain("data-slot=")
	})
})
