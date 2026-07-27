import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import MicroAppEditDialog from "../MicroAppEditDialog"

const uploadMocks = vi.hoisted(() => ({
	uploadAndGetFileUrl: vi.fn(),
	options: undefined as { storageType?: string; useSnowflakeId?: boolean } | undefined,
}))

const apiMocks = vi.hoisted(() => ({
	getMicroAppProject: vi.fn(),
	getFileUrl: vi.fn(),
}))
const translate = (key: string) => key

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: translate }),
}))

vi.mock("@/apis", () => ({
	FileApi: {
		getFileUrl: apiMocks.getFileUrl,
	},
	SuperMagicApi: {
		getMicroAppProject: apiMocks.getMicroAppProject,
	},
}))

vi.mock("@/utils/inputFocusPolicy", () => ({
	shouldSuppressInputAutoFocusInMagicApp: () => false,
}))

vi.mock("@/hooks/useUploadFiles", () => ({
	useUpload: (options: { storageType?: string; useSnowflakeId?: boolean }) => {
		uploadMocks.options = options
		return {
			uploadAndGetFileUrl: uploadMocks.uploadAndGetFileUrl,
			uploading: false,
		}
	},
}))

describe("MicroAppEditDialog", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		uploadMocks.options = undefined
		uploadMocks.uploadAndGetFileUrl.mockResolvedValue({
			fullfilled: [
				{
					value: {
						path: "micro-app/covers/new.webp",
						url: "https://example.com/new-cover.webp",
					},
				},
			],
		})
		apiMocks.getMicroAppProject.mockResolvedValue({
			project: { project_name: "Demo App" },
			publish: { cover_file_key: null },
		})
		apiMocks.getFileUrl.mockResolvedValue({ url: "https://example.com/cover.webp" })
		vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:cover")
		vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined)
	})

	it("submits a trimmed name change", async () => {
		const onConfirm = vi.fn().mockResolvedValue(true)
		const onOpenChange = vi.fn()

		render(
			<MicroAppEditDialog
				open
				appId="app-1"
				projectName="Demo App"
				onOpenChange={onOpenChange}
				onConfirm={onConfirm}
			/>,
		)

		await waitFor(() => expect(apiMocks.getMicroAppProject).toHaveBeenCalledWith("app-1"))
		expect(uploadMocks.options).toEqual({ storageType: "public", useSnowflakeId: true })
		await waitFor(() =>
			expect(screen.getByTestId("micro-app-edit-name-input")).not.toBeDisabled(),
		)
		fireEvent.change(screen.getByTestId("micro-app-edit-name-input"), {
			target: { value: "  New App  " },
		})
		await waitFor(() => expect(screen.getByTestId("micro-app-edit-confirm")).not.toBeDisabled())
		fireEvent.click(screen.getByTestId("micro-app-edit-confirm"))

		await waitFor(() => expect(onConfirm).toHaveBeenCalledWith({ app_name: "New App" }))
		expect(onOpenChange).toHaveBeenCalledWith(false)
	})

	it("resolves an existing cover through FileApi", async () => {
		apiMocks.getMicroAppProject.mockResolvedValue({
			project: { project_name: "Demo App" },
			publish: { cover_file_key: "micro-app/covers/existing.webp" },
		})

		render(
			<MicroAppEditDialog
				open
				appId="app-1"
				projectName="Demo App"
				onOpenChange={vi.fn()}
				onConfirm={vi.fn().mockResolvedValue(true)}
			/>,
		)

		await waitFor(() => {
			expect(apiMocks.getFileUrl).toHaveBeenCalledWith("micro-app/covers/existing.webp")
			expect(screen.getByTestId("micro-app-edit-cover-preview")).toHaveAttribute(
				"src",
				"https://example.com/cover.webp",
			)
		})
	})

	it("captures the home page, uploads it, and submits the cover key", async () => {
		const onConfirm = vi.fn().mockResolvedValue(true)
		const onCaptureCover = vi
			.fn()
			.mockResolvedValue(new Blob(["cover"], { type: "image/webp" }))
		render(
			<MicroAppEditDialog
				open
				appId="app-1"
				projectName="Demo App"
				onOpenChange={vi.fn()}
				onConfirm={onConfirm}
				onCaptureCover={onCaptureCover}
			/>,
		)

		await waitFor(() => expect(apiMocks.getMicroAppProject).toHaveBeenCalled())
		await waitFor(() =>
			expect(screen.getByTestId("micro-app-capture-cover")).not.toBeDisabled(),
		)
		fireEvent.click(screen.getByTestId("micro-app-capture-cover"))

		await waitFor(() => expect(onCaptureCover).toHaveBeenCalledOnce())
		await waitFor(() => expect(uploadMocks.uploadAndGetFileUrl).toHaveBeenCalledOnce())
		await waitFor(() => expect(screen.getByTestId("micro-app-edit-confirm")).not.toBeDisabled())
		fireEvent.click(screen.getByTestId("micro-app-edit-confirm"))

		await waitFor(() =>
			expect(onConfirm).toHaveBeenCalledWith({
				cover_file_key: "micro-app/covers/new.webp",
			}),
		)
	})

	it("uploads a pasted image and submits the cover key", async () => {
		const onConfirm = vi.fn().mockResolvedValue(true)
		render(
			<MicroAppEditDialog
				open
				appId="app-1"
				projectName="Demo App"
				onOpenChange={vi.fn()}
				onConfirm={onConfirm}
			/>,
		)

		await waitFor(() => expect(apiMocks.getMicroAppProject).toHaveBeenCalled())
		await waitFor(() =>
			expect(screen.getByTestId("micro-app-edit-name-input")).not.toBeDisabled(),
		)

		const image = new File(["cover"], "clipboard-cover.png", { type: "image/png" })
		fireEvent.paste(document, {
			clipboardData: {
				files: [image],
				items: [],
			},
		})

		await waitFor(() =>
			expect(uploadMocks.uploadAndGetFileUrl).toHaveBeenCalledWith([
				{ name: "clipboard-cover.png", file: image, status: "init" },
			]),
		)
		await waitFor(() => expect(screen.getByTestId("micro-app-edit-confirm")).not.toBeDisabled())
		fireEvent.click(screen.getByTestId("micro-app-edit-confirm"))

		await waitFor(() =>
			expect(onConfirm).toHaveBeenCalledWith({
				cover_file_key: "micro-app/covers/new.webp",
			}),
		)
	})
})
