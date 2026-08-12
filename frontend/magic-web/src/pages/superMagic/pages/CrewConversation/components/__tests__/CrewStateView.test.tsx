import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
	navigate: vi.fn(),
}))

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) =>
			({
				"crewConversation.unavailable": "Crew Unavailable Mock",
				"crewConversation.back": "Back Mock",
				"crewConversation.invalidCode": "Invalid Crew Mock",
				"crewConversation.loadFailed": "Load Failed Mock",
				"crewConversation.relogin": "Relogin Mock",
				"crewConversation.retry": "Retry Mock",
			})[key] ?? key,
	}),
}))

vi.mock("@/routes/hooks/useNavigate", () => ({
	default: () => mocks.navigate,
}))

vi.mock("@/pages/login/constants", () => ({
	LoginValueKey: { REDIRECT_URL: "redirect" },
}))

vi.mock("@/pages/login/utils/loginRedirect", () => ({
	buildLoginRedirectSearchParams: () => new URLSearchParams("redirect=crew-page-mock"),
}))

vi.mock("@/routes/constants", () => ({
	RouteName: { Login: "Login" },
}))

vi.mock("@/routes/history/helpers", () => ({
	convertSearchParams: () => ({ redirect: "crew-page-mock" }),
}))

import CrewStateView from "../CrewStateView"

describe("CrewStateView", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("offers login recovery for load failures", () => {
		render(<CrewStateView status="error" onRetry={vi.fn()} />)

		expect(screen.getByText("Load Failed Mock")).toBeInTheDocument()
		fireEvent.click(screen.getByRole("button", { name: "Relogin Mock" }))

		expect(mocks.navigate).toHaveBeenCalledWith(
			expect.objectContaining({
				name: "Login",
				query: { redirect: "crew-page-mock" },
				replace: true,
			}),
		)
	})

	it("does not offer login recovery for an invalid Crew code", () => {
		render(<CrewStateView status="invalid" />)

		expect(screen.getByText("Invalid Crew Mock")).toBeInTheDocument()
		expect(screen.queryByRole("button", { name: "Relogin Mock" })).not.toBeInTheDocument()
	})

	it("shows the dedicated state when the Crew member is unavailable", () => {
		render(<CrewStateView status="unavailable" />)

		expect(screen.getByText("Crew Unavailable Mock")).toBeInTheDocument()
		expect(screen.queryByRole("button", { name: "Retry Mock" })).not.toBeInTheDocument()
	})
})
