import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { PPTActiveIndexCacheManager } from "../PPTActiveIndexCacheManager"

const mockState = vi.hoisted(() => ({
	getProjectState: vi.fn(),
	updateFileState: vi.fn(),
}))

vi.mock("@/models/config/repositories/SuperProjectStateRepository", () => ({
	ProjectStateRepository: class {
		getProjectState = mockState.getProjectState
		updateFileState = mockState.updateFileState
	},
}))

vi.mock("@/pages/superMagic/utils/superMagicCache", () => ({
	WorkspaceStateCache: { get: vi.fn(() => undefined) },
}))

vi.mock("@/pages/superMagic/utils/query", () => ({
	getSuperIdState: vi.fn(() => ({})),
}))

vi.mock("@/models/user", () => ({
	userStore: { user: { userInfo: undefined } },
}))

const logger = {
	debug: vi.fn(),
	warn: vi.fn(),
	error: vi.fn(),
}

describe("PPTActiveIndexCacheManager", () => {
	let manager: PPTActiveIndexCacheManager

	beforeEach(() => {
		vi.useFakeTimers()
		vi.clearAllMocks()
		manager = new PPTActiveIndexCacheManager(logger as never, {
			organizationCode: "organization",
			selectedProjectId: "project",
			mainFileId: "old-main-file",
		})
	})

	afterEach(() => {
		manager.dispose()
		vi.useRealTimers()
	})

	it("cancels a debounced save when the deck identity is cleared", async () => {
		manager.saveActiveIndexDebounced(7)
		manager.updateConfig({
			organizationCode: "organization",
			selectedProjectId: "project",
			mainFileId: undefined,
		})

		await vi.advanceTimersByTimeAsync(500)

		expect(mockState.getProjectState).not.toHaveBeenCalled()
		expect(mockState.updateFileState).not.toHaveBeenCalled()
	})

	it("drops an in-flight save after the deck identity changes", async () => {
		let resolveProjectState: (state: {
			fileState: { pptActiveIndexMap: object }
		}) => void = () => undefined
		mockState.getProjectState.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					resolveProjectState = resolve
				}),
		)

		manager.saveActiveIndexDebounced(9)
		await vi.advanceTimersByTimeAsync(500)
		expect(mockState.getProjectState).toHaveBeenCalledTimes(1)

		manager.updateConfig({
			organizationCode: "organization",
			selectedProjectId: "project",
			mainFileId: undefined,
		})
		resolveProjectState({ fileState: { pptActiveIndexMap: {} } })
		await Promise.resolve()
		await Promise.resolve()

		expect(mockState.updateFileState).not.toHaveBeenCalled()
	})

	it("drops an in-flight restore after the deck identity changes", async () => {
		let resolveProjectState: (state: {
			fileState: { pptActiveIndexMap: Record<string, number> }
		}) => void = () => undefined
		mockState.getProjectState.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					resolveProjectState = resolve
				}),
		)

		const restore = manager.restoreActiveIndex()
		await vi.waitFor(() => expect(mockState.getProjectState).toHaveBeenCalledTimes(1))

		manager.updateConfig({
			organizationCode: "organization",
			selectedProjectId: "project",
			mainFileId: undefined,
		})
		resolveProjectState({
			fileState: { pptActiveIndexMap: { "old-main-file": 12 } },
		})

		await expect(restore).resolves.toBeNull()
	})
})
