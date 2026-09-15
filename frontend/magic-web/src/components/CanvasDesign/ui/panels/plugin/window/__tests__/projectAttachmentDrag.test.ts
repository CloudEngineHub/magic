import { afterEach, describe, expect, it } from "vitest"

import {
	clearProjectAttachmentDragHoverPlainText,
	setProjectAttachmentDragHoverPlainText,
} from "../../../../editors/message/reference-assets/projectAttachmentDragHoverBridge"
import {
	getProjectAttachmentImageFilesFromDragData,
	getProjectAttachmentImageFilesFromDataTransfer,
	parseProjectAttachmentDragData,
	PROJECT_ATTACHMENT_DRAG_MIME,
	hasProjectAttachmentDragPayload,
} from "../projectAttachmentDrag"

describe("project attachment drag helpers", () => {
	afterEach(() => {
		clearProjectAttachmentDragHoverPlainText()
	})

	it("keeps image project files and drops non-images", () => {
		const data = parseProjectAttachmentDragData(
			JSON.stringify({
				type: "multiple_files",
				data: [
					{
						file_name: "cover.png",
						relative_file_path: "/images/cover.png",
					},
					{
						file_name: "notes.md",
						relative_file_path: "/docs/notes.md",
					},
					{
						file_name: "photo",
						file_extension: ".webp",
						path: "/images/photo.webp",
					},
				],
			}),
		)

		expect(getProjectAttachmentImageFilesFromDragData(data)).toEqual([
			{ path: "/images/cover.png", fileName: "cover.png" },
			{ path: "/images/photo.webp", fileName: "photo" },
		])
	})

	it("drops folders without recursively collecting children", () => {
		const data = parseProjectAttachmentDragData(
			JSON.stringify({
				type: "project_directory",
				data: {
					file_name: "images",
					is_directory: true,
					relative_file_path: "/images",
					children: [
						{
							file_name: "cover.png",
							relative_file_path: "/images/cover.png",
						},
					],
				},
			}),
		)

		expect(getProjectAttachmentImageFilesFromDragData(data)).toEqual([])
	})

	it("rejects unrelated drag payloads", () => {
		expect(parseProjectAttachmentDragData(JSON.stringify({ type: "tab", data: {} }))).toBeNull()
		expect(parseProjectAttachmentDragData("not-json")).toBeNull()
	})

	it("detects project attachment mime from data transfer types", () => {
		expect(hasProjectAttachmentDragPayload({ types: [PROJECT_ATTACHMENT_DRAG_MIME] })).toBe(
			true,
		)
		expect(hasProjectAttachmentDragPayload({ types: ["text/plain"] })).toBe(false)
	})

	it("reads image files from project attachment mime on drop", () => {
		expect(
			getProjectAttachmentImageFilesFromDataTransfer({
				getData: (type: string) =>
					type === PROJECT_ATTACHMENT_DRAG_MIME
						? JSON.stringify({
								type: "project_file",
								data: {
									file_name: "cover.png",
									relative_file_path: "/images/cover.png",
								},
							})
						: "",
			}),
		).toEqual([{ path: "/images/cover.png", fileName: "cover.png" }])
	})

	it("uses the trusted hover bridge instead of plain text payloads on drop", () => {
		setProjectAttachmentDragHoverPlainText(
			JSON.stringify({
				type: "project_file",
				data: {
					file_name: "bridge.png",
					relative_file_path: "/images/bridge.png",
				},
			}),
		)

		expect(hasProjectAttachmentDragPayload({ types: ["text/plain"] })).toBe(true)
		expect(
			getProjectAttachmentImageFilesFromDataTransfer({
				getData: (type: string) =>
					type === PROJECT_ATTACHMENT_DRAG_MIME
						? ""
						: JSON.stringify({
								type: "project_file",
								data: {
									file_name: "forged.png",
									relative_file_path: "/images/forged.png",
								},
							}),
			}),
		).toEqual([{ path: "/images/bridge.png", fileName: "bridge.png" }])
	})
})
