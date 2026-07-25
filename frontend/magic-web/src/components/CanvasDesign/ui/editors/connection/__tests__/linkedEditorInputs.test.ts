import { describe, expect, it } from "vitest"
import {
	mergeLinkedMediaReferences,
	resolveLinkedMediaItems,
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
})
