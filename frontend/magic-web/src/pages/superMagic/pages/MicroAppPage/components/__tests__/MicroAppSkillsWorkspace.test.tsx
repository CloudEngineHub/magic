import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import MicroAppSkillsWorkspace from "../MicroAppSkillsWorkspace"

const { loadProjectSkillsMock, saveFileContentMock } = vi.hoisted(() => ({
	loadProjectSkillsMock: vi.fn(),
	saveFileContentMock: vi.fn(),
}))

vi.mock("@/pages/superMagic/components/microAppSkills", () => ({
	loadProjectSkills: loadProjectSkillsMock,
}))

vi.mock("@/apis", () => ({
	SuperMagicApi: { saveFileContent: saveFileContentMock },
}))

vi.mock("@/components/base/MagicToaster/utils", () => ({
	default: { success: vi.fn(), error: vi.fn() },
}))

vi.mock("@/pages/superMagic/components/Detail/contents/Md/components/EditorBody", () => ({
	default: ({
		content,
		isEditMode,
		setEditContent,
		...props
	}: {
		content: string
		isEditMode?: boolean
		setEditContent?: (value: string) => void
		[key: string]: unknown
	}) =>
		isEditMode ? (
			<textarea
				value={content}
				onChange={(event) => setEditContent?.(event.target.value)}
				data-testid="micro-app-skill-editor"
				data-view-mode={props.viewMode as string}
			/>
		) : (
			<pre data-testid={props["data-testid"] as string}>{content}</pre>
		),
}))

vi.mock("@/pages/superMagic/components/Detail/contents/Md", () => ({
	default: ({ data, isEditMode }: { data?: { content?: string }; isEditMode?: boolean }) => (
		<pre data-testid="micro-app-skill-markdown" data-edit-mode={String(isEditMode)}>
			{data?.content}
		</pre>
	),
}))

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) =>
			({
				"microAppPage.skills.contentEmpty": "暂无内容",
				"microAppPage.skills.cancel": "取消",
				"microAppPage.skills.detailEmpty": "请选择技能",
				"microAppPage.skills.edit": "编辑",
				"microAppPage.skills.empty": "暂无技能",
				"microAppPage.skills.loadFailed": "加载失败",
				"microAppPage.skills.loading": "加载中",
				"microAppPage.skills.noDescription": "暂无描述",
				"microAppPage.skills.save": "保存",
				"microAppPage.skills.saveFailed": "保存失败",
				"microAppPage.skills.saveSuccess": "已保存",
				"microAppPage.skills.saving": "保存中",
				"microAppPage.skills.title": "项目技能",
				"microAppPage.skills.workspaceSubtitle": "查看技能文件",
			})[key] ?? key,
		i18n: { language: "zh_CN", resolvedLanguage: "zh_CN" },
	}),
}))

describe("MicroAppSkillsWorkspace", () => {
	beforeEach(() => {
		saveFileContentMock.mockResolvedValue(undefined)
		loadProjectSkillsMock.mockResolvedValue([
			{
				id: "skill-1",
				directory: "data",
				name: "数据助手",
				description: "分析项目数据",
				content: "# 数据助手\n\n详细说明",
			},
		])
	})

	it("lists skills and shows the selected SKILL.md content", async () => {
		render(<MicroAppSkillsWorkspace attachmentList={[]} canEdit />)

		expect(await screen.findByText("数据助手")).toBeInTheDocument()
		expect(screen.getByText("分析项目数据")).toBeInTheDocument()
		expect(screen.getByText("请选择技能")).toBeInTheDocument()
		fireEvent.click(screen.getByTestId("micro-app-skill-workspace-item-skill-1"))
		expect(screen.getAllByText("数据助手")).toHaveLength(2)
		expect(screen.getAllByText("分析项目数据")).toHaveLength(2)
		expect(screen.getByTestId("micro-app-skill-content")).toHaveTextContent("# 数据助手")
		expect(screen.getByTestId("micro-app-skill-markdown")).toHaveAttribute(
			"data-edit-mode",
			"false",
		)
		expect(screen.getByText("SKILL.md")).toBeInTheDocument()
		expect(screen.getByTestId("micro-app-skills-workspace")).toBeInTheDocument()
	})

	it("allows editing and saving the complete SKILL.md source", async () => {
		render(<MicroAppSkillsWorkspace attachmentList={[]} canEdit />)
		await screen.findByText("数据助手")
		fireEvent.click(screen.getByTestId("micro-app-skill-workspace-item-skill-1"))
		fireEvent.click(screen.getByRole("button", { name: /编辑/ }))
		const editor = screen.getByTestId("micro-app-skill-editor")
		expect(editor).toHaveAttribute("data-view-mode", "markdown")
		fireEvent.change(editor, { target: { value: "---\nname: data\n---\n# 更新" } })
		fireEvent.click(screen.getByRole("button", { name: /保存/ }))
		await waitFor(() => {
			expect(saveFileContentMock).toHaveBeenCalledWith([
				{ file_id: "skill-1", content: "---\nname: data\n---\n# 更新" },
			])
		})
	})
})
