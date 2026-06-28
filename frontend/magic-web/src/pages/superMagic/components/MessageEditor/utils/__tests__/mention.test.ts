import { describe, expect, it } from "vitest"
import { MentionItemType } from "@/components/business/MentionPanel/types"
import type { DataService } from "@/components/business/MentionPanel/types"
import type { UploadFileMentionData } from "@/components/business/MentionPanel/types"
import { isAllowedMention, transformUploadFileToProjectFile } from "../mention"

describe("mention utils", () => {
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
})
