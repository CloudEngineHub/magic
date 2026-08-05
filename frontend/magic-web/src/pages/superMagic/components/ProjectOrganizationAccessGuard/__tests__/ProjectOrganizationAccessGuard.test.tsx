import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import ProjectOrganizationAccessGuard from "../index"

const useProjectOrganizationAccessMock = vi.fn()

vi.mock("react-router", () => ({
	useParams: () => ({ projectId: "project-1" }),
}))

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

vi.mock("../../../hooks/useProjectOrganizationAccess", () => ({
	useProjectOrganizationAccess: (projectId: string) =>
		useProjectOrganizationAccessMock(projectId),
}))

describe("ProjectOrganizationAccessGuard", () => {
	beforeEach(() => {
		useProjectOrganizationAccessMock.mockReset()
	})

	it("renders the project only when the current organization can access it", () => {
		useProjectOrganizationAccessMock.mockReturnValue({ status: "ready" })

		render(
			<ProjectOrganizationAccessGuard>
				<div>project content</div>
			</ProjectOrganizationAccessGuard>,
		)

		expect(screen.getByText("project content")).toBeInTheDocument()
		expect(useProjectOrganizationAccessMock).toHaveBeenCalledWith("project-1")
	})

	it("shows the target organization and starts the switch when required", () => {
		const handleSwitchOrganization = vi.fn()
		useProjectOrganizationAccessMock.mockReturnValue({
			status: "switch-required",
			targetOrganization: { organization_name: "Target Team" },
			targetUserInfo: { nickname: "Target User" },
			handleSwitchOrganization,
		})

		render(
			<ProjectOrganizationAccessGuard>
				<div>project content</div>
			</ProjectOrganizationAccessGuard>,
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
