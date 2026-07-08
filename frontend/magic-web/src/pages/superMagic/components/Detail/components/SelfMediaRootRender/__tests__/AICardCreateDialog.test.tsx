import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import AICardCreateDialog from "../components/AICardCreateDialog"
import { createAICardViaTopic } from "../services/aiCardCreate"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) =>
			({
				"detail.aiCard.createDialog.title": "Create AI Card",
				"detail.aiCard.createDialog.description": "Create an AI dashboard.",
				"detail.aiCard.createDialog.cancel": "Cancel",
				"detail.aiCard.createDialog.confirm": "Create",
				"detail.aiCard.config.enableSchedule": "Enable scheduled execution",
				"detail.aiCard.config.enableScheduleHint": "Update this card automatically",
			})[key] ?? key,
	}),
}))

vi.mock("@/services/superMagic/SuperMagicModeService", () => ({
	default: {
		getModelListByMode: vi.fn(() => []),
		getImageModelListByMode: vi.fn(() => []),
		getVideoModelListByMode: vi.fn(() => []),
	},
}))

vi.mock("@/services/superMagic/topicModel", () => ({
	superMagicTopicModelCacheService: {
		getProjectModel: vi.fn(() => Promise.resolve(null)),
	},
}))

vi.mock("../services/aiCardCreate", () => ({
	createAICardViaTopic: vi.fn(),
}))

vi.mock("@/components/base/MagicSwitch", () => ({
	MagicSwitch: ({ checked }: { checked: boolean }) => (
		<div data-checked={String(checked)} data-testid="mock-ai-card-enabled-switch" />
	),
}))

vi.mock("../../AICardRootRender/components/AICardFormFields", () => ({
	default: ({
		values,
		onChange,
		hideEnabledToggle,
	}: {
		values: { taskName: string; prompt: string }
		onChange: (updates: Record<string, unknown>) => void
		hideEnabledToggle?: boolean
	}) => (
		<div data-testid="mock-ai-card-form-fields">
			<div data-testid="mock-ai-card-task-name">{values.taskName}</div>
			<div data-testid="mock-ai-card-prompt">{values.prompt}</div>
			<div data-testid="mock-ai-card-hide-enabled">{String(hideEnabledToggle)}</div>
			<button
				type="button"
				onClick={() =>
					onChange({
						notification: {
							channels: [
								{
									channel: "dingtalk",
									targetDescription: "发到「运营日报群」",
								},
							],
						},
					})
				}
			>
				Set notification
			</button>
		</div>
	),
}))

describe("AICardCreateDialog", () => {
	beforeEach(() => {
		vi.mocked(createAICardViaTopic).mockReset()
	})

	it("renders prefilled values in a constrained scrollable dialog with the schedule toggle in footer", async () => {
		render(
			<AICardCreateDialog
				open
				onOpenChange={vi.fn()}
				projectId="project-1"
				initialValues={{
					taskName: "发布后表现复盘",
					prompt: "首开就应该看到的复盘指令",
					template: "analytics-panel",
					enabled: false,
				}}
			/>,
		)

		await waitFor(() => {
			expect(screen.getByTestId("mock-ai-card-task-name")).toHaveTextContent("发布后表现复盘")
			expect(screen.getByTestId("mock-ai-card-prompt")).toHaveTextContent(
				"首开就应该看到的复盘指令",
			)
		})
		expect(screen.getByTestId("ai-card-create-dialog-content")).toHaveClass(
			"max-h-[88vh]",
			"overflow-hidden",
		)
		expect(screen.getByTestId("ai-card-create-dialog-body")).toHaveClass(
			"min-h-0",
			"space-y-5",
			"overflow-y-auto",
		)
		expect(screen.getByTestId("mock-ai-card-hide-enabled")).toHaveTextContent("true")
		expect(screen.getByTestId("ai-card-create-dialog-footer")).toHaveTextContent(
			"Enable scheduled execution",
		)
		expect(screen.getByTestId("mock-ai-card-enabled-switch")).toHaveAttribute(
			"data-checked",
			"false",
		)
	})

	it("submits plain prompt text while preserving rich JSONContent for AI card creation", async () => {
		const promptJSONContent = {
			type: "doc",
			content: [
				{
					type: "paragraph",
					content: [
						{ type: "text", text: "分析 " },
						{ type: "mention", attrs: { label: "sales.csv" } },
					],
				},
			],
		}

		render(
			<AICardCreateDialog
				open
				onOpenChange={vi.fn()}
				projectId="project-1"
				initialValues={{
					taskName: "销售看板",
					prompt: JSON.stringify(promptJSONContent),
					template: "analytics-panel",
					enabled: true,
				}}
			/>,
		)

		fireEvent.click(screen.getByRole("button", { name: "Create" }))

		await waitFor(() => {
			expect(createAICardViaTopic).toHaveBeenCalledWith(
				expect.objectContaining({
					prompt: "分析 sales.csv",
					promptJSONContent,
					cardName: "销售看板",
				}),
			)
		})
	})

	it("submits simplified notification channel descriptions for AI card creation", async () => {
		render(
			<AICardCreateDialog
				open
				onOpenChange={vi.fn()}
				projectId="project-1"
				initialValues={{
					taskName: "运营日报",
					prompt: "分析最新运营数据",
					template: "daily-digest",
					enabled: true,
				}}
			/>,
		)

		fireEvent.click(screen.getByRole("button", { name: "Set notification" }))
		fireEvent.click(screen.getByRole("button", { name: "Create" }))

		await waitFor(() => {
			expect(createAICardViaTopic).toHaveBeenCalledWith(
				expect.objectContaining({
					notification: {
						channels: [
							{
								channel: "dingtalk",
								targetDescription: "发到「运营日报群」",
							},
						],
					},
				}),
			)
		})
	})
})
