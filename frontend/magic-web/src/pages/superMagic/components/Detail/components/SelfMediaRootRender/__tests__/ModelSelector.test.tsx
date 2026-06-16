import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import ModelSelector from "../components/SelfMediaInitPanel/components/picker/ModelSelector"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string, fallback?: string) => {
			if (key === "detail.selfMedia.initPanel.modelSelector.switchModel") {
				return "Switch model"
			}
			return fallback || key
		},
	}),
}))

vi.mock("@/services/superMagic/SuperMagicModeService", () => ({
	default: {
		getModelListByMode: () => [
			{
				id: "model-a",
				model_id: "model-a",
				model_name: "Model A",
				model_icon: "",
			},
		],
		getImageModelListByMode: () => [],
		getVideoModelListByMode: () => [],
	},
}))

describe("ModelSelector", () => {
	it("uses localized tooltip text for the model switch trigger", () => {
		render(<ModelSelector value="model-a" onChange={vi.fn()} />)

		expect(screen.getByRole("button", { name: /Model A/ })).toHaveAttribute(
			"title",
			"Switch model",
		)
		expect(screen.queryByTitle("切换模型")).not.toBeInTheDocument()
	})
})
