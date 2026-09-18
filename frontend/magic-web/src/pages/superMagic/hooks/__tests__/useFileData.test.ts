import { createElement, type ReactNode } from "react"
import { renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { SuperMagicApi } from "@/apis"
import { FileAccessProvider } from "@/pages/superMagic/fileAccess/FileAccessProvider"
import { createShareFileAccess } from "@/pages/superMagic/fileAccess/fileAccessContext"
import { downloadFileContent, getTemporaryDownloadUrl } from "@/pages/superMagic/utils/api"
import { useFileData } from "../useFileData"

const isShareRouteState = vi.hoisted(() => ({ current: false }))

vi.mock("ahooks", async (importOriginal) => {
	const react = await import("react")
	const actual = await importOriginal<typeof import("ahooks")>()
	return {
		...actual,
		useDebounceEffect: (fn: () => void, deps?: unknown[]) => {
			react.useEffect(fn, deps)
		},
	}
})

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock("@/apis", () => ({
	SuperMagicApi: {
		getFileHistoryVersions: vi.fn(),
		rollbackFileVersion: vi.fn(),
	},
}))

vi.mock("@/pages/superMagic/utils/api", () => ({
	getTemporaryDownloadUrl: vi.fn(),
	downloadFileContent: vi.fn(),
}))

vi.mock("../useShareRoute", () => ({
	default: () => ({ isShareRoute: isShareRouteState.current }),
}))

vi.mock("@/utils/pubsub", () => ({
	default: {
		subscribe: vi.fn(),
		unsubscribe: vi.fn(),
	},
	PubSubEvents: {
		Change_Preview_File: "Change_Preview_File",
	},
}))

vi.mock("@/pages/superMagic/stores", () => ({
	superMagicStore: {
		subscribe: vi.fn(() => () => undefined),
	},
}))

vi.mock("@/components/base/MagicToaster/utils", () => ({
	default: {
		loading: vi.fn(),
		destroy: vi.fn(),
		success: vi.fn(),
	},
}))

const getFileHistoryVersionsMock = vi.mocked(SuperMagicApi.getFileHistoryVersions)
const getTemporaryDownloadUrlMock = vi.mocked(getTemporaryDownloadUrl)
const downloadFileContentMock = vi.mocked(downloadFileContent)

describe("useFileData", () => {
	beforeEach(() => {
		isShareRouteState.current = false
		getFileHistoryVersionsMock.mockReset()
		getTemporaryDownloadUrlMock.mockReset()
		downloadFileContentMock.mockReset()
		getFileHistoryVersionsMock.mockResolvedValue({ list: [{ version: 1 }] } as never)
		getTemporaryDownloadUrlMock.mockResolvedValue([
			{ file_id: "file-1", url: "https://oss.test/file-1" },
		] as never)
		downloadFileContentMock.mockResolvedValue("<html></html>")
	})

	it("loads project files via history versions when the active tab matches", async () => {
		renderHook(() =>
			useFileData({
				file_id: "file-1",
				activeFileId: "file-1",
			}),
		)

		await waitFor(() => {
			expect(getFileHistoryVersionsMock).toHaveBeenCalledWith({
				file_id: "file-1",
				page_size: 10,
			})
		})
	})

	it("does not read a share file while an external session supplies its content", async () => {
		const access = createShareFileAccess({ token: "share-token", projectId: "origin-project" })
		const { result, rerender } = renderHook(
			({ enabled }) => useFileData({ file_id: "file-1", isSharePreview: true, enabled }),
			{
				initialProps: { enabled: false },
				wrapper: ({ children }: { children: ReactNode }) =>
					createElement(FileAccessProvider, { value: access }, children),
			},
		)
		expect(result.current.loading).toBe(false)
		expect(getTemporaryDownloadUrlMock).not.toHaveBeenCalled()
		expect(getFileHistoryVersionsMock).not.toHaveBeenCalled()
		rerender({ enabled: true })
		await waitFor(() =>
			expect(getTemporaryDownloadUrlMock).toHaveBeenCalledWith({
				file_ids: ["file-1"],
				access,
			}),
		)
	})

	it("skips history versions on share routes even without isSharePreview", async () => {
		isShareRouteState.current = true
		const access = createShareFileAccess({
			token: "share-token",
			projectId: "origin-project",
			topicId: "share-topic",
		})

		renderHook(
			() =>
				useFileData({
					file_id: "file-1",
					activeFileId: "file-1",
				}),
			{
				wrapper: ({ children }: { children: ReactNode }) =>
					createElement(FileAccessProvider, { value: access }, children),
			},
		)

		await waitFor(() => {
			expect(getTemporaryDownloadUrlMock).toHaveBeenCalledWith({
				file_ids: ["file-1"],
				access,
			})
		})
		expect(getFileHistoryVersionsMock).not.toHaveBeenCalled()
	})

	it("does not request share file urls before share access is ready", async () => {
		isShareRouteState.current = true

		renderHook(() =>
			useFileData({
				file_id: "file-1",
				activeFileId: "file-1",
			}),
		)

		await Promise.resolve()
		expect(getTemporaryDownloadUrlMock).not.toHaveBeenCalled()
		expect(getFileHistoryVersionsMock).not.toHaveBeenCalled()
	})

	it("requests share file urls once share access arrives", async () => {
		isShareRouteState.current = true
		const access = createShareFileAccess({
			token: "share-token",
			projectId: "origin-project",
			topicId: "share-topic",
		})
		let currentAccess: ReturnType<typeof createShareFileAccess> | null = null

		const { rerender } = renderHook(
			() =>
				useFileData({
					file_id: "file-1",
					activeFileId: "file-1",
				}),
			{
				wrapper: ({ children }: { children: ReactNode }) =>
					createElement(FileAccessProvider, { value: currentAccess }, children),
			},
		)

		expect(getTemporaryDownloadUrlMock).not.toHaveBeenCalled()

		currentAccess = access
		rerender()

		await waitFor(() => {
			expect(getTemporaryDownloadUrlMock).toHaveBeenCalledWith({
				file_ids: ["file-1"],
				access,
			})
		})
	})

	it("keeps share preview content mounted when only the share token rotates", async () => {
		isShareRouteState.current = true
		let currentAccess = createShareFileAccess({
			token: "share-token-1",
			projectId: "origin-project",
			topicId: "share-topic",
		})

		const { result, rerender } = renderHook(
			() =>
				useFileData({
					file_id: "file-1",
					activeFileId: "file-1",
					isSharePreview: true,
				}),
			{
				wrapper: ({ children }: { children: ReactNode }) =>
					createElement(FileAccessProvider, { value: currentAccess }, children),
			},
		)

		await waitFor(() => {
			expect(result.current.fileData).toBe("<html></html>")
			expect(result.current.loading).toBe(false)
		})

		getTemporaryDownloadUrlMock.mockResolvedValue([
			{ file_id: "file-1", url: "https://oss.test/file-1-refreshed" },
		] as never)

		currentAccess = createShareFileAccess({
			token: "share-token-2",
			projectId: "origin-project",
			topicId: "share-topic",
		})
		rerender()

		await waitFor(() => {
			expect(getTemporaryDownloadUrlMock).toHaveBeenCalledTimes(2)
		})
		// Soft refresh must not blank the preview while the share token rotates.
		expect(result.current.loading).toBe(false)
		expect(result.current.fileData).toBe("<html></html>")
	})
})
