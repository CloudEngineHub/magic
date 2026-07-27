import { describe, expect, it } from "vitest"
import {
	dedupeLinkedMediaItemsByPath,
	getLinkedMediaConnectionIdsToDeselectAfterMentionChange,
	getLinkedMediaReferenceIdentity,
	mergeLinkedMediaPaths,
	mergeLinkedMediaReferences,
	resolveLinkedMediaDisplay,
	resolveLinkedMediaItems,
	resolveLinkedMediaSelection,
	resolveLinkedMediaSelectionDisplay,
	type LinkedEditorMediaCandidate,
} from "../linkedEditorInputs"

describe("resolveLinkedMediaItems", () => {
	const imageCandidate: LinkedEditorMediaCandidate = {
		connectionId: "connection-image",
		sourceElementId: "image-source",
		kind: "image",
		path: "/images/source.png",
		fileName: "source.png",
	}

	it("marks supported linked media as active", () => {
		expect(
			resolveLinkedMediaItems([imageCandidate], {
				targetKind: "image",
				mediaPolicy: {
					supportedKinds: ["image"],
					maxTotalCount: 1,
				},
			}),
		).toEqual([expect.objectContaining({ status: "active" })])
	})

	it("keeps source crop on active linked media", () => {
		const sourceCrop = {
			x: 10,
			y: 20,
			width: 300,
			height: 200,
		}

		expect(
			resolveLinkedMediaItems([{ ...imageCandidate, sourceCrop }], {
				targetKind: "image",
				mediaPolicy: {
					supportedKinds: ["image"],
					maxTotalCount: 1,
				},
			}),
		).toEqual([expect.objectContaining({ status: "active", sourceCrop })])
	})

	it("keeps manual references before linked media when enforcing total limits", () => {
		expect(
			resolveLinkedMediaItems([imageCandidate], {
				targetKind: "image",
				mediaPolicy: {
					supportedKinds: ["image"],
					manualReferences: [{ kind: "image", path: "/images/manual.png" }],
					maxTotalCount: 1,
				},
			}),
		).toEqual([expect.objectContaining({ status: "inactive", reason: "over-limit" })])
	})

	it("normalizes equivalent resource paths for identity checks", () => {
		expect(getLinkedMediaReferenceIdentity("./images/source.png")).toBe("images/source.png")
		expect(mergeLinkedMediaPaths(["./images/source.png"], ["/images/source.png"])).toEqual([
			"./images/source.png",
		])
	})

	it("marks duplicate linked media as inactive", () => {
		expect(
			resolveLinkedMediaItems([imageCandidate], {
				targetKind: "image",
				mediaPolicy: {
					supportedKinds: ["image"],
					manualReferences: [{ kind: "image", path: "/images/source.png" }],
					maxTotalCount: 2,
				},
			}),
		).toEqual([expect.objectContaining({ status: "inactive", reason: "duplicate" })])
	})

	it("marks video sources as unsupported for image targets", () => {
		expect(
			resolveLinkedMediaItems(
				[
					{
						connectionId: "connection-video",
						sourceElementId: "video-source",
						kind: "video",
						path: "/videos/source.mp4",
					},
				],
				{
					targetKind: "image",
					mediaPolicy: {
						supportedKinds: ["image"],
						maxTotalCount: 1,
					},
				},
			),
		).toEqual([expect.objectContaining({ status: "inactive", reason: "unsupported-type" })])
	})

	it("marks unsupported current model or mode media as inactive", () => {
		expect(
			resolveLinkedMediaItems([imageCandidate], {
				targetKind: "video",
				mediaPolicy: {
					supportedKinds: ["video"],
					maxTotalCount: 1,
				},
			}),
		).toEqual([expect.objectContaining({ status: "inactive", reason: "unsupported-mode" })])
	})

	it("marks sources without a resource path as inactive", () => {
		expect(
			resolveLinkedMediaItems([{ ...imageCandidate, path: undefined }], {
				targetKind: "image",
				mediaPolicy: {
					supportedKinds: ["image"],
					maxTotalCount: 1,
				},
			}),
		).toEqual([expect.objectContaining({ status: "inactive", reason: "missing-resource" })])
	})

	it("enforces per-kind limits after manual references", () => {
		expect(
			resolveLinkedMediaItems([imageCandidate], {
				targetKind: "video",
				mediaPolicy: {
					supportedKinds: ["image", "video"],
					manualReferences: [{ kind: "image", path: "/images/manual.png" }],
					maxTotalCount: 3,
					maxCountByKind: { image: 1 },
				},
			}),
		).toEqual([expect.objectContaining({ status: "inactive", reason: "over-limit" })])
	})

	it("uses dynamic policy validation before accepting linked media", () => {
		expect(
			resolveLinkedMediaItems([imageCandidate], {
				targetKind: "video",
				mediaPolicy: {
					supportedKinds: ["image"],
					maxTotalCount: 2,
					validateActiveReferences: (references) =>
						references.length > 0 ? "over-limit" : null,
				},
			}),
		).toEqual([expect.objectContaining({ status: "inactive", reason: "over-limit" })])
	})
})

