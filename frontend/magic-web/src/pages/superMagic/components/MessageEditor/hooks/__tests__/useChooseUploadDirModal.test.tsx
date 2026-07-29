import { act, renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock("../../components/UploadModal", () => ({
	UploadModal: () => null,
}))

import useChooseUploadDirModal, { isImageUploadFile } from "../useChooseUploadDirModal"

const validationResult = (files: File[]) => ({ validFiles: files, hasWarning: false })
const countValidationResult = (files: File[]) => ({ validFiles: files, hasError: false })

describe("useChooseUploadDirModal", () => {
	it("recognizes image MIME types and image extensions", () => {
		expect(isImageUploadFile(new File(["image"], "clipboard", { type: "image/png" }))).toBe(
			true,
		)
		expect(isImageUploadFile(new File(["image"], "PHOTO.JPG"))).toBe(true)
		expect(isImageUploadFile(new File(["text"], "notes.txt", { type: "text/plain" }))).toBe(
			false,
		)
	})

	it("uploads project images to the hidden temp directory without opening the picker", async () => {
		const addFiles = vi.fn().mockResolvedValue([])
		const { result } = renderHook(() =>
			useChooseUploadDirModal({
				addFiles,
				selectedProject: { id: "project-1" } as any,
				attachments: [],
				validateFileSize: validationResult,
				validateFileCount: countValidationResult,
			}),
		)
		const image = new File(["image"], "photo.png", { type: "image/png" })

		await act(async () => {
			await result.current.addFilesWithDir([image])
		})

		expect(addFiles).toHaveBeenCalledWith([image], undefined, { useTempDirectory: true })
		expect(result.current.selectDirectoryModalVisible).toBe(false)
		expect(result.current.uploadFiles).toEqual([])
	})

	it("marks workspace-home images for the temp directory without opening the picker", async () => {
		const addFiles = vi.fn().mockResolvedValue([])
		const { result } = renderHook(() =>
			useChooseUploadDirModal({
				addFiles,
				selectedProject: null,
				attachments: [],
				validateFileSize: validationResult,
				validateFileCount: countValidationResult,
			}),
		)
		const image = new File(["image"], "pasted-image.png", { type: "image/png" })

		await act(async () => {
			await result.current.addFilesWithDir([image])
		})

		expect(addFiles).toHaveBeenCalledWith([image], undefined, { useTempDirectory: true })
		expect(result.current.selectDirectoryModalVisible).toBe(false)
	})
})
