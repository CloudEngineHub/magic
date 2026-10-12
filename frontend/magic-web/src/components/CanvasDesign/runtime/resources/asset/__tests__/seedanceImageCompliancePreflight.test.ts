import { afterEach, describe, expect, it, vi } from "vitest"
import type { Canvas } from "../../../core/Canvas"
import { ElementTypeEnum, type LayerElement } from "../../../document/types"
import type { CanvasDesignMethods, GenerateVideoRequest } from "../../../../public/magic-types"
import { assetDetailStore } from "../AssetDetailStore"
import {
	collectSeedanceImageUris,
	isSeedanceModelName,
	resolveSeedanceImageAssetReferences,
	runSeedanceImageCompliancePreflight,
} from "../seedanceImageCompliancePreflight"

function createCanvas(
	methods: Partial<CanvasDesignMethods> = {},
	options?: {
		pollingStatus?: string
		cachedStatus?: string
		elementData?: Map<string, LayerElement>
		upstreamConnections?: Record<string, Array<{ id: string; sourceElementId: string }>>
	},
) {
	const startLibraryAssetCompliance = vi.fn().mockResolvedValue("asset-1")
	const canvas = {
		isSeedanceComplianceEnabled: () => true,
		magicConfigManager: { config: { methods } },
		assetComplianceTaskManager: {
			startLibraryAssetCompliance,
			watchLibraryComplianceChecks: vi.fn(),
		},
		assetCompliancePollingManager: {
			getState: vi.fn(() =>
				options?.pollingStatus
					? { assetId: "asset-1", status: options.pollingStatus, failedReason: null }
					: undefined,
			),
		},
		assetResourceManager: {
			getCachedResource: vi.fn(() =>
				options?.cachedStatus ? { complianceStatus: options.cachedStatus } : undefined,
			),
		},
		connectionManager: {
			getUpstreamConnections: vi.fn(
				(elementId: string) => options?.upstreamConnections?.[elementId] ?? [],
			),
		},
		elementManager: {
			getElementData: vi.fn((elementId: string) => options?.elementData?.get(elementId)),
		},
	} as unknown as Canvas

	return { canvas, startLibraryAssetCompliance }
}

function request(inputs: GenerateVideoRequest["inputs"]): GenerateVideoRequest {
	return { model_id: "model-1", inputs }
}

afterEach(() => {
	assetDetailStore.clearAll()
	vi.restoreAllMocks()
})

