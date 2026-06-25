import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("react-i18next", () => ({
	initReactI18next: {
		type: "3rdParty",
		init: vi.fn(),
	},
	useTranslation: () => ({
		t: (key: string, fallback?: string | Record<string, string | number>) => {
			const messages: Record<string, string> = {
				"detail.selfMedia.initPanel.stepTopic.generateCount": "生成",
				"detail.selfMedia.initPanel.stepTopic.generateCountInputLabel": "生成数量",
				"detail.selfMedia.initPanel.stepTopic.generateCountHint":
					"建议一次生成 3-5 个，便于挑选",
				"detail.selfMedia.initPanel.stepTopic.generateBtn": "生成选题",
				"detail.selfMedia.initPanel.stepTopic.generatedStatus": "已生成 {{count}} 个选题",
			}
			const message = messages[key] || (typeof fallback === "string" ? fallback : key)
			if (typeof fallback === "object" && fallback) {
				return message.replace(/\{\{(\w+)\}\}/g, (_, token: string) =>
					String((fallback as Record<string, string | number>)[token] ?? ""),
				)
			}
			return message
		},
	}),
}))

vi.mock("../components/SelfMediaInitPanel/components/picker/ReferenceFilePicker", () => ({
	default: () => <div data-testid="reference-file-picker" />,
}))

vi.mock("../components/SelfMediaInitPanel/components/picker/ModelSelector", () => ({
	default: () => <button type="button" data-testid="model-selector" />,
}))

vi.mock("../components/SelfMediaInitPanel/components/ui/InlineVoiceButton", () => ({
	default: () => <button type="button" data-testid="inline-voice-button" />,
}))

import AiTopicAssistant from "../components/SelfMediaInitPanel/components/ai/AiTopicAssistant"

const keepGenerationPending = () =>
	new Promise<boolean>(() => {
		return undefined
	})

describe("AiTopicAssistant style", () => {
	beforeEach(() => {
		vi.stubGlobal(
			"matchMedia",
			vi.fn().mockImplementation((query: string) => ({
				matches: false,
				media: query,
				onchange: null,
				addEventListener: vi.fn(),
				removeEventListener: vi.fn(),
				addListener: vi.fn(),
				removeListener: vi.fn(),
				dispatchEvent: vi.fn(),
			})),
		)
	})

	it("renders as a homepage-style planning surface instead of the previous dark workbench", () => {
		render(<AiTopicAssistant onGenerate={vi.fn().mockResolvedValue(true)} />)

		let assistant = screen.getByText("让 AI 帮我策划选题与大纲").parentElement
		while (assistant && !assistant.className.includes("rounded-[28px]")) {
			assistant = assistant.parentElement
		}

		expect(assistant).toBeTruthy()
		expect(assistant).toHaveClass("bg-white/95")
		expect(screen.getByText("待策划")).toBeInTheDocument()
		expect(assistant).not.toHaveClass("bg-[#232321]")
		expect(screen.getByRole("spinbutton")).toHaveAttribute("data-slot", "input")
		expect(screen.getByRole("checkbox")).toHaveAttribute("data-slot", "checkbox")
	})

	it("keeps the topic count recommendation attached to the input without visible helper copy", () => {
		render(<AiTopicAssistant onGenerate={vi.fn().mockResolvedValue(true)} />)

		const countInput = screen.getByRole("spinbutton", { name: "生成数量" })
		const hint = "建议一次生成 3-5 个，便于挑选"

		expect(countInput).toHaveAttribute("title", hint)
		expect(countInput).toHaveAccessibleDescription(hint)
		expect(screen.getByText(hint)).toHaveClass("sr-only")
		expect(screen.getAllByText(hint)).toHaveLength(1)
	})

	it("unifies the planning toggle and generate action with the self-media action style", () => {
		render(<AiTopicAssistant onGenerate={vi.fn().mockResolvedValue(true)} />)

		const detailToggle = screen.getByRole("checkbox").closest("label")
		expect(detailToggle).toHaveClass("rounded-full")
		expect(detailToggle).toHaveClass("bg-[#f4f4f5]")
		expect(detailToggle).not.toHaveClass("text-muted-foreground")

		const actionShell = screen.getByTestId("model-selector").closest("div")
		expect(actionShell).toHaveClass("rounded-full")
		expect(actionShell).toHaveClass("bg-[#18181b]")
		expect(actionShell).toHaveClass("text-white")
		expect(actionShell).not.toHaveClass("bg-primary/10")
	})

	it("turns a successful generation into compact completion feedback", async () => {
		const onGenerate = vi.fn().mockResolvedValue(true)

		render(<AiTopicAssistant onGenerate={onGenerate} />)

		fireEvent.click(screen.getByRole("button", { name: "生成选题" }))

		await waitFor(() => {
			expect(screen.getByText("已生成 5 个选题")).toBeInTheDocument()
		})
		expect(screen.queryByText("待策划")).not.toBeInTheDocument()
		expect(onGenerate).toHaveBeenCalledWith(
			expect.objectContaining({
				count: 5,
			}),
		)
	})

	it("clears stale completion feedback when the generation direction changes", async () => {
		render(<AiTopicAssistant onGenerate={vi.fn().mockResolvedValue(true)} />)

		fireEvent.click(screen.getByRole("button", { name: "生成选题" }))

		await waitFor(() => {
			expect(screen.getByText("已生成 5 个选题")).toBeInTheDocument()
		})

		fireEvent.change(screen.getByRole("textbox"), {
			target: { value: "换一个方向" },
		})

		expect(screen.queryByText("已生成 5 个选题")).not.toBeInTheDocument()
		expect(screen.getByText("待策划")).toBeInTheDocument()
	})

	it("keeps the generate action visibly disabled when planning is unavailable", () => {
		const onGenerate = vi.fn().mockResolvedValue(true)

		render(<AiTopicAssistant disabled onGenerate={onGenerate} />)

		const generateButton = screen.getByRole("button", { name: "生成选题" })
		expect(generateButton).toBeDisabled()

		fireEvent.click(generateButton)

		expect(onGenerate).not.toHaveBeenCalled()
	})

	it("renders a lively scoped progress scene while generating without inline keyframe styles", async () => {
		const onGenerate = vi.fn(keepGenerationPending)
		const { container } = render(<AiTopicAssistant onGenerate={onGenerate} />)

		fireEvent.click(screen.getByRole("button", { name: "生成选题" }))

		const card = await screen.findByTestId("ai-topic-generating-card")
		expect(card).toHaveAttribute("data-self-media-motion", "topic-generating-card")
		expect(screen.getByTestId("ai-topic-progress-track")).toBeInTheDocument()
		expect(screen.getByTestId("ai-topic-workbench")).toBeInTheDocument()
		expect(card.querySelector("style")).toBeNull()
		expect(container.querySelector(".animate-shimmer")).toBeNull()
	})

	it("keeps stop abort behavior while leaving the generating state", async () => {
		let signal: AbortSignal | undefined
		const onGenerate = vi.fn((params: { signal: AbortSignal }) => {
			signal = params.signal
			return keepGenerationPending()
		})

		render(<AiTopicAssistant onGenerate={onGenerate} />)

		fireEvent.click(screen.getByRole("button", { name: "生成选题" }))

		await screen.findByTestId("ai-topic-generating-card")
		fireEvent.click(screen.getByRole("button", { name: "停止" }))

		expect(signal?.aborted).toBe(true)
		await waitFor(() => {
			expect(screen.queryByTestId("ai-topic-generating-card")).not.toBeInTheDocument()
		})
	})
})