describe("mergeLinkedMediaReferences", () => {
	it("keeps manual references first and appends non-duplicate linked references", () => {
		expect(
			mergeLinkedMediaReferences(
				[{ kind: "image", path: "/images/manual.png" }],
				[
					{ kind: "image", path: "/images/manual.png" },
					{ kind: "video", path: "/videos/linked.mp4" },
				],
			),
		).toEqual([
			{ kind: "image", path: "/images/manual.png" },
			{ kind: "video", path: "/videos/linked.mp4" },
		])
	})

	it("prefers linked metadata when manual and linked references share a path", () => {
		const sourceCrop = { x: 1, y: 2, width: 300, height: 200 }
		expect(
			mergeLinkedMediaReferences(
				[{ kind: "image", path: "./images/source.png" }],
				[{ kind: "image", path: "/images/source.png", sourceCrop }],
			),
		).toEqual([{ kind: "image", path: "/images/source.png", sourceCrop }])
	})
})

describe("dedupeLinkedMediaItemsByPath", () => {
	it("shows one item per resource and keeps the selected connection", () => {
		const items = dedupeLinkedMediaItemsByPath([
			{
				connectionId: "connection-1",
				sourceElementId: "source-1",
				kind: "image",
				path: "./images/shared.png",
				status: "inactive",
				selected: false,
			},
			{
				connectionId: "connection-2",
				sourceElementId: "source-2",
				kind: "image",
				path: "/images/shared.png",
				status: "active",
				selected: true,
			},
		])

		expect(items).toHaveLength(1)
		expect(items[0]).toEqual(expect.objectContaining({ connectionId: "connection-2" }))
	})
})

describe("resolveLinkedMediaDisplay", () => {
	it("uses the linked card as the single display item for a manually mentioned resource", () => {
		const linkedItem = {
			connectionId: "connection-image",
			sourceElementId: "image-source",
			kind: "image" as const,
			path: "/images/shared.png",
			status: "inactive" as const,
			selected: false,
		}
		const result = resolveLinkedMediaDisplay(
			[{ path: "./images/shared.png", fileName: "shared.png" }],
			(item) => item.path,
			[linkedItem],
		)

		expect(result.manualItems).toEqual([])
		expect(result.linkedItems).toEqual([linkedItem])
	})
})

describe("resolveLinkedMediaSelectionDisplay", () => {
	it("shows an unselected linked resource as checked and locked while it is mentioned", () => {
		expect(
			resolveLinkedMediaSelectionDisplay(
				{ selected: false, selectionDisabledReason: "duplicate" },
				true,
			),
		).toEqual({ checked: true, disabled: true })
	})
})

describe("getLinkedMediaConnectionIdsToDeselectAfterMentionChange", () => {
	it("deselects a checked linked resource when its @mention is removed", () => {
		expect(
			getLinkedMediaConnectionIdsToDeselectAfterMentionChange(
				[
					{
						connectionId: "connection-image",
						sourceElementId: "image-source",
						kind: "image",
						path: "/images/source.png",
						status: "active",
						selected: true,
					},
				],
				["./images/source.png"],
				[],
			),
		).toEqual(["connection-image"])
	})

	it("keeps checkbox-only linked selections that were never mentioned", () => {
		expect(
			getLinkedMediaConnectionIdsToDeselectAfterMentionChange(
				[
					{
						connectionId: "connection-image",
						sourceElementId: "image-source",
						kind: "image",
						path: "/images/source.png",
						status: "active",
						selected: true,
					},
				],
				[],
				[],
			),
		).toEqual([])
	})
})

