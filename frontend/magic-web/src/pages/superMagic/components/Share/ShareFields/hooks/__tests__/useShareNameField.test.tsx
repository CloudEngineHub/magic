import { renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useShareNameField } from "../useShareNameField"

vi.hoisted(() => {
	const storageMock = {
		getItem: () => null,
		setItem: vi.fn(),
		removeItem: vi.fn(),
		clear: vi.fn(),
		key: vi.fn(),
		length: 0,
	}

	Object.defineProperty(globalThis, "localStorage", {
		value: storageMock,
		configurable: true,
	})
	Object.defineProperty(globalThis, "sessionStorage", {
		value: storageMock,
		configurable: true,
	})
})

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string, values?: Record<string, unknown>) => {
			if (key === "share.projectShareName") {
				return `项目分享_${values?.projectName ?? ""}`
			}
			if (key === "share.singleFileShareName") {
				return `文件分享_${values?.fileName ?? ""}`
			}
			if (key === "share.multiFileShareName") {
				return `文件分享_${values?.mainFileName ?? ""} 等 ${values?.count ?? 0} 个文件`
			}
			if (key === "share.recordingShareName") {
				return `录音分享_${values?.projectName ?? ""}`
			}
			if (key === "common.untitledProject") {
				return "未命名项目"
			}
			return key
		},
	}),
}))

describe("useShareNameField", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	/** 验证录音分享会优先使用项目模式判断，而不是文件名作为默认分享名称。 */
	it("returns recording share name when projectMode is audio", () => {
		const onChange = vi.fn()

		const { result } = renderHook(() =>
			useShareNameField({
				value: "",
				onChange,
				defaultOpenFileId: "file-1",
				selectedFiles: [{ file_id: "file-1", name: "meeting.wav" }],
				attachments: [{ file_id: "file-1", name: "meeting.wav" }],
				shareProject: false,
				projectName: "季度复盘",
				projectMode: "audio",
			}),
		)

		expect(result.current.defaultValue).toBe("录音分享_季度复盘")
		expect(onChange).toHaveBeenCalledWith("录音分享_季度复盘")
	})

	it("does not restore the default share name after the user clears it", () => {
		const onChange = vi.fn()

		const { rerender } = renderHook(
			({ value }) =>
				useShareNameField({
					value,
					onChange,
					defaultOpenFileId: "file-1",
					selectedFiles: [{ file_id: "file-1", name: "meeting.md" }],
					attachments: [{ file_id: "file-1", name: "meeting.md" }],
					shareProject: false,
					projectName: "季度复盘",
					projectMode: null,
				}),
			{
				initialProps: {
					value: "",
				},
			},
		)

		expect(onChange).toHaveBeenCalledWith("文件分享_meeting.md")

		onChange.mockClear()
		rerender({ value: "文件分享_meeting.md" })
		rerender({ value: "" })

		expect(onChange).not.toHaveBeenCalled()
	})

	/** Verify debounced rename still works when the recording prefix comes from i18n, not a hardcoded locale string. */
	it("updates recording share name when selected files change and value uses i18n prefix", async () => {
		vi.useFakeTimers()
		const onChange = vi.fn()

		const { rerender } = renderHook(
			({ selectedFiles }) =>
				useShareNameField({
					value: "录音分享_季度复盘",
					onChange,
					defaultOpenFileId: "file-1",
					selectedFiles,
					attachments: selectedFiles,
					shareProject: false,
					projectName: "新项目名称",
					projectMode: "audio",
				}),
			{
				initialProps: {
					selectedFiles: [{ file_id: "file-1", name: "meeting.wav" }],
				},
			},
		)

		rerender({
			selectedFiles: [{ file_id: "file-2", name: "review.wav" }],
		})

		await vi.advanceTimersByTimeAsync(250)

		expect(onChange).toHaveBeenCalledWith("录音分享_新项目名称")
		vi.useRealTimers()
	})
})
