import { afterEach, describe, expect, it, vi } from "vitest"
import { DesignRemoteListener, type DesignRemoteListenerOptions } from "../DesignRemoteListener"
import type { DesignData } from "../../types"

const DESIGN_DATA: DesignData = {
	type: "design",
	name: "design",
	version: "2.0.0",
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

describe("DesignRemoteListener file-change freshness", () => {
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
})
