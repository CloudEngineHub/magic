import { describe, expect, it, vi } from "vitest"
import { MentionItemType, type MentionItem } from "../../types"
import { getMentionPanelSelectionSummaryCounts } from "../selectionSummary"

describe("getMentionPanelSelectionSummaryCounts", () => {
	const image = {
		id: "image-1",
		name: "Image 1",
		type: MentionItemType.PROJECT_FILE,
	} as const
	const video = {
		id: "video-1",
		name: "Video 1",
		type: MentionItemType.PROJECT_FILE,
	} as const

	it("merges pending types into committed counts", () => {
		const counts = getMentionPanelSelectionSummaryCounts(
			{
				currentCounts: { image: 1, video: 0, audio: 0 },
				limits: { image: 15, video: 1 },
				getItemAssetType: (item) => (item.id === image.id ? "image" : "video"),
			},
			[{ item: image }, { item: video }],
		)

		expect(counts).toEqual({ image: 2, video: 1, audio: 0 })
	})

	it("does not count a duplicate committed resource or unknown type", () => {
		const isItemAlreadySelected = vi.fn((item: MentionItem) => item.id === image.id)
		const counts = getMentionPanelSelectionSummaryCounts(
			{
				currentCounts: { image: 1, video: 0, audio: 0 },
				limits: { image: 15 },
				getItemAssetType: (item) => (item.id === image.id ? "image" : undefined),
				isItemAlreadySelected,
			},
			[{ item: image }, { item: video }],
		)

		expect(counts).toEqual({ image: 1, video: 0, audio: 0 })
		expect(isItemAlreadySelected).toHaveBeenCalledTimes(2)
	})

	it("returns undefined when no summary is configured", () => {
		expect(getMentionPanelSelectionSummaryCounts(undefined, [])).toBeUndefined()
	})
})
