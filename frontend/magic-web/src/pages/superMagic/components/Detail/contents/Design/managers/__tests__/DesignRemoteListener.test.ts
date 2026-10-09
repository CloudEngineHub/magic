import { afterEach, describe, expect, it, vi } from "vitest"
import {
	DesignRemoteListener,
	designDataHasPendingMediaWithoutGenerationDetails,
	type DesignRemoteListenerOptions,
} from "../DesignRemoteListener"
import { ElementTypeEnum } from "@/components/CanvasDesign/runtime/document/types"
import type { DesignData } from "../../types"

const DESIGN_DATA: DesignData = {
	type: "design",
	name: "design",
	version: "3.0.0",
	canvas: { elements: [] },
}

afterEach(() => {
	vi.useRealTimers()
})

function createListener(
	overrides: Partial<DesignRemoteListenerOptions> = {},
): DesignRemoteListener {
	const options: DesignRemoteListenerOptions = {
		allowEdit: true,
		isPlaybackMode: false,
		isShareRoute: false,
		isMobile: false,
		projectId: "project-1",
		designProjectId: "design-1",
		remoteUpdateListenerMode: "file-change",
		getMagicProjectJsFileId: () => null,
		getIsViewingHistory: () => false,
		getDesignDataName: () => "design",
		fetchAndSetVersions: vi.fn().mockResolvedValue([]),
		loadAndApplyRemote: vi.fn().mockResolvedValue(true),
		fetchRemoteDesignData: vi.fn().mockResolvedValue(null),
		applyRemoteDesignData: vi.fn().mockReturnValue(true),
		checkRemoteUpdate: vi.fn().mockResolvedValue({
			hasUpdate: false,
			currentVersion: null,
			isCheckReliable: true,
		}),
		getLocalVersion: () => 2,
		updateLocalVersion: vi.fn(),
		updateListenerDebounceMs: 0,
		setIsProcessingRevoke: vi.fn(),
		setRevokeType: vi.fn(),
		...overrides,
	}
	const listener = new DesignRemoteListener(options)
	;(listener as unknown as { isMounted: boolean }).isMounted = true
	return listener
}

function createDeferred<T>() {
	let resolve!: (value: T) => void
	const promise = new Promise<T>((resolvePromise) => {
		resolve = resolvePromise
	})
	return { promise, resolve }
}

