import { describe, expect, it } from "vitest"
import {
	buildReferenceAssetInputs,
	resolveReferenceAssetType,
	resolveVideoReferenceAssetInfo,
} from "../model-config/video-editor-config.model"

describe("opaque reference asset types", () => {
	it("uses explicit or metadata types and never infers from an opaque suffix", () => {
		expect(
			resolveReferenceAssetType("asset://resource.png", {
				explicitAssetType: "video",
			}),
		).toBe("video")
		expect(
			resolveReferenceAssetType("asset://resource", {
				metadataCandidates: [{ path: "asset://resource", assetType: "audio" }],
			}),
		).toBe("audio")
		expect(resolveReferenceAssetType("asset://resource.png")).toBeUndefined()
	})

	it("keeps typed opaque URIs in the correct request bucket", () => {
		expect(
			buildReferenceAssetInputs(
				[
					{
						path: "asset://video-id",
						src: "asset://video-id",
						fileName: "asset://video-id",
						assetType: "video",
					},
				],
				{ supported_fields: ["reference_videos"] },
			),
		).toEqual({ reference_videos: [{ uri: "asset://video-id" }] })
	})

	it("builds a typed opaque asset from metadata and filters an untyped URI", () => {
		expect(
			resolveVideoReferenceAssetInfo({
				path: "asset://linked-video",
				metadataCandidates: [{ path: "asset://linked-video", assetType: "video" }],
			}),
		).toMatchObject({ path: "asset://linked-video", assetType: "video" })
		expect(resolveVideoReferenceAssetInfo({ path: "asset://unknown" })).toBeUndefined()
	})
})
