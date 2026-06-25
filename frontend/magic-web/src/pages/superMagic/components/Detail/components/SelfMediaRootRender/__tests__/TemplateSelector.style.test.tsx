import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { TemplateMeta } from "../services/SelfMediaFileStorageService"

vi.mock("react-i18next", () => ({
	initReactI18next: {
		type: "3rdParty",
		init: vi.fn(),
	},
	useTranslation: () => ({
		t: (key: string, options?: Record<string, unknown>) =>
			options?.count ? `${options.count} articles` : key,
	}),
}))

import TemplateSelector from "../components/SelfMediaInitPanel/steps/TemplateSelector"

const templates: TemplateMeta[] = [
	{
		id: "template-1",
		name: "Launch Plan",
		articleCount: 3,
		createdAt: "2026-06-01T00:00:00.000Z",
		updatedAt: "2026-06-01T00:00:00.000Z",
	},
]

describe("TemplateSelector style", () => {
	it("uses the self-media home card language for template choices", () => {
		render(
			<TemplateSelector
				templates={templates}
				onLoadTemplate={vi.fn()}
				onStartBlank={vi.fn()}
			/>,
		)

		const blankButton = screen.getByRole("button", { name: /空白开始/ })
		const templateButton = screen.getByRole("button", { name: /Launch Plan/ })

		expect(blankButton).toHaveAttribute("data-slot", "button")
		expect(blankButton).toHaveClass("rounded-[24px]", "bg-white")
		expect(blankButton).not.toHaveClass("border-l-2")
		expect(templateButton).toHaveAttribute("data-slot", "button")
		expect(templateButton).toHaveClass("rounded-[24px]", "bg-white")
		expect(templateButton).not.toHaveClass("border-l-2")
	})
})