describe("DesignRemoteListener file-change freshness", () => {
	it("detects nested processing media whose sidecar generation request is not hydrated", () => {
		const data: DesignData = {
			...DESIGN_DATA,
			canvas: {
				elements: [
					{
						id: "frame-1",
						type: ElementTypeEnum.Frame,
						name: "Frame",
						x: 0,
						y: 0,
						width: 100,
						height: 100,
						contents: [{ contentId: "frame-content-1" }],
						activeContentId: "frame-content-1",
						mainContentId: "frame-content-1",
						children: [
							{
								id: "image-1",
								type: ElementTypeEnum.Image,
								name: "Generating image",
								x: 0,
								y: 0,
								width: 100,
								height: 100,
								contents: [
									{
										contentId: "image-content-1",
										status: "completed",
										generateImageRequest: { prompt: "active content" },
									},
									{
										contentId: "image-content-2",
										status: "processing",
									},
								],
								activeContentId: "image-content-1",
								mainContentId: "image-content-1",
							},
						],
					},
				],
			},
		}

		expect(designDataHasPendingMediaWithoutGenerationDetails(data)).toBe(true)

		const image = (
			data.canvas?.elements?.[0] as unknown as {
				children: Array<{
					contents: Array<Record<string, unknown>>
					activeContentId: string
				}>
			}
		).children[0]
		const imageContent = image.contents.find(
			(content) => content.contentId === "image-content-2",
		)
		if (!imageContent) throw new Error("Expected image content")
		imageContent.generateImageRequest = { prompt: "A product photo" }
		expect(designDataHasPendingMediaWithoutGenerationDetails(data)).toBe(true)

		imageContent.generateImageRequest.start_time = "2026-10-07T15:31:00.000+08:00"
		expect(designDataHasPendingMediaWithoutGenerationDetails(data)).toBe(true)

		imageContent.generateImageRequest.expected_finished_at = "2026-10-07T15:32:10.000+08:00"
		expect(designDataHasPendingMediaWithoutGenerationDetails(data)).toBe(false)
	})

	it("uses file version when updated_at looks stale", async () => {
		const listener = createListener()
		const apply = vi.fn()
		;(
			listener as unknown as { lastKnownMagicProjectJsUpdatedAtMs: number }
		).lastKnownMagicProjectJsUpdatedAtMs = Date.parse("2026-01-01T00:00:00.000Z")
		;(listener as unknown as { debouncedLoadAndApply: typeof apply }).debouncedLoadAndApply =
			apply

		await (
			listener as unknown as {
				handleConfirmedFileChange: (
					fileUpdatedAtMs?: number | null,
					fileVersion?: number | null,
				) => Promise<void>
			}
		).handleConfirmedFileChange(Date.parse("2025-12-31T23:59:59.000Z"), 3)

		expect(apply).toHaveBeenCalledWith(Date.parse("2025-12-31T23:59:59.000Z"), 3)
	})

	it("checks remote state when updated_at is stale and file version is absent", async () => {
		const checkRemoteUpdate = vi.fn().mockResolvedValue({
			hasUpdate: false,
			currentVersion: null,
			isCheckReliable: true,
		})
		const listener = createListener({ checkRemoteUpdate })
		;(
			listener as unknown as { lastKnownMagicProjectJsUpdatedAtMs: number }
		).lastKnownMagicProjectJsUpdatedAtMs = Date.parse("2026-01-01T00:00:00.000Z")

		await (
			listener as unknown as {
				handleConfirmedFileChange: (
					fileUpdatedAtMs?: number | null,
					fileVersion?: number | null,
				) => Promise<void>
			}
		).handleConfirmedFileChange(Date.parse("2025-12-31T23:59:59.000Z"), null)

		expect(checkRemoteUpdate).toHaveBeenCalledTimes(1)
	})

	it("does not mark the remote version applied when preloaded remote data is deferred", async () => {
		vi.useFakeTimers()
		const updateLocalVersion = vi.fn()
		const applyRemoteDesignData = vi.fn().mockReturnValue(false)
		const listener = createListener({
			applyRemoteDesignData,
			updateLocalVersion,
		})
		const listenerInternals = listener as unknown as {
			maybePrepareRemoteDesignDataFromMagicProjectFile: () => Promise<DesignData>
			debouncedLoadAndApply: (ms: null, version: number) => void
		}
		listenerInternals.maybePrepareRemoteDesignDataFromMagicProjectFile = vi
			.fn()
			.mockResolvedValue(DESIGN_DATA)

		listenerInternals.debouncedLoadAndApply(null, 4)
		await vi.runOnlyPendingTimersAsync()

		expect(applyRemoteDesignData).toHaveBeenCalledWith(DESIGN_DATA, "message", {
			remoteVersion: 4,
		})
		expect(updateLocalVersion).not.toHaveBeenCalled()
	})

	it("does not apply file-change data while viewing history", async () => {
		vi.useFakeTimers()
		const fetchAndSetVersions = vi.fn().mockResolvedValue([])
		const applyRemoteDesignData = vi.fn().mockReturnValue(true)
		const updateLocalVersion = vi.fn()
		const listener = createListener({
			getIsViewingHistory: () => true,
			fetchAndSetVersions,
			applyRemoteDesignData,
			updateLocalVersion,
		})
		const listenerInternals = listener as unknown as {
			maybePrepareRemoteDesignDataFromMagicProjectFile: () => Promise<DesignData>
			debouncedLoadAndApply: (ms: null, version: number) => void
		}
		listenerInternals.maybePrepareRemoteDesignDataFromMagicProjectFile = vi
			.fn()
			.mockResolvedValue(DESIGN_DATA)

		listenerInternals.debouncedLoadAndApply(null, 4)
		await vi.runOnlyPendingTimersAsync()

		expect(fetchAndSetVersions).toHaveBeenCalledTimes(1)
		expect(applyRemoteDesignData).not.toHaveBeenCalled()
		expect(updateLocalVersion).not.toHaveBeenCalled()
	})

	it("marks the remote version applied after preloaded remote data is applied", async () => {
		vi.useFakeTimers()
		const updateLocalVersion = vi.fn()
		const applyRemoteDesignData = vi.fn().mockReturnValue(true)
		const listener = createListener({
			applyRemoteDesignData,
			updateLocalVersion,
		})
		const listenerInternals = listener as unknown as {
			maybePrepareRemoteDesignDataFromMagicProjectFile: () => Promise<DesignData>
			debouncedLoadAndApply: (ms: null, version: number) => void
		}
		listenerInternals.maybePrepareRemoteDesignDataFromMagicProjectFile = vi
			.fn()
			.mockResolvedValue(DESIGN_DATA)

		listenerInternals.debouncedLoadAndApply(null, 4)
		await vi.runOnlyPendingTimersAsync()

		expect(applyRemoteDesignData).toHaveBeenCalledWith(DESIGN_DATA, "message", {
			remoteVersion: 4,
		})
		expect(updateLocalVersion).toHaveBeenCalledWith(4)
	})

	it("discards an in-flight file-change load after the project changes", async () => {
		vi.useFakeTimers()
		const deferredData = createDeferred<DesignData>()
		const applyRemoteDesignData = vi.fn().mockReturnValue(true)
		const listener = createListener({ applyRemoteDesignData })
		const listenerInternals = listener as unknown as {
			maybePrepareRemoteDesignDataFromMagicProjectFile: () => Promise<DesignData>
			debouncedLoadAndApply: (ms: null, version: number) => void
		}
		listenerInternals.maybePrepareRemoteDesignDataFromMagicProjectFile = vi
			.fn()
			.mockReturnValue(deferredData.promise)

		listenerInternals.debouncedLoadAndApply(null, 4)
		await vi.advanceTimersByTimeAsync(0)
		listener.updateOptions({ projectId: "project-2", designProjectId: "design-2" })
		deferredData.resolve(DESIGN_DATA)
		await Promise.resolve()
		await Promise.resolve()

		expect(applyRemoteDesignData).not.toHaveBeenCalled()
	})
})
