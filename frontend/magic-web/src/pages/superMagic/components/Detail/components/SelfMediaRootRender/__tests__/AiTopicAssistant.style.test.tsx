import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock("react-i18next", () => ({
	initReactI18next: {
		type: "3rdParty",
		init: vi.fn(),
	},
	useTranslation: () => ({
		t: (_key: string, fallback?: string) => fallback || _key,
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

describe("AiTopicAssistant style", () => {
	it("renders as a shadcn-style card instead of the previous dark workbench", () => {
		render(<AiTopicAssistant onGenerate={vi.fn().mockResolvedValue(true)} />)

		const assistant = screen
			.getByText("让 AI 帮我策划选题与大纲")
			.closest("div[class*='rounded-lg']")

		expect(assistant).toBeTruthy()
		expect(assistant).toHaveClass("bg-card")
		expect(assistant).not.toHaveClass("bg-[#232321]")
		expect(screen.getByRole("spinbutton")).toHaveAttribute("data-slot", "input")
		expect(screen.getByRole("checkbox")).toHaveAttribute("data-slot", "checkbox")
	})
})
