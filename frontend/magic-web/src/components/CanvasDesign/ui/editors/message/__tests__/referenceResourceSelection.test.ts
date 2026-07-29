import { describe, expect, it } from "vitest"
import type { ReferenceResourcePanelItem } from "../../../../public/props"
import type {
	ReferenceAssetPerTypeLimits,
	ReferenceAssetTypeCounts,
} from "../reference-assets/reference-resource.types"
import { filterReferenceResourcePanelBatchItems } from "../reference-assets/referenceResourceSelection"
import { CANVAS_REFERENCE_MENTION_ITEM_TYPE } from "../reference-assets/canvasReferenceMention.constants"
import {
	checkProjectReferenceResourceDrop,
	getProjectFilePathCandidates,
	normalizeProjectDropFiles,
	normalizeProjectDropFilesForStorage,
} from "../reference-assets/useReferenceResourcePanelDataService"

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

function resolveDesignAResourceCandidates(path: string): string[] {
	if (path === "/画布A/images/cat.png") {
		return [path, "画布A/images/cat.png", "./images/cat.png", "images/cat.png"]
	}
	if (path === "/画布B/images/cat.png") {
		return [path, "画布B/images/cat.png"]
	}
	return [path]
}

function resolveAmbiguousBareResourceCandidates(path: string): string[] {
	return [path]
}

function resolveWorkspaceRootFileCandidates(path: string): string[] {
	return [path, path.replace(/^\/+/, "")]
}

function normalizeDesignAResourcePathForStorage(path: string): string {
	if (path.startsWith("./")) return path
	const normalized = path.replace(/^\/+/, "")
	if (normalized.startsWith("画布A/")) {
		return `./${normalized.slice("画布A/".length)}`
	}
	return `/${normalized}`
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

describe("project reference resource path candidates", () => {
	it("keeps canvas-relative paths compatible without suffix guessing", () => {
		expect(getProjectFilePathCandidates("./images/cat.png")).toEqual(
			expect.arrayContaining(["./images/cat.png", "images/cat.png"]),
		)
		expect(getProjectFilePathCandidates("images/cat.png")).toEqual(
			expect.arrayContaining(["./images/cat.png", "images/cat.png"]),
		)

		const otherCanvasCandidates = getProjectFilePathCandidates("/画布B/images/cat.png")
		expect(otherCanvasCandidates).toContain("/画布B/images/cat.png")
		expect(otherCanvasCandidates).not.toContain("./images/cat.png")
		expect(otherCanvasCandidates).not.toContain("images/cat.png")
	})

	it("uses host-safe candidates to match current canvas absolute paths", () => {
		const files = [{ path: "/画布A/images/cat.png", fileName: "cat.png" }]
		const normalized = normalizeProjectDropFiles(files, [{ path: "./images/cat.png" }], [], {
			resolveResourcePathCandidates: resolveDesignAResourceCandidates,
		})

		expect(normalized).toEqual([{ path: "./images/cat.png", fileName: "cat.png" }])
		expect(
			checkProjectReferenceResourceDrop({
				isDropEnabled: true,
				files,
				matchableItems: [{ path: "./images/cat.png" }],
				currentReferenceFiles: [],
				resolveResourcePathCandidates: resolveDesignAResourceCandidates,
			}).accepted,
		).toBe(true)
	})

	it("does not match other canvas resources by same file name", () => {
		const files = [{ path: "/画布B/images/cat.png", fileName: "cat.png" }]
		const normalized = normalizeProjectDropFiles(files, [{ path: "./images/cat.png" }], [], {
			resolveResourcePathCandidates: resolveDesignAResourceCandidates,
		})

		expect(normalized).toEqual(files)
		expect(
			checkProjectReferenceResourceDrop({
				isDropEnabled: true,
				files,
				matchableItems: [{ path: "./images/cat.png" }],
				currentReferenceFiles: [],
				resolveResourcePathCandidates: resolveDesignAResourceCandidates,
			}).accepted,
		).toBe(false)
	})

	it("stores accepted external project drops as workspace-absolute paths", () => {
		const files = [{ path: "/画布B/images/cat.png", fileName: "cat.png" }]
		const normalized = normalizeProjectDropFilesForStorage(
			files,
			[{ path: "画布B/images/cat.png" }],
			[],
			{
				resolveResourcePathCandidates: resolveDesignAResourceCandidates,
				normalizeResourcePathForStorage: normalizeDesignAResourcePathForStorage,
			},
		)

		expect(normalized).toEqual([{ path: "/画布B/images/cat.png", fileName: "cat.png" }])
	})

	it("stores a single project-root file as a workspace-absolute path", () => {
		const files = [{ path: "/cat.png", fileName: "cat.png" }]
		const normalized = normalizeProjectDropFilesForStorage(files, [{ path: "cat.png" }], [], {
			resolveResourcePathCandidates: resolveWorkspaceRootFileCandidates,
			normalizeResourcePathForStorage: normalizeDesignAResourcePathForStorage,
		})

		expect(normalized).toEqual([{ path: "/cat.png", fileName: "cat.png" }])
	})

	it("does not turn an attachment-ambiguous bare resource into a current-canvas reference", () => {
		const files = [{ path: "images/cat.png", fileName: "cat.png" }]
		const normalized = normalizeProjectDropFiles(files, [{ path: "./images/cat.png" }], [], {
			resolveResourcePathCandidates: resolveAmbiguousBareResourceCandidates,
		})

		expect(normalized).toEqual(files)
		expect(
			checkProjectReferenceResourceDrop({
				isDropEnabled: true,
				files,
				matchableItems: [{ path: "./images/cat.png" }],
				currentReferenceFiles: [],
				resolveResourcePathCandidates: resolveAmbiguousBareResourceCandidates,
			}).accepted,
		).toBe(false)
	})
})
