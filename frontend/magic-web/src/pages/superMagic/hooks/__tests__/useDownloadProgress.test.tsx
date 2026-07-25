import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useDownloadProgress } from "../useDownloadProgress"

const mocks = vi.hoisted(() => ({
	toastLoading: vi.fn(),
	toastDestroy: vi.fn(),
}))

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock("@/apis", () => ({
	SuperMagicApi: {
		createBatchDownload: vi.fn(),
		checkBatchDownloadStatus: vi.fn(),
	},
}))

vi.mock("@/pages/superMagic/utils/handleFIle", () => ({
	downloadFileWithAnchor: vi.fn(),
}))

vi.mock("@/components/base/MagicToaster/utils", () => ({
	default: {
		loading: mocks.toastLoading,
		destroy: mocks.toastDestroy,
	},
}))

vi.mock("@/utils/create-random-uuid-v4", () => ({
	createRandomUuidV4: () => "download-toast",
}))

vi.mock("@/pages/superMagic/components/DownloadProgressToast", () => ({
	default: () => null,
}))

describe("useDownloadProgress custom downloads", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("shares progress and success lifecycle with batch downloads", async () => {
		const onSuccess = vi.fn()
		const { result } = renderHook(() => useDownloadProgress())

		let completed = false
		await act(async () => {
			completed = await result.current.startCustomDownload({
				label: "Downloading media",
				task: async ({ reportProgress }) => {
					reportProgress(45)
					return { successCount: 2 }
				},
				onSuccess,
			})
		})

		expect(completed).toBe(true)
		expect(onSuccess).toHaveBeenCalledWith({ successCount: 2 })
		expect(result.current.progress).toBe(100)
		expect(
			mocks.toastLoading.mock.calls.some(
				([options]) => options.content.props.progress === 45,
			),
		).toBe(true)
	})

	it("aborts the active custom task when the user cancels", async () => {
		const onCancel = vi.fn()
		const { result } = renderHook(() => useDownloadProgress())
		let taskSignal: AbortSignal | undefined
		let pendingDownload: Promise<boolean>

		act(() => {
			pendingDownload = result.current.startCustomDownload({
				task: ({ signal }) => {
					taskSignal = signal
					return new Promise<void>((_resolve, reject) => {
						signal.addEventListener("abort", () => {
							reject(new DOMException("aborted", "AbortError"))
						})
					})
				},
				onCancel,
			})
		})

		await waitFor(() => expect(taskSignal).toBeDefined())
		act(() => result.current.cancelDownload())

		await expect(pendingDownload!).resolves.toBe(false)
		expect(taskSignal?.aborted).toBe(true)
		expect(onCancel).toHaveBeenCalledTimes(1)
		expect(result.current.isDownloading).toBe(false)
	})

	it("reports custom task failures without leaving progress active", async () => {
		const failure = new Error("zip failed")
		const onError = vi.fn()
		const { result } = renderHook(() => useDownloadProgress())

		let completed = true
		await act(async () => {
			completed = await result.current.startCustomDownload({
				task: async () => {
					throw failure
				},
				onError,
			})
		})

		expect(completed).toBe(false)
		expect(onError).toHaveBeenCalledWith(failure)
		expect(result.current.isDownloading).toBe(false)
	})
})
