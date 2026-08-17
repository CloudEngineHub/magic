import type { JSONContent } from "@/infrastructure/editors/tiptap/core"
import { describe, expect, it, vi } from "vitest"
import { createSceneStateStore } from "../SceneStateStore"

vi.mock("@/apis", () => ({
	SuperMagicApi: {
		getSceneConfig: vi.fn(),
	},
}))

function createTextDoc(text: string): JSONContent {
	return {
		type: "doc",
		content: [
			{
				type: "paragraph",
				content: [{ type: "text", text }],
			},
		],
	}
}

function getPlainTextFromNode(node: JSONContent | null | undefined): string {
	if (!node) return ""
	if (node.type === "text") return node.text ?? ""
	if (!Array.isArray(node.content)) return ""
	if (node.type === "doc") return node.content.map(getPlainTextFromNode).join("\n")
	return node.content.map(getPlainTextFromNode).join("")
}

describe("SceneStateStore preset suffix sources", () => {
	it("merges the default field panel suffix with a dedicated self media suffix", () => {
		const store = createSceneStateStore()

		store.setPresetSuffixContent(createTextDoc("style: plain."))
		store.setPresetSuffixContentForSource(
			"self-media-composer",
			createTextDoc("platform: rednote."),
		)

		expect(getPlainTextFromNode(store.presetSuffixContent)).toBe(
			"style: plain.\n\nplatform: rednote.",
		)
	})

	it("clears one suffix source without dropping the other source", () => {
		const store = createSceneStateStore()

		store.setPresetSuffixContent(createTextDoc("style: plain."))
		store.setPresetSuffixContentForSource(
			"self-media-composer",
			createTextDoc("platform: rednote."),
		)
		store.setPresetSuffixContent(undefined)

		expect(getPlainTextFromNode(store.presetSuffixContent)).toBe("platform: rednote.")
	})
})

describe("SceneStateStore client context sources", () => {
	it("merges client context source content into one versioned payload", () => {
		const store = createSceneStateStore()

		store.setClientContextForSource("video", {
			version: "1.0.0",
			data: { content: "generation: detailed." },
		})
		store.setClientContextForSource("page", {
			version: "1.0.0",
			data: { content: "page: home." },
		})

		expect(store.clientContext).toEqual({
			version: "1.0.0",
			data: { content: "generation: detailed.\n\npage: home." },
		})
	})

	it("clears client context when its source is removed", () => {
		const store = createSceneStateStore()

		store.setClientContextForSource("video", {
			version: "1.0.0",
			data: { content: "generation: detailed." },
		})
		store.setClientContextForSource("video", undefined)

		expect(store.clientContext).toBeUndefined()
	})
})
