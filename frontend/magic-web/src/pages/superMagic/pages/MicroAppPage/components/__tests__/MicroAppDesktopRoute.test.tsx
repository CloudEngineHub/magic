import type { ReactNode } from "react"
import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { RouteName } from "@/routes/constants"
import type { MicroAppProjectError } from "../../hooks/useMicroAppProjectResolver"
import MicroAppDesktopRoute from "../MicroAppDesktopRoute"

const mocks = vi.hoisted(() => ({
	navigate: vi.fn(),
	resolver: {
		projectId: "",
		isPublished: false,
		setIsPublished: vi.fn(),
		loading: false,
		error: null as MicroAppProjectError | null,
	},
}))

vi.mock("react-router", () => ({
	useParams: () => ({ appId: "app-1" }),
}))

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock("@/routes/hooks/useNavigate", () => ({
	default: () => mocks.navigate,
}))

vi.mock("../../context", () => ({
	AppStoreProvider: ({ children }: { children: ReactNode }) => children,
}))

vi.mock("../../hooks/useMicroAppProjectResolver", () => ({
	useMicroAppProjectResolver: () => mocks.resolver,
}))

function Content() {
	return <div data-testid="micro-app-content" />
}

describe("MicroAppDesktopRoute fallback", () => {
	beforeEach(() => {
		mocks.navigate.mockClear()
		mocks.resolver.projectId = ""
		mocks.resolver.loading = false
		mocks.resolver.error = null
	})

	it("shows the generic fallback when project resolution has no display message", () => {
		mocks.resolver.error = { kind: "load", message: "" }

		render(<MicroAppDesktopRoute Content={Content} />)

		expect(screen.getByText("microAppPage.errors.loadFailed")).toBeInTheDocument()
		expect(screen.getByTestId("micro-app-load-fallback-illustration")).toHaveAttribute(
			"data-state",
			"retry",
		)
	})

	it("shows the permission fallback and returns to the micro app list", () => {
		mocks.resolver.error = {
			kind: "permission",
			message: "Access denied to this project",
		}

		render(<MicroAppDesktopRoute Content={Content} />)

		expect(screen.getByText("microAppPage.errors.permissionTitle")).toBeInTheDocument()
		expect(screen.getByText("microAppPage.errors.permissionDescription")).toBeInTheDocument()
		expect(screen.getByTestId("micro-app-permission-fallback-illustration")).toHaveAttribute(
			"data-state",
			"permission",
		)

		fireEvent.click(screen.getByRole("button", { name: "microAppPage.header.backToApps" }))
		expect(mocks.navigate).toHaveBeenCalledWith({ name: RouteName.MicroApps })
	})
})
