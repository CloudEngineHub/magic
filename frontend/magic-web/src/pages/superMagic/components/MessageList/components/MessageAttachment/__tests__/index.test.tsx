import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { Attachment } from "../index"

const getTemporaryDownloadUrlMock = vi.fn()
const downloadFileWithAnchorMock = vi.fn()
const resolveSingleDocumentStaticDependenciesMock = vi.fn()
const supportsStaticDependenciesMock = vi.fn()
const startDownloadMock = vi.fn()
const warningMock = vi.fn()
const openMessageFileMock = vi.fn()
const useIsMobileMock = vi.hoisted(() => vi.fn(() => false))

const projectFilesStoreMock = {
	workspaceFilesList: [] as Array<Record<string, unknown>>,
	workspaceFileTree: [] as Array<Record<string, unknown>>,
	currentSelectedProject: { id: "project-1" },
}

vi.mock("@/pages/superMagic/utils/api", () => ({
	getTemporaryDownloadUrl: (...args: unknown[]) => getTemporaryDownloadUrlMock(...args),
}))

vi.mock("@/pages/superMagic/utils/handleFIle", () => ({
	downloadFileWithAnchor: (...args: unknown[]) => downloadFileWithAnchorMock(...args),
	getFileType: vi.fn(),
}))

vi.mock("@/pages/superMagic/utils/staticDependencies", () => ({
	mergeStaticDependencyFileIds: (
		fileIds: string[],
		dependencyFileIds: string[],
		includeDependencies: boolean,
	) => (includeDependencies ? [...new Set([...fileIds, ...dependencyFileIds])] : fileIds),
	resolveSingleDocumentStaticDependencies: (...args: unknown[]) =>
		resolveSingleDocumentStaticDependenciesMock(...args),
	supportsStaticDependencies: (...args: unknown[]) => supportsStaticDependenciesMock(...args),
}))

vi.mock("@/pages/superMagic/hooks/useDownloadProgress", () => ({
	useDownloadProgress: () => ({ startDownload: startDownloadMock }),
}))

vi.mock("@/pages/superMagic/components/MessageList/context", () => ({
	useMessageListContext: () => ({ projectFilesStore: projectFilesStoreMock }),
}))

vi.mock("@/components/base/MagicToaster/utils", () => ({
	default: {
		success: vi.fn(),
		error: vi.fn(),
		info: vi.fn(),
		warning: (...args: unknown[]) => warningMock(...args),
	},
}))

vi.mock("@/components/base/MagicFileIcon", () => ({
	default: () => <div />,
}))

vi.mock("@/components/base/MagicIcon", () => ({
	default: ({ onClick }: { onClick: () => void }) => <button onClick={onClick} type="button" />,
}))

vi.mock("@/hooks/useIsMobile", () => ({
	useIsMobile: () => useIsMobileMock(),
}))

vi.mock("@/pages/superMagic/components/MessageList/utils/openMessageFile", () => ({
	openMessageFile: (...args: unknown[]) => openMessageFileMock(...args),
}))

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
	initReactI18next: { type: "3rdParty", init: vi.fn() },
}))

