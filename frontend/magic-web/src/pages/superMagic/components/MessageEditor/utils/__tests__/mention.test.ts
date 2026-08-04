import { describe, expect, it } from "vitest"
import type { JSONContent } from "@tiptap/core"
import {
	MentionItemType,
	type DataService,
	type UploadFileMentionData,
} from "@/components/business/MentionPanel/types"
import type { MentionListItem } from "@/components/business/MentionPanel/tiptap-plugin/types"
import type { FileData } from "../../types"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks/types"
import {
	createUploadFileMentionData,
	isAllowedMention,
	stripProjectResourceMentionDisplayMetadata,
	transformMarkerImagePathsToWorkspaceAbsolute,
	transformUploadFileToProjectFile,
} from "../mention"

const designAttachments: AttachmentItem[] = [
	{
		file_id: "design-dir",
		file_name: "新建画布",
		relative_file_path: "新建画布",
		is_directory: true,
	},
	{
		file_id: "design-project",
		file_name: "magic.project.js",
		relative_file_path: "新建画布/magic.project.js",
		parent_id: "design-dir",
		is_directory: false,
	},
	{
		file_id: "cat-file",
		file_name: "cat.png",
		relative_file_path: "新建画布/images/cat.png",
		parent_id: "design-dir",
		is_directory: false,
	},
]

function markerMentionContent(image: string) {
	return {
		type: "doc",
		content: [
			{
				type: "paragraph",
				content: [
					{
						type: "mention",
						attrs: {
							type: MentionItemType.DESIGN_MARKER,
							data: {
								image,
								design_project_id: "design-project",
								label: "Cat",
								kind: "object",
								marker_id: "marker-1",
								element_id: "element-1",
							},
						},
					},
				],
			},
		],
	}
}

function getFirstMentionData(content: ReturnType<typeof markerMentionContent>) {
	return content.content[0]?.content?.[0]?.attrs?.data as Record<string, unknown>
}

describe("mention utils", () => {
	it("preserves deferred temp destination metadata on upload mentions", () => {
		const file = new File(["image"], "photo.png", { type: "image/png" })
		const mentionData = createUploadFileMentionData({
			id: "local-file-id",
			name: file.name,
			file,
			status: "done",
			defaultRelativePath: ".tmp/photo.png",
			isHidden: true,
		} satisfies FileData)

		expect(mentionData).toMatchObject({
			relative_file_path: ".tmp/photo.png",
			is_hidden: true,
		})
	})

	it("preserves hidden file flag when transforming upload file to project file", () => {
		const uploadFileData: UploadFileMentionData = {
			file_id: "local-file-id",
			file_name: "pasted.txt",
			file_extension: "txt",
		}

		const projectFile = transformUploadFileToProjectFile(uploadFileData, {
			file_id: "project-file-id",
			file_key: "project/workspace/.tmp/pasted.txt",
			file_name: "pasted.txt",
			file_size: 10,
			file_type: "user_upload",
			project_id: "project-id",
			topic_id: "topic-id",
			task_id: "",
			created_at: "",
			relative_file_path: ".tmp/pasted.txt",
			is_hidden: true,
		})

		expect(projectFile).toMatchObject({
			file_id: "project-file-id",
			file_path: ".tmp/pasted.txt",
			project_id: "project-id",
			is_hidden: true,
		})
	})

	it("allows hidden project file mentions without workspace file validation", () => {
		const dataService: DataService = {
			dispatch: () => ({ isValid: false }),
		}

		expect(
			isAllowedMention(
				{
					type: MentionItemType.PROJECT_FILE,
					data: {
						file_id: "hidden-file-id",
						file_name: "pasted.txt",
						file_path: ".tmp/pasted.txt",
						file_extension: "txt",
						is_hidden: true,
					},
				},
				dataService,
			),
		).toBe(true)
	})

	it("allows cross-project file mentions without current-project file validation", () => {
		const dataService: DataService = {
			dispatch: () => ({ isValid: false }),
		}

		expect(
			isAllowedMention(
				{
					type: MentionItemType.PROJECT_FILE,
					data: {
						file_id: "other-project-file-id",
						file_name: "other.txt",
						file_path: "other-project/workspace/other.txt",
						file_extension: "txt",
						project_id: "other-project-id",
						source_project_id: "other-project-id",
					},
				},
				dataService,
			),
		).toBe(true)
	})

	it("allows cross-project directory mentions without current-project directory validation", () => {
		const dataService: DataService = {
			dispatch: () => ({ isValid: false }),
		}

		expect(
			isAllowedMention(
				{
					type: MentionItemType.FOLDER,
					data: {
						directory_id: "other-project-directory-id",
						directory_name: "docs",
						directory_path: "other-project/workspace/docs",
						directory_metadata: {},
						source_project_id: "other-project-id",
					},
				},
				dataService,
			),
		).toBe(true)
	})

	it("keeps project names in rich text but strips them from structured resource payloads", () => {
		const content: JSONContent = {
			type: "doc",
			content: [
				{
					type: "mention",
					attrs: {
						type: MentionItemType.PROJECT_FILE,
						data: {
							file_id: "file-1",
							file_name: "readme.md",
							file_path: "docs/readme.md",
							file_extension: "md",
							project_id: "other-project-id",
							project_name: "Other Project",
						},
					},
				},
				{
					type: "mention",
					attrs: {
						type: MentionItemType.FOLDER,
						data: {
							directory_id: "directory-1",
							directory_name: "docs",
							directory_path: "docs",
							directory_metadata: {},
							project_id: "other-project-id",
							project_name: "Other Project",
						},
					},
				},
				{
					type: "mention",
					attrs: {
						type: MentionItemType.PROJECT,
						data: {
							project_id: "other-project-id",
							project_name: "Other Project",
						},
					},
				},
			],
		}
		const mentionItems = content.content as MentionListItem[]

		const result = stripProjectResourceMentionDisplayMetadata(content, mentionItems)

		expect(result.content).toBe(content)
		expect(result.content.content?.[0].attrs.data).toMatchObject({
			project_id: "other-project-id",
			project_name: "Other Project",
		})
		expect(result.content.content?.[1].attrs.data).toMatchObject({
			project_id: "other-project-id",
			project_name: "Other Project",
		})
		expect(result.content.content?.[2].attrs.data).toMatchObject({
			project_id: "other-project-id",
			project_name: "Other Project",
		})
		expect(result.mentionItems[0].attrs.data).not.toHaveProperty("project_name")
		expect(result.mentionItems[1].attrs.data).not.toHaveProperty("project_name")
		expect(result.mentionItems[2].attrs.data).toHaveProperty("project_name", "Other Project")
	})

	it.each(["./images/cat.png", "images/cat.png"])(
		"converts marker image path %s to workspace-relative path before send",
		(imagePath) => {
			const transformed = transformMarkerImagePathsToWorkspaceAbsolute(
				markerMentionContent(imagePath),
				designAttachments,
			) as ReturnType<typeof markerMentionContent>

			const markerData = getFirstMentionData(transformed)
			expect(markerData.image).toBe("新建画布/images/cat.png")
			expect(markerData.image_relative).toBe(imagePath)
		},
	)
})
