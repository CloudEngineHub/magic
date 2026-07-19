import { act, renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { Workspace } from "@/pages/superMagic/pages/Workspace/types"
import { workspaceStore } from "@/pages/superMagic/stores/core"
import { useWorkspacesPage } from "../useWorkspacesPage"

vi.hoisted(() => {
	const values = new Map<string, string>()
	const localStorageMock = {
		clear: () => values.clear(),
		getItem: (key: string) => values.get(key) ?? null,
		key: (index: number) => Array.from(values.keys())[index] ?? null,
		removeItem: (key: string) => values.delete(key),
		setItem: (key: string, value: string) => values.set(key, value),
		get length() {
			return values.size
		},
	}

	Object.defineProperty(globalThis, "localStorage", {
		value: localStorageMock,
		configurable: true,
	})
	Object.defineProperty(globalThis.window, "localStorage", {
		value: localStorageMock,
		configurable: true,
	})
})

const getWorkspacesMock = vi.fn()
const deleteWorkspaceMock = vi.fn()
const clearProjectAndTopicSelectionMock = vi.fn()
const navigateMock = vi.fn()
const toastSuccessMock = vi.fn()

// Creates deterministic workspace fixtures without using production IDs or names.
function createWorkspace(index: number, overrides: Partial<Workspace> = {}): Workspace {
	return {
		id: overrides.id ?? `workspace-${index}`,
		name: overrides.name ?? `Workspace ${index}`,
		is_archived: 0,
		current_topic_id: "",
		current_project_id: null,
		workspace_status: "waiting",
		project_count: 0,
		workspace_type: "default",
		...overrides,
	}
}

// Builds a stable page of workspace fixtures for pagination behavior tests.
function createWorkspacePage(count: number): Workspace[] {
	return Array.from({ length: count }, (_, index) => createWorkspace(index + 1))
}

vi.mock("@/apis", () => ({
	SuperMagicApi: {
		getWorkspaces: (...args: unknown[]) => getWorkspacesMock(...args),
	},
}))

vi.mock("@/pages/superMagic/services", () => ({
	default: {
		workspace: {
			createWorkspace: vi.fn(),
			deleteWorkspace: (...args: unknown[]) => deleteWorkspaceMock(...args),
			renameWorkspaceWithRefresh: vi.fn(),
			pinWorkspace: vi.fn(),
		},
		clearProjectAndTopicSelection: (...args: unknown[]) =>
			clearProjectAndTopicSelectionMock(...args),
	},
}))

vi.mock("@/routes/hooks/useNavigate", () => ({
	default: () => navigateMock,
}))

vi.mock("@/components/base/MagicToaster/utils", () => ({
	default: {
		success: (...args: unknown[]) => toastSuccessMock(...args),
	},
}))

vi.mock("@/utils/manualPerfLogger", () => ({
	manualPerfLogger: {
		count: vi.fn(),
		ensureSession: vi.fn(),
		finishSession: vi.fn(),
		isEnabled: () => false,
		markEnd: vi.fn(),
		markStart: vi.fn(),
		measure: (_name: string, callback: () => unknown) => callback(),
		now: () => 0,
		recordDuration: vi.fn(),
		recordMetric: vi.fn(),
	},
	measureManualPerfOperation: (_name: string, callback: () => unknown) => callback(),
}))

vi.mock("react-i18next", () => ({
	initReactI18next: {
		type: "3rdParty",
		init: vi.fn(),
	},
	useTranslation: () => ({
		t: (key: string, params?: { count?: number }) => {
			if (key === "workspace.projectCount") return `${params?.count ?? 0} projects`
			return key
		},
		i18n: { language: "zh_CN" },
	}),
}))

describe("useWorkspacesPage", () => {
	beforeEach(() => {
		getWorkspacesMock.mockReset()
		deleteWorkspaceMock.mockReset()
		clearProjectAndTopicSelectionMock.mockReset()
		navigateMock.mockReset()
		toastSuccessMock.mockReset()
		workspaceStore.reset()
	})

	afterEach(() => {
		vi.clearAllMocks()
		workspaceStore.reset()
	})

	it("refreshes the first mobile page after deleting a workspace to keep pagination state aligned", async () => {
		getWorkspacesMock
			.mockResolvedValueOnce({
				list: createWorkspacePage(100),
				total: 101,
			})
			.mockResolvedValueOnce({
				list: createWorkspacePage(100),
				total: 100,
			})
		deleteWorkspaceMock.mockResolvedValue(null)

		const { result } = renderHook(() => useWorkspacesPage())

		await waitFor(() => {
			expect(result.current.allWorkspaces).toHaveLength(100)
		})
		expect(result.current.hasMore).toBe(true)

		await act(async () => {
			await result.current.handleDeleteWorkspace("workspace-1")
		})

		await waitFor(() => {
			expect(getWorkspacesMock).toHaveBeenCalledTimes(2)
		})
		expect(getWorkspacesMock).toHaveBeenNthCalledWith(2, {
			page: 1,
			page_size: 100,
		})
		expect(result.current.hasMore).toBe(false)
	})

	it("does not expose more pages while delete refresh is replacing the first mobile page", async () => {
		let resolveRefresh: ((value: { list: Workspace[]; total: number }) => void) | undefined

		getWorkspacesMock
			.mockResolvedValueOnce({
				list: createWorkspacePage(100),
				total: 100,
			})
			.mockImplementationOnce(
				() =>
					new Promise((resolve) => {
						resolveRefresh = resolve
					}),
			)
		deleteWorkspaceMock.mockImplementation(async (id: string) => {
			// Mirror the shared workspace service optimistic removal that happens before page 1 refresh.
			workspaceStore.setWorkspaces(workspaceStore.workspaces.filter((item) => item.id !== id))
			return null
		})

		const { result } = renderHook(() => useWorkspacesPage())

		await waitFor(() => {
			expect(result.current.allWorkspaces).toHaveLength(100)
		})
		expect(result.current.hasMore).toBe(false)

		let deletePromise!: Promise<void>
		await act(async () => {
			deletePromise = result.current.handleDeleteWorkspace("workspace-1")
		})

		await waitFor(() => {
			expect(result.current.allWorkspaces).toHaveLength(99)
		})
		expect(result.current.hasMore).toBe(false)

		await act(async () => {
			resolveRefresh?.({
				list: createWorkspacePage(99),
				total: 99,
			})
			await deletePromise
		})

		expect(getWorkspacesMock).toHaveBeenCalledTimes(2)
		expect(getWorkspacesMock).toHaveBeenNthCalledWith(2, {
			page: 1,
			page_size: 100,
		})
		expect(result.current.hasMore).toBe(false)
	})
})
