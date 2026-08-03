import React from "react"
import { render, screen } from "@testing-library/react"
import { vi } from "vitest"
import type { MessageEditorRef } from "@/components/business/AccountSetting/pages/ScheduledTasks/components/MessageEditor"
import { ScheduledTask } from "@/types/scheduledTask"
import { MicroAppScheduledTasksModify } from "../MicroAppScheduledTasksModify"
import { applyMicroAppScheduledTaskContext } from "../utils"

vi.mock("antd", async (importOriginal) => {
	const actual = await importOriginal<typeof import("antd")>()
	return { Form: actual.Form }
})

vi.mock("react-i18next", async (importOriginal) => {
	const actual = await importOriginal<typeof import("react-i18next")>()
	return {
		...actual,
		useTranslation: () => ({ t: (key: string) => key }),
	}
})

vi.mock("@/hooks/useIsMobile", () => ({
	useIsMobile: () => false,
}))

vi.mock("@/components/base", () => ({
	MagicDatePicker: () => <div data-testid="date-picker" />,
}))

vi.mock("@/components/base/MagicSwitch", () => ({
	MagicSwitch: ({
		checked,
		onChange,
	}: {
		checked?: boolean
		onChange?: (value: boolean) => void
	}) => (
		<input
			type="checkbox"
			checked={checked}
			onChange={(event) => onChange?.(event.target.checked)}
		/>
	),
}))

vi.mock("@/components/base/MagicToaster/utils", () => ({
	default: { error: vi.fn() },
}))

vi.mock(
	"@/pages/superMagic/components/MessageList/components/Text/components/RichText/utils",
	() => ({ parseContent: () => null }),
)

vi.mock("@/components/business/AccountSetting/pages/ScheduledTasks/store/MCPTempStorage", () => ({
	default: { mcpList: [] },
}))

vi.mock("@/components/business/AccountSetting/pages/ScheduledTasks/hooks/useAttachments", () => ({
	useAttachments: () => ({ attachments: [], updateAttachments: vi.fn() }),
}))

vi.mock(
	"@/components/business/AccountSetting/pages/ScheduledTasks/components/MessageEditor",
	() => ({
		default: React.forwardRef<MessageEditorRef>(function MockMessageEditor(_props, ref) {
			React.useImperativeHandle(ref, () => ({
				editor: {
					getText: () => "test prompt",
					getJSON: () => ({ type: "doc", content: [] }),
				},
				mentionItems: [],
				selectedModel: null,
				setContent: vi.fn(),
				setSelectedModel: vi.fn(),
			}))
			return <div data-testid="micro-app-message-editor" />
		}),
	}),
)

vi.mock(
	"@/components/business/AccountSetting/pages/ScheduledTasks/components/ScheduledItem",
	() => ({
		ScheduledItem: () => <div data-testid="scheduled-item" />,
	}),
)

vi.mock(
	"@/components/business/AccountSetting/pages/ScheduledTasks/components/ProjectTopicItem",
	() => ({
		default: () => <div data-testid="project-topic-item" />,
	}),
)

describe("MicroAppScheduledTasksModify", () => {
	it("renders the current workspace and project instead of stale task context", () => {
		const context = {
			workspaceId: "hidden-workspace",
			projectId: "micro-app-project",
			workspaceName: "微应用工作区",
			projectName: "当前微应用",
		}
		const staleTask: Partial<ScheduledTask.UpdateTask> = {
			task_name: "每日汇报",
			workspace_id: "old-workspace",
			project_id: "old-project",
			topic_id: "",
			time_config: {
				type: ScheduledTask.ScheduleType.Once,
				day: "2026-08-03",
				time: "10:00",
			},
			enabled: 1,
			message_type: "rich_text",
			message_content: { content: "{}" },
		}

		render(
			<MicroAppScheduledTasksModify
				mode="edit"
				context={context}
				initialValues={staleTask}
			/>,
		)

		expect(screen.getByText("当前微应用")).toBeInTheDocument()
		expect(screen.queryByText("微应用工作区")).not.toBeInTheDocument()
		expect(screen.queryByText("old-workspace")).not.toBeInTheDocument()
		expect(screen.queryByText("old-project")).not.toBeInTheDocument()
	})

	it("forces the submitted task to use the current micro app context", () => {
		const task = {
			task_name: "每日汇报",
			workspace_id: "old-workspace",
			project_id: "old-project",
			topic_id: "topic-1",
			time_config: { type: ScheduledTask.ScheduleType.Daily, time: "10:00" },
			enabled: 1,
			message_type: "rich_text",
			message_content: { content: "{}" },
		}

		expect(
			applyMicroAppScheduledTaskContext(task, {
				workspaceId: "hidden-workspace",
				projectId: "micro-app-project",
			}),
		).toMatchObject({
			workspace_id: "hidden-workspace",
			project_id: "micro-app-project",
			topic_id: "topic-1",
		})
	})
})
