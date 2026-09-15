import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import ProjectOrganizationAccessGuard from "../index"
import { ProjectOrganizationAccessProvider } from "../../../contexts/ProjectOrganizationAccessContext"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string, values?: { organizationName?: string }) =>
			values?.organizationName ? `${key}:${values.organizationName}` : key,
	}),
}))

vi.mock("@/layouts/BaseLayout/components/Header/components/Logo", () => ({
	default: () => <div data-testid="logo" />,
}))

vi.mock("@/components/business/UserAvatarRender", () => ({
	default: ({ userInfo }: { userInfo: { nickname?: string } | null }) => (
		<div data-testid="project-organization-switch-avatar">{userInfo?.nickname}</div>
	),
}))

vi.mock("@/routes/history", () => ({
	history: { push: vi.fn() },
}))

describe("ProjectOrganizationAccessGuard", () => {
	beforeEach(() => vi.clearAllMocks())

	it("renders the project only when the current organization can access it", () => {
		render(
			<ProjectOrganizationAccessProvider
				value={{
					status: "ready",
					targetOrganization: null,
					targetUserInfo: null,
					handleSwitchOrganization: vi.fn(async () => undefined),
				}}
			>
				<ProjectOrganizationAccessGuard>
					<div>project content</div>
				</ProjectOrganizationAccessGuard>
			</ProjectOrganizationAccessProvider>,
		)

		expect(screen.getByText("project content")).toBeInTheDocument()
	})

	it("shows the target organization and starts the switch when required", () => {
		const handleSwitchOrganization = vi.fn()
		render(
			<ProjectOrganizationAccessProvider
				value={{
					status: "switch-required",
					targetOrganization: { organization_name: "Target Team" } as never,
					targetUserInfo: { nickname: "Target User" } as never,
					handleSwitchOrganization,
				}}
			>
				<ProjectOrganizationAccessGuard>
					<div>project content</div>
				</ProjectOrganizationAccessGuard>
			</ProjectOrganizationAccessProvider>,
		)

		expect(
			screen.getByText("collaborators.organizationSwitch.description:Target Team"),
		).toBeInTheDocument()
		expect(screen.getByTestId("project-organization-switch-user")).toHaveTextContent(
			"Target User",
		)
		expect(screen.queryByRole("banner")).not.toBeInTheDocument()
		expect(screen.queryByTestId("logo")).not.toBeInTheDocument()
		expect(screen.getByTestId("project-organization-switch")).toHaveClass(
			"h-full",
			"w-full",
			"min-w-0",
		)
		expect(screen.getByTestId("project-organization-switch")).not.toHaveClass("w-screen")

		fireEvent.click(
			screen.getByRole("button", { name: "collaborators.organizationSwitch.action" }),
		)

		expect(handleSwitchOrganization).toHaveBeenCalledOnce()
	})
})
