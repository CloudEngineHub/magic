import { describe, expect, it } from "vitest"

import { MentionItemType } from "../../types"
import type { ProjectResourceSelection } from "@/pages/superMagic/components/SelectPathModal/types"
import type { ProjectListItem, Workspace } from "@/pages/superMagic/pages/Workspace/types"
import { getMentionDisplayName } from "../../tiptap-plugin/types"
import { createOtherProjectMentionItem } from "../otherProjectMention"

const workspace = { id: "workspace-1", name: "Workspace" } as Workspace
const project = {
	id: "project-2",
	project_name: "Other Project",
	work_dir: "org/user/project_2/workspace",
} as ProjectListItem

describe("otherProjectMention", () => {
	it("creates a project-level mention", () => {
		const selection: ProjectResourceSelection = {
			level: "project",
			workspace,
			project,
		}

		const item = createOtherProjectMentionItem(selection)

		expect(item.type).toBe(MentionItemType.PROJECT)
		expect(item.data).toMatchObject({
			project_id: project.id,
			project_name: project.project_name,
		})
		expect(item.data).not.toHaveProperty("source_project_id")
	})

	it("creates a relative cross-project file mention without the project work directory", () => {
		const selection: ProjectResourceSelection = {
			level: "attachment",
			workspace,
			project,
			attachment: {
				file_id: "file-1",
				file_name: "readme.md",
				file_extension: "md",
				relative_file_path: "/docs/readme.md",
				is_directory: false,
			},
		}

		const item = createOtherProjectMentionItem(selection)

		expect(item.type).toBe(MentionItemType.PROJECT_FILE)
		expect(item.data).toMatchObject({
			file_id: "file-1",
			file_name: "readme.md",
			file_path: "docs/readme.md",
			project_id: project.id,
			project_name: project.project_name,
		})
		expect(item.data).not.toHaveProperty("source_project_id")
		expect(getMentionDisplayName({ type: item.type, data: item.data })).toBe(
			`${project.project_name}/readme.md`,
		)
	})

	it("uses the unnamed project prefix for a file from a project with an empty name", () => {
		const selection: ProjectResourceSelection = {
			level: "attachment",
			workspace,
			project: { ...project, project_name: "" },
			attachment: {
				file_id: "file-1",
				file_name: "readme.md",
				file_extension: "md",
				is_directory: false,
			},
		}

		const item = createOtherProjectMentionItem(selection)

		expect(getMentionDisplayName({ type: item.type, data: item.data }, "zh_CN")).toBe(
			"未命名项目/readme.md",
		)
	})

	it("creates a relative cross-project directory mention without the project work directory", () => {
		const selection: ProjectResourceSelection = {
			level: "attachment",
			workspace,
			project,
			attachment: {
				file_id: "directory-1",
				file_name: "docs",
				relative_file_path: "/docs",
				is_directory: true,
			},
		}

		const item = createOtherProjectMentionItem(selection)

		expect(item.type).toBe(MentionItemType.FOLDER)
		expect(item.data).toMatchObject({
			directory_id: "directory-1",
			directory_name: "docs",
			directory_path: "docs",
			project_id: project.id,
			project_name: project.project_name,
		})
		expect(item.data).not.toHaveProperty("source_project_id")
		expect(getMentionDisplayName({ type: item.type, data: item.data })).toBe(
			`${project.project_name}/docs`,
		)
	})

	it("uses the unnamed project prefix for a directory from a project with a blank name", () => {
		const selection: ProjectResourceSelection = {
			level: "attachment",
			workspace,
			project: { ...project, project_name: "   " },
			attachment: {
				file_id: "directory-1",
				file_name: "docs",
				is_directory: true,
			},
		}

		const item = createOtherProjectMentionItem(selection)

		expect(getMentionDisplayName({ type: item.type, data: item.data }, "zh_CN")).toBe(
			"未命名项目/docs",
		)
	})
})
