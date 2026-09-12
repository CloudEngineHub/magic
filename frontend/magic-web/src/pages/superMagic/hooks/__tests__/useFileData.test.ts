import { renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { SuperMagicApi } from "@/apis"
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

	it("skips history versions on share routes even without isSharePreview", async () => {
		isShareRouteState.current = true

		renderHook(() =>
			useFileData({
				file_id: "file-1",
				activeFileId: "file-1",
			}),
		)

		await waitFor(() => {
			expect(getTemporaryDownloadUrlMock).toHaveBeenCalledWith({
				file_ids: ["file-1"],
			})
		})
		expect(getFileHistoryVersionsMock).not.toHaveBeenCalled()
	})
})