describe("Seedance image compliance preflight", () => {
	it.each(["Seedance", "seedance 2.0", "ByteDance/SEEDANCE-2-5", "seedance2.5-pro"])(
		"matches %s",
		(modelName) => {
			expect(isSeedanceModelName(modelName)).toBe(true)
		},
	)

	it.each(["Seedream", "notseedance", "", undefined])("does not match %s", (modelName) => {
		expect(isSeedanceModelName(modelName)).toBe(false)
	})

	it("collects frames and reference images but ignores other inputs and composition", () => {
		expect(
			collectSeedanceImageUris(
				request({
					frames: [{ role: "start", uri: "./images/start.png" }],
					reference_images: [{ uri: "asset://asset-1" }],
					reference_videos: [{ uri: "./videos/ref.mp4" }],
					reference_audios: [{ uri: "./audios/ref.mp3" }],
					mask: { uri: "./images/mask.png" },
				}),
			),
		).toEqual(["./images/start.png", "asset://asset-1"])

		expect(
			collectSeedanceImageUris({
				...request({ reference_images: [{ uri: "asset://asset-1" }] }),
				generation_type: "canvas_composition",
			}),
		).toEqual([])
	})

	it("resolves direct asset references and deduplicates IDs", () => {
		const { canvas } = createCanvas()
		expect(
			resolveSeedanceImageAssetReferences(canvas, "video-1", [
				"asset://asset-1",
				"asset://asset-1",
			]),
		).toEqual([
			{
				uri: "asset://asset-1",
				assetId: "asset-1",
			},
		])
	})

	it("resolves an assetId from a nested Frame source when the child is not top-level", () => {
		const image = {
			id: "nested-image",
			type: ElementTypeEnum.Image,
			activeContentId: "nested-image-content",
			mainContentId: "nested-image-content",
			contents: [
				{
					contentId: "nested-image-content",
					src: "./images/portrait.png",
					assetId: "asset-nested",
				},
			],
		} as unknown as LayerElement
		const frame = {
			id: "frame-1",
			type: ElementTypeEnum.Frame,
			activeContentId: null,
			mainContentId: null,
			contents: [],
			children: [image],
		} as unknown as LayerElement
		const video = {
			id: "video-1",
			type: ElementTypeEnum.Video,
			activeContentId: "video-content",
			mainContentId: "video-content",
			contents: [{ contentId: "video-content", src: "./videos/source.mp4" }],
		} as unknown as LayerElement
		const { canvas } = createCanvas(
			{},
			{
				elementData: new Map([
					["video-1", video],
					["frame-1", frame],
				]),
				upstreamConnections: {
					"video-1": [{ id: "connection-1", sourceElementId: "frame-1" }],
				},
			},
		)

		expect(
			resolveSeedanceImageAssetReferences(canvas, "video-1", ["./images/portrait.png"]),
		).toEqual([
			{
				uri: "./images/portrait.png",
				assetId: "asset-nested",
			},
		])
	})

	it("does not start compliance when the asset is already PASS", async () => {
		const getAssetComplianceStatus = vi.fn().mockResolvedValue({
			assetId: "asset-1",
			status: "PASS",
			failedReason: null,
		})
		const methods: Partial<CanvasDesignMethods> = {
			getAssetComplianceStatus,
			startExistingAssetCompliance: vi.fn(),
			ensureAssetAgreementSigned: vi.fn(),
		}
		const { canvas, startLibraryAssetCompliance } = createCanvas(methods)

		await expect(
			runSeedanceImageCompliancePreflight({
				canvas,
				sourceVideoElementId: "video-1",
				request: request({ reference_images: [{ uri: "asset://asset-1" }] }),
				modelName: "Seedance 2.5",
			}),
		).resolves.toEqual({ proceed: true })
		expect(getAssetComplianceStatus).toHaveBeenCalledWith("asset-1")
		expect(startLibraryAssetCompliance).not.toHaveBeenCalled()
	})

	it.each(["PROCESSING", "FAILED"])(
		"does not restart an asset with status %s",
		async (status) => {
			const getAssetComplianceStatus = vi.fn().mockResolvedValue({
				assetId: "asset-1",
				status,
				failedReason: status === "FAILED" ? "blocked" : null,
			})
			const ensureAssetAgreementSigned = vi.fn()
			const { canvas, startLibraryAssetCompliance } = createCanvas({
				getAssetComplianceStatus,
				ensureAssetAgreementSigned,
				startExistingAssetCompliance: vi.fn(),
			})

			await expect(
				runSeedanceImageCompliancePreflight({
					canvas,
					sourceVideoElementId: "video-1",
					request: request({ reference_images: [{ uri: "asset://asset-1" }] }),
					modelName: "Seedance 2.5",
				}),
			).resolves.toEqual({ proceed: true })
			expect(ensureAssetAgreementSigned).not.toHaveBeenCalled()
			expect(startLibraryAssetCompliance).not.toHaveBeenCalled()
		},
	)

	it("starts unverified assets and continues without waiting for PASS", async () => {
		const getAssetComplianceStatus = vi.fn().mockResolvedValue({
			assetId: "asset-1",
			status: "UNVERIFIED",
			failedReason: null,
		})
		const ensureAssetAgreementSigned = vi.fn().mockResolvedValue(true)
		const startExistingAssetCompliance = vi.fn().mockResolvedValue({
			assetId: "different-response-id",
			mediaType: "image",
			fileUrl: null,
		})
		const { canvas, startLibraryAssetCompliance } = createCanvas({
			getAssetComplianceStatus,
			ensureAssetAgreementSigned,
			startExistingAssetCompliance,
		})
		vi.spyOn(assetDetailStore, "getWithFileKey").mockResolvedValue({
			asset_id: "asset-1",
			file_key: "private/portrait.png",
			name: "Portrait",
			compliance_status: "UNVERIFIED",
		} as never)

		await expect(
			runSeedanceImageCompliancePreflight({
				canvas,
				sourceVideoElementId: "video-1",
				request: request({ reference_images: [{ uri: "asset://asset-1" }] }),
				modelName: "seedance-2-5",
				timeoutMs: 100,
			}),
		).resolves.toEqual({ proceed: true })
		expect(ensureAssetAgreementSigned).toHaveBeenCalledTimes(1)
		expect(startLibraryAssetCompliance).toHaveBeenCalledWith({
			assetId: "asset-1",
			fileKey: "private/portrait.png",
			name: "Portrait",
			startExistingAssetCompliance,
		})
	})

	it("starts when detail is available but has no prior compliance status", async () => {
		const ensureAssetAgreementSigned = vi.fn().mockResolvedValue(true)
		const { canvas, startLibraryAssetCompliance } = createCanvas({
			getAssetComplianceStatus: vi.fn().mockResolvedValue({
				assetId: "asset-1",
				status: "UNVERIFIED",
				failedReason: null,
			}),
			ensureAssetAgreementSigned,
			startExistingAssetCompliance: vi.fn(),
		})
		vi.spyOn(assetDetailStore, "getWithFileKey").mockResolvedValue({
			asset_id: "asset-1",
			file_key: "private/portrait.png",
			name: "Portrait",
		} as never)

		await expect(
			runSeedanceImageCompliancePreflight({
				canvas,
				sourceVideoElementId: "video-1",
				request: request({ reference_images: [{ uri: "asset://asset-1" }] }),
				modelName: "Seedance",
			}),
		).resolves.toEqual({ proceed: true })
		expect(ensureAssetAgreementSigned).toHaveBeenCalledTimes(1)
		expect(startLibraryAssetCompliance).toHaveBeenCalledTimes(1)
	})

	it("deduplicates repeated image asset IDs and starts each unique asset in parallel", async () => {
		const startLibraryAssetCompliance = vi.fn().mockResolvedValue("asset")
		const getAssetComplianceStatus = vi.fn((assetId: string) =>
			Promise.resolve({ assetId, status: "UNVERIFIED" as const, failedReason: null }),
		)
		const ensureAssetAgreementSigned = vi.fn().mockResolvedValue(true)
		const { canvas } = createCanvas({
			getAssetComplianceStatus,
			ensureAssetAgreementSigned,
			startExistingAssetCompliance: vi.fn(),
		})
		canvas.assetComplianceTaskManager.startLibraryAssetCompliance =
			startLibraryAssetCompliance as never
		vi.spyOn(assetDetailStore, "getWithFileKey").mockImplementation(
			async (assetId) =>
				({
					asset_id: assetId,
					file_key: `private/${assetId}.png`,
					compliance_status: "UNVERIFIED",
				}) as never,
		)

		await expect(
			runSeedanceImageCompliancePreflight({
				canvas,
				sourceVideoElementId: "video-1",
				request: request({
					reference_images: [
						{ uri: "asset://asset-1" },
						{ uri: "asset://asset-2" },
						{ uri: "asset://asset-1" },
					],
				}),
				modelName: "Seedance",
			}),
		).resolves.toEqual({ proceed: true })
		expect(startLibraryAssetCompliance).toHaveBeenCalledTimes(2)
		expect(
			startLibraryAssetCompliance.mock.calls.map(([params]) => params.assetId).sort(),
		).toEqual(["asset-1", "asset-2"])
	})

	it("cancels submission when the user declines the agreement", async () => {
		const { canvas, startLibraryAssetCompliance } = createCanvas({
			getAssetComplianceStatus: vi.fn().mockResolvedValue({
				assetId: "asset-1",
				status: "UNVERIFIED",
				failedReason: null,
			}),
			ensureAssetAgreementSigned: vi.fn().mockResolvedValue(false),
			startExistingAssetCompliance: vi.fn(),
		})
		vi.spyOn(assetDetailStore, "getWithFileKey").mockResolvedValue({
			asset_id: "asset-1",
			file_key: "private/portrait.png",
			compliance_status: "UNVERIFIED",
		} as never)

		await expect(
			runSeedanceImageCompliancePreflight({
				canvas,
				sourceVideoElementId: "video-1",
				request: request({ reference_images: [{ uri: "asset://asset-1" }] }),
				modelName: "Seedance",
			}),
		).resolves.toEqual({ proceed: false, reason: "agreement-cancelled" })
		expect(startLibraryAssetCompliance).not.toHaveBeenCalled()
	})

	it("cancels when the agreement gate is unavailable", async () => {
		const { canvas, startLibraryAssetCompliance } = createCanvas({
			getAssetComplianceStatus: vi.fn().mockResolvedValue({
				assetId: "asset-1",
				status: "UNVERIFIED",
				failedReason: null,
			}),
			startExistingAssetCompliance: vi.fn(),
		})
		vi.spyOn(assetDetailStore, "getWithFileKey").mockResolvedValue({
			asset_id: "asset-1",
			file_key: "private/portrait.png",
			compliance_status: "UNVERIFIED",
		} as never)

		await expect(
			runSeedanceImageCompliancePreflight({
				canvas,
				sourceVideoElementId: "video-1",
				request: request({ reference_images: [{ uri: "asset://asset-1" }] }),
				modelName: "Seedance",
			}),
		).resolves.toEqual({ proceed: false, reason: "agreement-error" })
		expect(startLibraryAssetCompliance).not.toHaveBeenCalled()
	})

	it("cancels after agreement if the source video Content changes while waiting", async () => {
		let resolveAgreement!: (signed: boolean) => void
		const ensureAssetAgreementSigned = vi.fn(
			() => new Promise<boolean>((resolve) => (resolveAgreement = resolve)),
		)
		const video = {
			id: "video-1",
			type: ElementTypeEnum.Video,
			activeContentId: "video-content",
			mainContentId: "video-content",
			contents: [{ contentId: "video-content", src: "./videos/source.mp4" }],
		} as unknown as LayerElement
		const { canvas, startLibraryAssetCompliance } = createCanvas(
			{
				getAssetComplianceStatus: vi.fn().mockResolvedValue({
					assetId: "asset-1",
					status: "UNVERIFIED",
					failedReason: null,
				}),
				ensureAssetAgreementSigned,
				startExistingAssetCompliance: vi.fn(),
			},
			{
				elementData: new Map([["video-1", video]]),
			},
		)
		vi.spyOn(assetDetailStore, "getWithFileKey").mockResolvedValue({
			asset_id: "asset-1",
			file_key: "private/portrait.png",
			compliance_status: "UNVERIFIED",
		} as never)

		const pending = runSeedanceImageCompliancePreflight({
			canvas,
			sourceVideoElementId: "video-1",
			request: request({ reference_images: [{ uri: "asset://asset-1" }] }),
			modelName: "Seedance",
		})
		await vi.waitFor(() => expect(ensureAssetAgreementSigned).toHaveBeenCalledTimes(1))
		;(video as { contents: Array<{ contentId: string; src: string }> }).contents[0].src =
			"./videos/replaced.mp4"
		resolveAgreement(true)

		await expect(pending).resolves.toEqual({ proceed: false, reason: "source-changed" })
		expect(startLibraryAssetCompliance).not.toHaveBeenCalled()
	})

	it("fails open when status lookup fails", async () => {
		const { canvas, startLibraryAssetCompliance } = createCanvas({
			getAssetComplianceStatus: vi.fn().mockRejectedValue(new Error("offline")),
			ensureAssetAgreementSigned: vi.fn(),
			startExistingAssetCompliance: vi.fn(),
		})

		await expect(
			runSeedanceImageCompliancePreflight({
				canvas,
				sourceVideoElementId: "video-1",
				request: request({ reference_images: [{ uri: "asset://asset-1" }] }),
				modelName: "Seedance",
			}),
		).resolves.toEqual({ proceed: true })
		expect(startLibraryAssetCompliance).not.toHaveBeenCalled()
	})

	it("does not trigger for a non-Seedance model or a workspace image without assetId", async () => {
		const methods: Partial<CanvasDesignMethods> = {
			getAssetComplianceStatus: vi.fn(),
			ensureAssetAgreementSigned: vi.fn(),
			startExistingAssetCompliance: vi.fn(),
		}
		const { canvas, startLibraryAssetCompliance } = createCanvas(methods)

		await runSeedanceImageCompliancePreflight({
			canvas,
			sourceVideoElementId: "video-1",
			request: request({ reference_images: [{ uri: "./images/portrait.png" }] }),
			modelName: "Seedream",
		})
		await runSeedanceImageCompliancePreflight({
			canvas,
			sourceVideoElementId: "video-1",
			request: request({ reference_images: [{ uri: "./images/portrait.png" }] }),
			modelName: "Seedance",
		})

		expect(startLibraryAssetCompliance).not.toHaveBeenCalled()
	})
})
