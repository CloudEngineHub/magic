import { describe, expect, it } from "vitest"
import type { ReferenceResourcePanelItem } from "../../../types"
import type {
	ReferenceAssetPerTypeLimits,
	ReferenceAssetTypeCounts,
} from "../reference-assets/reference-resource.types"
import { filterReferenceResourcePanelBatchItems } from "../reference-assets/referenceResourceSelection"
import { CANVAS_REFERENCE_MENTION_ITEM_TYPE } from "../reference-assets/canvasReferenceMention.constants"

function panelItem(
	path: string,
	fileName = path.split("/").pop() || path,
): ReferenceResourcePanelItem {
	const extension = fileName.includes(".") ? `.${fileName.split(".").pop() ?? ""}` : ""
	return {
		type: CANVAS_REFERENCE_MENTION_ITEM_TYPE.projectFile,
		data: {
			file_id: path,
			file_name: fileName,
			file_path: path,
			file_extension: extension,
		},
	}
}

const mediaLimits: ReferenceAssetPerTypeLimits = {
	reference_images: { min: 0, max: 2 },
	reference_videos: { min: 0, max: 1 },
	reference_audios: { min: 0, max: 1 },
	total: { min: 0, max: 3 },
}

describe("filterReferenceResourcePanelBatchItems", () => {
	it("slices project selections by remaining total capacity", () => {
		const selected = filterReferenceResourcePanelBatchItems({
			items: [
				panelItem("project/a.png"),
				panelItem("project/b.png"),
				panelItem("project/c.png"),
			],
			maxReferenceFiles: 2,
			currentReferenceFiles: ["project/existing.png"],
		})

		expect(selected.map((item) => item.data.file_path)).toEqual(["project/a.png"])
	})

	it("does not consume capacity for files already present", () => {
		const selected = filterReferenceResourcePanelBatchItems({
			items: [panelItem("project/existing.png"), panelItem("project/a.png")],
			maxReferenceFiles: 1,
			currentReferenceFiles: ["project/existing.png"],
		})

		expect(selected.map((item) => item.data.file_path)).toEqual(["project/existing.png"])
	})

	it("respects per-asset-type capacity and total capacity", () => {
		const currentAssetCounts: ReferenceAssetTypeCounts = {
			images: 1,
			videos: 0,
			audios: 0,
		}

		const selected = filterReferenceResourcePanelBatchItems({
			items: [
				panelItem("project/a.png"),
				panelItem("project/b.png"),
				panelItem("project/clip.mp4"),
			],
			assetLimits: mediaLimits,
			currentAssetCounts,
		})

		expect(selected.map((item) => item.data.file_path)).toEqual([
			"project/a.png",
			"project/clip.mp4",
		])
	})

	it("applies an entrance-specific batch cap", () => {
		const selected = filterReferenceResourcePanelBatchItems({
			items: [
				panelItem("project/a.png"),
				panelItem("project/b.png"),
				panelItem("project/c.png"),
			],
			maxBatchItems: 1,
		})

		expect(selected.map((item) => item.data.file_path)).toEqual(["project/a.png"])
	})
})