describe("MessageAttachment", () => {
	beforeEach(() => {
		getTemporaryDownloadUrlMock.mockReset()
		downloadFileWithAnchorMock.mockReset()
		resolveSingleDocumentStaticDependenciesMock.mockReset()
		supportsStaticDependenciesMock.mockReset()
		startDownloadMock.mockReset()
		warningMock.mockReset()
		openMessageFileMock.mockReset()
		useIsMobileMock.mockReturnValue(false)
		projectFilesStoreMock.workspaceFilesList = []
		projectFilesStoreMock.workspaceFileTree = []
		supportsStaticDependenciesMock.mockReturnValue(false)
	})

	it("opens the resolved project directory for magic.project.js attachments", () => {
		const projectDirectory = {
			file_id: "project-directory",
			file_name: "generated-project",
			file_extension: "",
			is_directory: true,
			display_config: { type: "slide", name: "项目演示" },
		}
		const magicProjectFile = {
			file_id: "magic-project-file",
			file_name: "magic.project.js",
			file_extension: "js",
			parent_id: "project-directory",
		}
		projectFilesStoreMock.workspaceFilesList = [magicProjectFile, projectDirectory]
		projectFilesStoreMock.workspaceFileTree = [
			{
				...projectDirectory,
				children: [magicProjectFile],
			},
		]

		render(
			<Attachment
				attachments={[
					{
						...magicProjectFile,
						filename: "magic.project.js",
						contentLength: 0,
						url: "",
					},
				]}
				onSelectDetail={vi.fn()}
			/>,
		)

		expect(screen.getByText("项目演示")).toBeInTheDocument()
		fireEvent.click(screen.getByTestId("handle-open-file"))
		expect(openMessageFileMock).toHaveBeenCalledWith(projectDirectory)
	})

	it("falls back to opening the original magic.project.js when its parent is unavailable", () => {
		const magicProjectFile = {
			file_id: "magic-project-file",
			file_name: "magic.project.js",
			file_extension: "js",
			parent_id: "missing-project-directory",
			filename: "magic.project.js",
			contentLength: 0,
			url: "",
		}
		projectFilesStoreMock.workspaceFilesList = [magicProjectFile]

		render(<Attachment attachments={[magicProjectFile]} onSelectDetail={vi.fn()} />)

		fireEvent.click(screen.getByTestId("handle-open-file"))
		expect(openMessageFileMock).toHaveBeenCalledWith(magicProjectFile)
	})

	it("uses the resolved project directory when mobile preview falls back to onSelectDetail", () => {
		const projectDirectory = {
			file_id: "project-directory",
			file_name: "generated-project",
			file_extension: "",
			is_directory: true,
			display_config: { type: "slide", name: "项目演示" },
		}
		const magicProjectFile = {
			file_id: "magic-project-file",
			file_name: "magic.project.js",
			file_extension: "js",
			parent_id: "project-directory",
			filename: "magic.project.js",
			contentLength: 0,
			url: "",
		}
		const onSelectDetail = vi.fn()
		projectFilesStoreMock.workspaceFilesList = [magicProjectFile, projectDirectory]
		useIsMobileMock.mockReturnValue(true)

		render(<Attachment attachments={[magicProjectFile]} onSelectDetail={onSelectDetail} />)

		fireEvent.click(screen.getByTestId("handle-open-file"))
		expect(onSelectDetail).toHaveBeenCalledWith(
			expect.objectContaining({
				currentFileId: "project-directory",
				data: expect.objectContaining({
					file_id: "project-directory",
					display_config: { type: "slide", name: "项目演示" },
				}),
			}),
		)
	})

	it("requests download mode when the download button is clicked", async () => {
		getTemporaryDownloadUrlMock.mockResolvedValue([{ url: "https://example.invalid/file.pdf" }])

		render(
			<Attachment
				attachments={[
					{
						file_id: "file-1",
						file_extension: "pdf",
						file_name: "file.pdf",
						filename: "file.pdf",
						contentLength: 0,
						url: "",
					},
				]}
				onSelectDetail={vi.fn()}
			/>,
		)

		fireEvent.click(screen.getAllByRole("button")[1])

		expect(getTemporaryDownloadUrlMock).toHaveBeenCalledWith({
			file_ids: ["file-1"],
			is_download: true,
			download_mode: "download",
		})
		await waitFor(() => {
			expect(downloadFileWithAnchorMock).toHaveBeenCalledWith(
				"https://example.invalid/file.pdf",
			)
		})
	})

	it("downloads linked resources for supported message attachments", async () => {
		projectFilesStoreMock.workspaceFilesList = [
			{
				file_id: "page-html",
				file_name: "page.html",
				file_extension: "html",
				relative_file_path: "site/page.html",
			},
			{
				file_id: "cover-image",
				file_name: "cover.png",
				relative_file_path: "site/cover.png",
			},
		]
		supportsStaticDependenciesMock.mockReturnValue(true)
		resolveSingleDocumentStaticDependenciesMock.mockResolvedValue({
			fileType: "html",
			dependencyFileIds: ["cover-image"],
			dependencyTransferFileIds: ["cover-image"],
			missingResourcePaths: [],
		})
		startDownloadMock.mockResolvedValue(true)

		render(
			<Attachment
				attachments={[
					{
						file_id: "page-html",
						file_extension: "html",
						file_name: "page.html",
						filename: "page.html",
						contentLength: 0,
						url: "",
					},
				]}
				onSelectDetail={vi.fn()}
			/>,
		)

		fireEvent.click(screen.getAllByRole("button")[1])

		await waitFor(() => {
			expect(startDownloadMock).toHaveBeenCalledWith(
				expect.objectContaining({
					projectId: "project-1",
					fileIds: ["page-html", "cover-image"],
					fileName: "page-with-assets.zip",
				}),
			)
		})
		expect(getTemporaryDownloadUrlMock).not.toHaveBeenCalled()
	})

	it("falls back to the original file when dependency resolution fails", async () => {
		getTemporaryDownloadUrlMock.mockResolvedValue([
			{ url: "https://example.invalid/page.html" },
		])
		supportsStaticDependenciesMock.mockReturnValue(true)
		resolveSingleDocumentStaticDependenciesMock.mockRejectedValue(
			new Error("dependency resolution failed"),
		)

		render(
			<Attachment
				attachments={[
					{
						file_id: "page-html",
						file_extension: "html",
						file_name: "page.html",
						filename: "page.html",
						contentLength: 0,
						url: "",
					},
				]}
				onSelectDetail={vi.fn()}
			/>,
		)

		fireEvent.click(screen.getAllByRole("button")[1])

		await waitFor(() => {
			expect(downloadFileWithAnchorMock).toHaveBeenCalledWith(
				"https://example.invalid/page.html",
			)
		})
		expect(warningMock).toHaveBeenCalledWith("share.documentDependenciesAnalysisFailed")
	})
})
