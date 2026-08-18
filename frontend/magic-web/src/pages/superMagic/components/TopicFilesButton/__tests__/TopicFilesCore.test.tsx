import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Verifies that TopicFilesCore now keys touch-visible file actions off no-hover input capability.
 */
async function readTopicFilesCoreSource() {
	return readFile(resolve(__dirname, "../TopicFilesCore.tsx"), "utf8")
}

describe("TopicFilesCore", () => {
	it("uses no-hover input capability for inline file actions", async () => {
		const source = await readTopicFilesCoreSource()

		expect(source).toContain("isNoHoverCoarsePointer")
		expect(source).toContain(
			"const shouldShowInlineFileAction = isMobile || isNoHoverCoarsePointer()",
		)
		expect(source).not.toContain("isMobile || isMagicApp")
	})

	it("keeps inline action visibility bound to the shared row action class", async () => {
		const source = await readTopicFilesCoreSource()

		expect(source).toContain('"file-item-action-visible"')
		expect(source).toContain("(contextMenuItemId === itemId || shouldShowInlineFileAction) &&")
	})

	it("does not require a preloaded project list for cross-project moves", async () => {
		const source = await readTopicFilesCoreSource()

		expect(source).toContain("capabilities.crossProject && !isChatProject && !isMobile")
		expect(source).not.toContain("capabilities.crossProject && projects.length > 0")
	})
})
