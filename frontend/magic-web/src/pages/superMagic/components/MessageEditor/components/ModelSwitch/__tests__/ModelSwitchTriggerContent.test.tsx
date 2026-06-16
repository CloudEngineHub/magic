import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { ModelItem } from "../types"
import { ModelSwitchTriggerContent } from "../components/ModelSwitchTriggerContent"

const MODEL: ModelItem = {
	id: "model-1",
	group_id: "group-1",
	model_id: "gpt-5",
	model_name: "GPT-5",
	provider_model_id: "gpt-5",
	model_description: "",
	model_icon: "https://example.com/gpt-5.svg",
	model_status: "normal" as ModelItem["model_status"],
	sort: 1,
}

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}))

vi.mock("../components/ModelIcon", () => ({
	default: ({ model }: { model: ModelItem }) => (
		<span data-testid="model-icon">{model.model_id}</span>
	),
}))

describe("ModelSwitchTriggerContent", () => {
	it("renders selected model icon and name when selected model name is enabled", () => {
		render(
			<ModelSwitchTriggerContent
				showLabel={false}
				selectedLanguageModel={MODEL}
				isLoading={false}
				iconSize={16}
				triggerTab="language"
				showSelectedModelName
			/>,
		)

		expect(screen.getByTestId("model-icon")).toHaveTextContent("gpt-5")
		expect(screen.getByText("GPT-5")).toBeInTheDocument()
	})

	it("keeps the compact icon-only trigger by default", () => {
		render(
			<ModelSwitchTriggerContent
				showLabel={false}
				selectedLanguageModel={MODEL}
				isLoading={false}
				iconSize={16}
				triggerTab="language"
			/>,
		)

		expect(screen.getByTestId("model-icon")).toBeInTheDocument()
		expect(screen.queryByText("GPT-5")).not.toBeInTheDocument()
	})
})
