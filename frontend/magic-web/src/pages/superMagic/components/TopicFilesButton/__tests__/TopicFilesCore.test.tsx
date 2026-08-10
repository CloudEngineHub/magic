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

	it("uses the standard template detector and dedicated folder icon", async () => {
		const source = await readTopicFilesCoreSource()

		expect(source).toContain("isSlidesTemplateFolder(item)")
		expect(source).toContain("<SlidesTemplateFolderIcon size={16} />")
	})

	it("opens a standard template folder as a memory-only PPT template detail", async () => {
		const source = await readTopicFilesCoreSource()

		expect(source).toContain("toSlidesTemplatePreviewItem(item)")
		expect(source).toContain("type: DetailType.SlidesTemplate")
		expect(source).toContain("openSlidesTemplate(item)")
	})
})
