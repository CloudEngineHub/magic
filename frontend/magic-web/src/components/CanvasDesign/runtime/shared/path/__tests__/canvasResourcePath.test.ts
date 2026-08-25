import { describe, expect, it } from "vitest"
import type { ResolveCanvasResourceReference } from "../../../../public/resource-reference"
import {
	areCanvasResourceReferencesSame,
	areCanvasResourcePathsSame,
	getCanvasResourceReferenceIdentity,
	getCanvasResourceFileName,
	isOpaqueAssetReference,
	normalizeCanvasUploadFileResponsePath,
	normalizeCanvasUploadStoragePath,
	toCanvasUploadStoragePath,
	toCanonicalCanvasResourcePath,
	toRemoteLoadDeferralKey,
	toWeakCanvasResourcePath,
} from "../canvasResourcePath"

function resolveAbsolutePath(path: string): string {
	const normalized = path
		.replace(/\\/g, "/")
		.replace(/^\.\/+/, "")
		.replace(/^\/+/, "")
	if (!normalized) return "/画布A/"
	if (normalized.startsWith("画布A/") || normalized.startsWith("画布B/")) {
		return `/${normalized}`
	}
	return `/画布A/${normalized}`
}

describe("canvasResourcePath", () => {
	it("keeps opaque asset references unchanged", () => {
		expect(isOpaqueAssetReference("asset://virtual-human-asset-id")).toBe(true)
		expect(isOpaqueAssetReference("asset:/virtual-human-asset-id")).toBe(false)
		expect(toWeakCanvasResourcePath("asset://virtual-human-asset-id")).toBe(
			"asset://virtual-human-asset-id",
		)
		expect(normalizeCanvasUploadStoragePath("asset://virtual-human-asset-id")).toBe(
			"asset://virtual-human-asset-id",
		)
		expect(
			normalizeCanvasUploadFileResponsePath({ path: "asset://virtual-human-asset-id" }),
		).toEqual({ path: "asset://virtual-human-asset-id" })
	})

	it("normalizes current-canvas weak and canonical paths", () => {
		expect(toWeakCanvasResourcePath("./images/a.png")).toBe("images/a.png")
		expect(toWeakCanvasResourcePath("images/a.png")).toBe("images/a.png")
		expect(toCanonicalCanvasResourcePath("./images/a.png")).toBe("images/a.png")
		expect(toCanonicalCanvasResourcePath("images/a.png")).toBe("images/a.png")
		expect(areCanvasResourcePathsSame("./images/a.png", "images/a.png")).toBe(true)
		expect(areCanvasResourcePathsSame("./images/a.png", "/images/a.png")).toBe(true)
	})

	it("resolves the same resource across host absolute and DSL forms without cross-canvas fallback", () => {
		expect(
			areCanvasResourcePathsSame(
				"./images/a.png",
				"/画布A/images/a.png",
				resolveAbsolutePath,
			),
		).toBe(true)
		expect(
			areCanvasResourcePathsSame("画布B/images/a.png", "./images/a.png", resolveAbsolutePath),
		).toBe(false)
		expect(toCanonicalCanvasResourcePath("/画布B/images/a.png", resolveAbsolutePath)).toBe(
			"画布B/images/a.png",
		)
	})

	it("uses the host resolver identity for cross-namespace aliases", () => {
		const resolveResourceReference: ResolveCanvasResourceReference = (input) => {
			const rawPath =
				"path" in input
					? input.path
					: input.namespace === "external-url"
						? input.url
						: input.fileId
			return {
				status: "resolved" as const,
				resourceKind: "workspace-file" as const,
				rawReference: rawPath,
				workspacePath: "/images/a.png",
				storagePath: "./images/a.png",
				identity: "workspace:/images/a.png",
				candidates: ["/images/a.png"],
				legacyRecovered: false,
				resolutionSource: "strict-path" as const,
			}
		}

		expect(getCanvasResourceReferenceIdentity("./images/a.png", resolveResourceReference)).toBe(
			"workspace:/images/a.png",
		)
		expect(
			areCanvasResourceReferencesSame(
				"./images/a.png",
				"/images/a.png",
				resolveResourceReference,
			),
		).toBe(true)
	})

	it("keeps remote load deferral keys stable for canvas-relative aliases", () => {
		expect(toRemoteLoadDeferralKey("./videos/a.mp4")).toBe("videos/a.mp4")
		expect(toRemoteLoadDeferralKey("videos/a.mp4")).toBe("videos/a.mp4")
		expect(toRemoteLoadDeferralKey("/videos/a.mp4")).toBe("videos/a.mp4")
	})

	it("normalizes upload storage paths and file response paths", () => {
		expect(toCanvasUploadStoragePath("images", "image_x.png")).toBe("images/image_x.png")
		expect(normalizeCanvasUploadStoragePath("/imagesimage_x.png")).toBe("images/image_x.png")
		expect(toCanvasUploadStoragePath("videos", "video_x.mp4")).toBe("videos/video_x.mp4")
		expect(normalizeCanvasUploadStoragePath("/audiosaudio_x.mp3")).toBe("audios/audio_x.mp3")
		expect(normalizeCanvasUploadFileResponsePath({ path: "/videosvideo_x.mp4" }).path).toBe(
			"videos/video_x.mp4",
		)
	})

	it("extracts file names from urls and paths", () => {
		expect(getCanvasResourceFileName("https://cdn.test/a/b/cat.png?x=1#top")).toBe("cat.png")
		expect(getCanvasResourceFileName("C:\\temp\\dog.mp4?x=1")).toBe("dog.mp4")
		expect(getCanvasResourceFileName("")).toBe("")
	})
})