describe("resolveLinkedMediaSelection", () => {
	const firstImageCandidate: LinkedEditorMediaCandidate = {
		connectionId: "connection-image-1",
		sourceElementId: "image-source-1",
		kind: "image",
		path: "/images/source-1.png",
		fileName: "source-1.png",
	}
	const secondImageCandidate: LinkedEditorMediaCandidate = {
		connectionId: "connection-image-2",
		sourceElementId: "image-source-2",
		kind: "image",
		path: "/images/source-2.png",
		fileName: "source-2.png",
	}

	it("keeps linked media unselected by default", () => {
		const result = resolveLinkedMediaSelection([firstImageCandidate], [], {
			targetKind: "image",
			mediaPolicy: { supportedKinds: ["image"], maxTotalCount: 1 },
		})

		expect(result.items).toEqual([
			expect.objectContaining({ selected: false, status: "inactive" }),
		])
		expect(result.activeMediaReferences).toEqual([])
	})

	it("keeps every candidate selectable while no media has been selected", () => {
		const result = resolveLinkedMediaSelection(
			[firstImageCandidate, secondImageCandidate],
			[],
			{
				targetKind: "image",
				mediaPolicy: { supportedKinds: ["image"], maxTotalCount: 1 },
			},
		)

		expect(result.items).toEqual([
			expect.objectContaining({
				connectionId: firstImageCandidate.connectionId,
				selected: false,
				selectionDisabledReason: undefined,
			}),
			expect.objectContaining({
				connectionId: secondImageCandidate.connectionId,
				selected: false,
				selectionDisabledReason: undefined,
			}),
		])
	})

	it("only includes media selected by the user", () => {
		const result = resolveLinkedMediaSelection(
			[firstImageCandidate, secondImageCandidate],
			[secondImageCandidate.connectionId],
			{
				targetKind: "image",
				mediaPolicy: { supportedKinds: ["image"], maxTotalCount: 1 },
			},
		)

		expect(result.items).toEqual([
			expect.objectContaining({
				connectionId: firstImageCandidate.connectionId,
				selected: false,
				selectionDisabledReason: "over-limit",
			}),
			expect.objectContaining({
				connectionId: secondImageCandidate.connectionId,
				selected: true,
				status: "active",
			}),
		])
		expect(result.activeMediaReferences).toEqual([
			{ kind: "image", path: secondImageCandidate.path, sourceCrop: undefined },
		])
	})

	it("keeps a selected linked resource active when it is also manually mentioned", () => {
		const sourceCrop = { x: 4, y: 8, width: 200, height: 120 }
		const result = resolveLinkedMediaSelection(
			[{ ...firstImageCandidate, sourceCrop }],
			[firstImageCandidate.connectionId],
			{
				targetKind: "image",
				mediaPolicy: {
					supportedKinds: ["image"],
					manualReferences: [{ kind: "image", path: "./images/source-1.png" }],
					maxTotalCount: 1,
				},
			},
		)

		expect(result.items).toEqual([
			expect.objectContaining({
				selected: true,
				status: "active",
				sourceCrop,
			}),
		])
		expect(result.activeMediaReferences).toEqual([
			{ kind: "image", path: firstImageCandidate.path, sourceCrop },
		])
	})

	it("restores a retained selection after the media kind becomes supported again", () => {
		const selectedConnectionIds = [firstImageCandidate.connectionId]
		const unsupportedResult = resolveLinkedMediaSelection(
			[firstImageCandidate],
			selectedConnectionIds,
			{
				targetKind: "video",
				mediaPolicy: { supportedKinds: ["video"] },
			},
		)

		expect(unsupportedResult.activeMediaReferences).toEqual([])

		const restoredResult = resolveLinkedMediaSelection(
			[firstImageCandidate],
			selectedConnectionIds,
			{
				targetKind: "video",
				mediaPolicy: { supportedKinds: ["image"] },
			},
		)

		expect(restoredResult.items).toEqual([
			expect.objectContaining({ selected: true, status: "active" }),
		])
		expect(restoredResult.activeMediaReferences).toEqual([
			{ kind: "image", path: firstImageCandidate.path, sourceCrop: undefined },
		])
	})
})
