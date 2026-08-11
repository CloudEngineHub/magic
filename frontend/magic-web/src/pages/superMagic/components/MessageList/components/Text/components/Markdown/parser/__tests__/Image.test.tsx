import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { Image } from "../Image"

const { getTemporaryDownloadUrlMock, projectFilesStoreMock } = vi.hoisted(() => ({
	getTemporaryDownloadUrlMock: vi.fn(),
	projectFilesStoreMock: {
		workspaceFilesList: [] as Array<Record<string, unknown>>,
	},
}))

vi.mock("@/pages/superMagic/utils/api", () => ({
	getTemporaryDownloadUrl: getTemporaryDownloadUrlMock,
}))

vi.mock("@/stores/projectFiles", () => ({
	default: projectFilesStoreMock,
}))

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}))

describe("Markdown image parser", () => {
	beforeEach(() => {
		getTemporaryDownloadUrlMock.mockReset()
		projectFilesStoreMock.workspaceFilesList = []
	})

	it("resolves a relative image path from project attachments", async () => {
		projectFilesStoreMock.workspaceFilesList = [
			{
				file_id: "image-1",
				file_name: "photo.png",
				relative_file_path: "images/photo.png",
				file_extension: "png",
			},
		]
		getTemporaryDownloadUrlMock.mockResolvedValue([
			{ file_id: "image-1", url: "https://cdn.example/photo.png" },
		])

		render(<Image alt="photo" src="./images/photo.png" />)

		await waitFor(() =>
			expect(screen.getByTestId("markdown-image")).toHaveAttribute(
				"src",
				"https://cdn.example/photo.png",
			),
		)
		expect(getTemporaryDownloadUrlMock).toHaveBeenCalledWith({ file_ids: ["image-1"] })
	})

	it("renders a non-image relative resource as a failure placeholder", () => {
		projectFilesStoreMock.workspaceFilesList = [
			{
				file_id: "text-1",
				file_name: "notes.txt",
				relative_file_path: "notes.txt",
				file_extension: "txt",
			},
		]

		render(<Image alt="notes" src="./notes.txt" />)

		expect(screen.getByTestId("markdown-image-failed")).toHaveAttribute(
			"data-image-failure-reason",
			"notImage",
		)
		expect(screen.getByTestId("markdown-image-failed")).toHaveTextContent(
			"common.markdownImage.notImage",
		)
		expect(getTemporaryDownloadUrlMock).not.toHaveBeenCalled()
	})

	it("renders a missing relative resource as a failure placeholder", () => {
		render(<Image alt="missing" src="./missing.png" />)

		expect(screen.getByTestId("markdown-image-failed")).toHaveAttribute(
			"data-image-failure-reason",
			"missing",
		)
		expect(getTemporaryDownloadUrlMock).not.toHaveBeenCalled()
	})

	it("renders an URL failure placeholder when the project image URL cannot be resolved", async () => {
		projectFilesStoreMock.workspaceFilesList = [
			{
				file_id: "image-url-fail",
				file_name: "broken.png",
				relative_file_path: "images/broken.png",
				file_extension: "png",
			},
		]
		getTemporaryDownloadUrlMock.mockResolvedValue([])

		render(<Image alt="broken" src="./images/broken.png" />)

		await waitFor(() =>
			expect(screen.getByTestId("markdown-image-failed")).toHaveAttribute(
				"data-image-failure-reason",
				"url",
			),
		)
	})

	it("renders external image URLs without treating them as project files", () => {
		render(<Image alt="remote" src="https://cdn.example/remote.png" />)

		expect(screen.getByTestId("markdown-image")).toHaveAttribute(
			"src",
			"https://cdn.example/remote.png",
		)
		expect(getTemporaryDownloadUrlMock).not.toHaveBeenCalled()
	})

	it("switches a remote image to the failure placeholder after onError", () => {
		render(<Image alt="remote" src="https://cdn.example/remote.png" />)

		fireEvent.error(screen.getByTestId("markdown-image"))

		expect(screen.getByTestId("markdown-image-failed")).toHaveAttribute(
			"data-image-failure-reason",
			"load",
		)
	})
})
