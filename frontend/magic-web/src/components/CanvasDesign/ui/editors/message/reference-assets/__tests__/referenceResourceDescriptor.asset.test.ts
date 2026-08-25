import { describe, expect, it } from "vitest"
import {
	createReferenceResourceDescriptor,
	resolveReferenceResourceAssetType,
} from "../referenceResourceDescriptor"

describe("referenceResourceDescriptor", () => {
	it("keeps opaque URI identity separate from file semantics", () => {
		expect(
			createReferenceResourceDescriptor({
				path: "asset://virtual-human-asset-id",
				assetType: "video",
			}),
		).toEqual({
			path: "asset://virtual-human-asset-id",
			identity: "asset://virtual-human-asset-id",
			resourceKind: "opaque-asset",
			fileName: "asset://virtual-human-asset-id",
			src: "asset://virtual-human-asset-id",
			assetType: "video",
		})
	})

	it("prefers explicit and metadata types before path inference", () => {
		const inferFromPath = () => "image" as const

		expect(
			resolveReferenceResourceAssetType({
				path: "asset://resource",
				explicitAssetType: "audio",
				metadataCandidates: [{ path: "asset://resource", assetType: "video" }],
				inferFromPath,
			}),
		).toBe("audio")
		expect(
			resolveReferenceResourceAssetType({
				path: "asset://resource",
				metadataCandidates: [{ path: "asset://resource", assetType: "video" }],
				inferFromPath,
			}),
		).toBe("video")
		expect(
			resolveReferenceResourceAssetType({
				path: "asset://resource.png",
				inferFromPath,
			}),
		).toBeUndefined()
	})
})
