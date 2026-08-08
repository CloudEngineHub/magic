import { describe, expect, it } from "vitest"
import type { ImageElement, ImageElementContent } from "../types"
import {
	appendContent,
	createContentId,
	deleteActiveContent,
	getActiveContent,
	getContentById,
	getMainContent,
	setMainContent,
	switchActiveContent,
	updateContent,
} from "../elementContent"

function image(contents: ImageElementContent[]): ImageElement {
	return {
		id: "image-1",
		type: "image",
		activeContentId: contents[0]?.contentId ?? null,
		mainContentId: contents[0]?.contentId ?? null,
		contents,
	}
}

describe("elementContent", () => {
	it("queries active, main and explicit Contents", () => {
		const element = {
			...image([
				{ contentId: "c1", src: "one.png" },
				{ contentId: "c2", src: "two.png" },
			]),
			activeContentId: "c2",
			mainContentId: "c1",
		}
		expect(getActiveContent(element)?.contentId).toBe("c2")
		expect(getMainContent(element)?.contentId).toBe("c1")
		expect(getContentById(element, "c1")?.src).toBe("one.png")
	})

	it("updates, appends, switches and sets main without mutating input", () => {
		const original = image([{ contentId: "c1", src: "one.png", status: "completed" }])
		const updated = updateContent(original, "c1", { crop: { x: 1, y: 2, width: 3, height: 4 } })
		const appended = appendContent<ImageElement>(updated, {
			contentId: "c2",
			src: "two.png",
			status: "completed",
		} satisfies ImageElementContent)
		const active = switchActiveContent(appended, "c2")
		const main = setMainContent(active, "c2")

		expect(original.contents[0]).not.toHaveProperty("crop")
		expect(main.activeContentId).toBe("c2")
		expect(main.mainContentId).toBe("c2")
		expect(main.contents).toHaveLength(2)
	})

	it("rejects duplicate IDs and invalid pointer changes", () => {
		const element = image([{ contentId: "c1" }])
		expect(() => appendContent(element, { contentId: "c1" })).toThrow("Duplicate content")
		expect(switchActiveContent(element, "missing")).toBe(element)
		expect(setMainContent(element, "missing")).toBe(element)
	})

	it("deletes deterministically, repairs main and preserves the last Content", () => {
		const element = {
			...image([
				{ contentId: "c1", src: "one.png", status: "completed" },
				{ contentId: "c2", src: "two.png", status: "completed" },
			]),
			activeContentId: "c2",
			mainContentId: "c2",
		}
		const deleted = deleteActiveContent(element)
		expect(deleted?.deletedContent.contentId).toBe("c2")
		expect(deleted?.element.activeContentId).toBe("c1")
		expect(deleted?.element.mainContentId).toBe("c1")
		expect(deleteActiveContent(deleted?.element ?? element)).toBeNull()
	})

	it("creates namespaced Content IDs", () => {
		expect(createContentId("image-content")).toMatch(/^image-content-/)
	})
})
