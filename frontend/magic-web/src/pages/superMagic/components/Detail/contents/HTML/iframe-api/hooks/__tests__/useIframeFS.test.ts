import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { FSFileItem, SaveContentFn } from "../../services/IframeFSService"
import { useIframeFS } from "../useIframeFS"

function makeIframeRef(postMessage = vi.fn()) {
	return {
		current: {
			contentWindow: { postMessage },
		} as unknown as HTMLIFrameElement,
	}
}

const targetOrigin = "https://sandbox.example.com"

describe("useIframeFS", () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	it("keeps watchFile registrations when fileList and saveContentFn update", async () => {
		const iframePostMessage = vi.fn()
		const iframeRef = makeIframeRef(iframePostMessage)
		const uploadFn = vi.fn()
		const initialSaveContentFn = vi.fn<SaveContentFn>()
		const updatedSaveContentFn = vi.fn<SaveContentFn>()
		const initialFileList: FSFileItem[] = [
			{
				file_id: "file-1",
				relative_file_path: "app/data.json",
				updated_at: "2026-08-05 10:00:00",
			},
		]

		const { result, rerender } = renderHook(
			({ fileList, saveContentFn }) =>
				useIframeFS({
					iframeRef,
					targetOrigin,
					entryPath: "app/index.html",
					fileList,
					appConfig: null,
					uploadFn,
					saveContentFn,
				}),
			{
				initialProps: {
					fileList: initialFileList,
					saveContentFn: initialSaveContentFn,
				},
			},
		)

		await act(async () => {
			await result.current.handleFSMessage("MAGIC_FS_WATCH_REGISTER", {
				requestId: "watch-1",
				path: "data.json",
			})
		})

		rerender({
			fileList: [
				{
					...initialFileList[0],
					updated_at: "2026-08-05 10:01:00",
				},
			],
			saveContentFn: updatedSaveContentFn,
		})

		act(() => {
			vi.advanceTimersByTime(3000)
		})

		expect(iframePostMessage).toHaveBeenCalledWith(
			{
				type: "MAGIC_FS_FILE_CHANGED",
				path: "data.json",
				timestamp: expect.any(Number),
			},
			targetOrigin,
		)
	})

	it("uses the latest saveContentFn after rerender", async () => {
		const iframeRef = makeIframeRef()
		const uploadFn = vi.fn()
		const initialSaveContentFn = vi.fn<SaveContentFn>().mockResolvedValue(undefined)
		const updatedSaveContentFn = vi.fn<SaveContentFn>().mockResolvedValue(undefined)
		const fileList: FSFileItem[] = [
			{
				file_id: "file-1",
				relative_file_path: "app/data.json",
				updated_at: "2026-08-05 10:00:00",
			},
		]

		const { result, rerender } = renderHook(
			({ saveContentFn }) =>
				useIframeFS({
					iframeRef,
					targetOrigin,
					entryPath: "app/index.html",
					fileList,
					appConfig: null,
					uploadFn,
					saveContentFn,
				}),
			{
				initialProps: { saveContentFn: initialSaveContentFn },
			},
		)

		rerender({ saveContentFn: updatedSaveContentFn })

		await act(async () => {
			await result.current.handleFSMessage("MAGIC_FS_WRITE_REQUEST", {
				requestId: "write-1",
				path: "data.json",
				content: "updated content",
			})
		})

		expect(initialSaveContentFn).not.toHaveBeenCalled()
		expect(updatedSaveContentFn).toHaveBeenCalledWith({
			file_id: "file-1",
			content: "updated content",
		})
	})
})
