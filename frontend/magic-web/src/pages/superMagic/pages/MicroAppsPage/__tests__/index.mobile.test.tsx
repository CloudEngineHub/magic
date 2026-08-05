import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { RouteName } from "@/routes/constants"
import MicroAppsPageMobile from "../index.mobile"

const mocks = vi.hoisted(() => ({
	navigate: vi.fn(),
	useMicroAppWorkspace: vi.fn(),
}))

interface MockCreatePromptProps {
	onCreated: (appId: string) => void
	onFocusChange?: (focused: boolean) => void
	mobile?: boolean
}

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock("@/routes/hooks/useNavigate", () => ({
	default: () => mocks.navigate,
}))

vi.mock("../hooks/useMicroAppsPage", () => ({
	useMicroAppWorkspace: mocks.useMicroAppWorkspace,
}))

vi.mock("../components/MicroAppCreatePrompt", () => ({
	default: ({ onCreated, onFocusChange, mobile }: MockCreatePromptProps) => (
		<button
			type="button"
			data-testid="mock-mobile-create-prompt"
			data-mobile={mobile}
			onClick={() => onCreated("app-new")}
			onFocus={() => onFocusChange?.(true)}
			onBlur={() => onFocusChange?.(false)}
		>
			create
		</button>
	),
}))

vi.mock("../components/MicroAppHeroTitle", () => ({
	default: () => <h1>hero</h1>,
}))

vi.mock("@/pages/superMagicMobile/components/MobileShell", () => ({
	MobileShellSidebarToggleButton: () => <button type="button">menu</button>,
}))

describe("MicroAppsPageMobile", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mocks.useMicroAppWorkspace.mockReturnValue({ id: "workspace-1", name: "Micro Apps" })
	})

	it("keeps the creation composer at the bottom and opens the list from the header", () => {
		render(<MicroAppsPageMobile />)

		expect(screen.getByTestId("micro-apps-mobile-create-dock")).toContainElement(
			screen.getByTestId("mock-mobile-create-prompt"),
		)
		expect(screen.getByTestId("mock-mobile-create-prompt")).toHaveAttribute(
			"data-mobile",
			"true",
		)
		expect(screen.queryByTestId("micro-apps-mobile-search")).not.toBeInTheDocument()
		expect(screen.queryByTestId("micro-app-mosaic")).not.toBeInTheDocument()
		expect(screen.getByTestId("micro-apps-mobile-open-list")).toHaveClass(
			"mobile-page-header-btn",
		)

		fireEvent.click(screen.getByTestId("micro-apps-mobile-open-list"))

		expect(mocks.navigate).toHaveBeenCalledWith({ name: RouteName.MicroAppsList })
	})

	it("enters the new app after the mobile creation prompt returns app_id", async () => {
		render(<MicroAppsPageMobile />)

		fireEvent.click(screen.getByTestId("mock-mobile-create-prompt"))

		await waitFor(() => {
			expect(mocks.navigate).toHaveBeenCalledWith({
				name: RouteName.MicroApp,
				params: { appId: "app-new" },
				viewTransition: false,
			})
		})
	})
})
