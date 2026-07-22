import { describe, expect, it } from "vitest"
import { MentionItemType } from "@/components/business/MentionPanel/types"
import type { DataService, UploadFileMentionData } from "@/components/business/MentionPanel/types"
import type { FileData } from "../../types"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks/types"
import {
	createUploadFileMentionData,
	isAllowedMention,
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
