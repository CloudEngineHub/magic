import { beforeEach, describe, expect, it, vi } from "vitest"
import {
	DRAG_TYPE,
	handleAttachmentDragStart,
	handleMultipleFilesDragStart,
	insertMentionFromDroppedData,
	PROJECT_ATTACHMENT_DRAG_MIME,
	PROJECT_IMAGE_ATTACHMENT_DRAG_MIME,
} from "../drag"
import { MentionItemType } from "@/components/business/MentionPanel/types"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks"
import type { WorkspaceFolder } from "@/stores/projectFiles/types"

const projectFilesStoreMock = vi.hoisted(() => ({
	getFolderData: vi.fn(),
	workspaceFilesList: [] as WorkspaceFolder[],
}))

const dragLoggerMock = vi.hoisted(() => ({
	startSession: vi.fn(),
	logDragStart: vi.fn(),
	logDragEnd: vi.fn(),
	logEditorCheck: vi.fn(),
	logMentionInsert: vi.fn(),
	logError: vi.fn(),
}))

vi.mock(
	"@/components/CanvasDesign/ui/editors/message/reference-assets/projectAttachmentDragHoverBridge",
	() => ({
		clearProjectAttachmentDragHoverPlainText: vi.fn(),
		setProjectAttachmentDragHoverPlainText: vi.fn(),
	}),
)

vi.mock("@/stores/projectFiles", () => ({ default: projectFilesStoreMock }))

vi.mock("../dragLogger", () => ({
	dragLogger: dragLoggerMock,
}))

function createDragEvent() {
	const data = new Map<string, string>()
	return {
		dataTransfer: {
			types: [] as string[],
			setData(type: string, value: string) {
				data.set(type, value)
				if (!this.types.includes(type)) this.types.push(type)
			},
			getData(type: string) {
				return data.get(type) ?? ""
			},
			clearData() {
				data.clear()
				this.types = []
			},
		},
	} as unknown as React.DragEvent
}

function createEditor() {
	return {
		isDestroyed: false,
		commands: {
			insertContent: vi.fn(),
			focus: vi.fn(),
		},
	}
}

describe("MessageEditor drag utils", () => {
	beforeEach(() => {
		projectFilesStoreMock.getFolderData.mockReset()
		projectFilesStoreMock.workspaceFilesList = []
		Object.values(dragLoggerMock).forEach((mock) => mock.mockClear())
	})

	it("marks single project image drags with image MIME", () => {
		const event = createDragEvent()

		handleAttachmentDragStart(event, {
			file_id: "img-1",
			file_name: "cover.png",
			relative_file_path: "docs/images/cover.png",
			is_directory: false,
		} as AttachmentItem)

		expect(event.dataTransfer.types).toContain(PROJECT_ATTACHMENT_DRAG_MIME)
		expect(event.dataTransfer.types).toContain(PROJECT_IMAGE_ATTACHMENT_DRAG_MIME)
	})

	it("does not mark single non-image project file drags with image MIME", () => {
		const event = createDragEvent()

		handleAttachmentDragStart(event, {
			file_id: "doc-1",
			file_name: "brief.pdf",
			relative_file_path: "docs/brief.pdf",
			is_directory: false,
		} as AttachmentItem)

		expect(event.dataTransfer.types).toContain(PROJECT_ATTACHMENT_DRAG_MIME)
		expect(event.dataTransfer.types).not.toContain(PROJECT_IMAGE_ATTACHMENT_DRAG_MIME)
	})

	it("marks multiple project file drags with image MIME when any file is image", () => {
		const event = createDragEvent()

		handleMultipleFilesDragStart(event, [
			{
				file_id: "doc-1",
				file_name: "brief.pdf",
				relative_file_path: "docs/brief.pdf",
				is_directory: false,
			},
			{
				file_id: "img-1",
				file_name: "cover.webp",
				relative_file_path: "docs/images/cover.webp",
				is_directory: false,
			},
		] as AttachmentItem[])

		expect(event.dataTransfer.types).toContain(PROJECT_IMAGE_ATTACHMENT_DRAG_MIME)
	})

	it("inserts project-file app entry drags as folder mentions", () => {
		const editor = createEditor()
		const appFolder = {
			type: "directory",
			file_id: "app-dir",
			file_name: "App",
			relative_file_path: "/App",
			display_config: {
				type: "micro-app",
				entry: "main.html",
			},
			children: [],
		} as unknown as WorkspaceFolder
		projectFilesStoreMock.getFolderData.mockImplementation((parentId) =>
			parentId === "app-dir" ? appFolder : undefined,
		)
		projectFilesStoreMock.workspaceFilesList = [appFolder]

		insertMentionFromDroppedData({
			editor,
			data: {
				type: DRAG_TYPE.ProjectFile,
				data: {
					file_id: "main-file",
					file_name: "main.html",
					relative_file_path: "/App/main.html",
					parent_id: "app-dir",
					display_config: {
						type: "micro-app",
						entry: "main.html",
					},
				} as AttachmentItem,
			},
		})

		expect(editor.commands.insertContent).toHaveBeenCalledWith({
			type: "mention",
			attrs: {
				type: MentionItemType.FOLDER,
				data: expect.objectContaining({
					directory_id: "app-dir",
					directory_name: "App",
					directory_path: "App",
				}),
			},
		})
	})

	it("maps app entry files inside multiple drags to folder mentions", () => {
		const editor = createEditor()
		const appFolder = {
			type: "directory",
			file_id: "app-dir",
			file_name: "App",
			relative_file_path: "/App",
			display_config: {
				type: "dashboard",
			},
			children: [],
		} as unknown as WorkspaceFolder
		projectFilesStoreMock.getFolderData.mockImplementation((parentId) =>
			parentId === "app-dir" ? appFolder : undefined,
		)
		projectFilesStoreMock.workspaceFilesList = [appFolder]

		insertMentionFromDroppedData({
			editor,
			data: {
				type: DRAG_TYPE.MultipleFiles,
				data: [
					{
						file_id: "entry-file",
						file_name: "index.html",
						relative_file_path: "/App/index.html",
						parent_id: "app-dir",
						display_config: { type: "dashboard" },
					},
					{
						file_id: "normal-file",
						file_name: "notes.txt",
						relative_file_path: "/notes.txt",
						file_extension: "txt",
					},
				] as AttachmentItem[],
			},
		})

		expect(editor.commands.insertContent).toHaveBeenCalledWith([
			expect.objectContaining({
				attrs: expect.objectContaining({
					type: MentionItemType.FOLDER,
					data: expect.objectContaining({ directory_id: "app-dir" }),
				}),
			}),
			expect.objectContaining({
				attrs: expect.objectContaining({
					type: MentionItemType.PROJECT_FILE,
					data: expect.objectContaining({
						file_id: "normal-file",
						file_path: "notes.txt",
					}),
				}),
			}),
		])
	})
})
