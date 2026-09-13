import { render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { SuperMagicApi } from "@/apis"
import PublishedMicroAppConversationProvider from "../PublishedMicroAppConversationProvider"

vi.mock("react-i18next", () => ({
	initReactI18next: { type: "3rdParty", init: vi.fn() },
	useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock("@/pages/superMagic/pages/MicroAppPage/components/AppConversationPanel", () => ({
	default: () => <div data-testid="app-conversation-panel" />,
}))

vi.mock("@/apis", () => ({
	SuperMagicApi: {
		getMicroAppRuntimeProject: vi.fn().mockResolvedValue({ exists: false }),
		ensureMicroAppRuntimeProject: vi.fn(),
	},
}))

describe("PublishedMicroAppConversationProvider", () => {
	it("renders children without AppStoreProvider when conversation is disabled", () => {
		render(
			<PublishedMicroAppConversationProvider appId="app-1" enabled={false}>
				<div data-testid="preview-child" />
			</PublishedMicroAppConversationProvider>,
		)

		expect(screen.getByTestId("preview-child")).toBeInTheDocument()
		expect(
			screen.queryByTestId("published-micro-app-conversation-expand"),
		).not.toBeInTheDocument()
	})

	it("renders children without a parent AppStoreProvider when enabled", async () => {
		render(
			<PublishedMicroAppConversationProvider appId="app-1">
				<div data-testid="preview-child" />
			</PublishedMicroAppConversationProvider>,
		)

		expect(screen.getByTestId("preview-child")).toBeInTheDocument()
		await waitFor(() => {
			expect(SuperMagicApi.getMicroAppRuntimeProject).toHaveBeenCalledWith("app-1", {
				enableErrorMessagePrompt: false,
			})
		})
	})
})
