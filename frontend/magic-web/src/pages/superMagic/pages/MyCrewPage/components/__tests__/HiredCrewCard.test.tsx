import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { CollaboratorPermissionEnum } from "@/pages/superMagic/types/collaboration"
import type { MyCrewView } from "@/services/crew/CrewService"
import HiredCrewCard from "../HiredCrewCard"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) =>
			({
				"myCrewPage.edit": "编辑",
				"myCrewPage.view": "查看",
				"myCrewPage.origin.organizationShared": "组织共享",
				"interface:appList.noDescription": "暂无描述",
			})[key] ?? key,
	}),
}))

vi.mock("@/components/other/SmartTooltip", () => ({
	default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

function createEmployee(overrides: Partial<MyCrewView> = {}) {
	return {
		id: "crew-1",
		agentCode: "agent-1",
		name: "Crew Name",
		role: "Analyst",
		description: "Crew description",
		icon: "",
		enabled: true,
		needUpgrade: false,
		allowDelete: false,
		latestVersionCode: "v1",
		latestPublishedAt: "2026-03-22T10:00:00.000Z",
		sourceType: "LOCAL_CREATE",
		publisherType: null,
		publisherName: null,
		playbooks: [],
		creatorName: "Teammate",
		userRole: CollaboratorPermissionEnum.EDITABLE,
		...overrides,
	} as MyCrewView
}

describe("HiredCrewCard", () => {
	it("shows 查看 for collaborated viewers", () => {
		render(
			<HiredCrewCard
				employee={createEmployee({ userRole: CollaboratorPermissionEnum.READONLY })}
				href="/crew/agent-1"
				onEdit={vi.fn()}
				isCollaboratedCard
			/>,
		)

		const actionButton = screen.getByTestId("my-crew-card-edit-button")
		expect(actionButton).toHaveTextContent("查看")
		expect(actionButton.querySelector(".lucide-eye")).toBeInTheDocument()
		expect(actionButton.querySelector(".lucide-settings-2")).not.toBeInTheDocument()
	})

	it("keeps 编辑 for collaborated editors", () => {
		render(
			<HiredCrewCard
				employee={createEmployee({ userRole: CollaboratorPermissionEnum.EDITABLE })}
				href="/crew/agent-1"
				onEdit={vi.fn()}
				isCollaboratedCard
			/>,
		)

		const actionButton = screen.getByTestId("my-crew-card-edit-button")
		expect(actionButton).toHaveTextContent("编辑")
		expect(actionButton.querySelector(".lucide-settings-2")).toBeInTheDocument()
	})

	it("opens the crew editor when a viewer clicks 查看", () => {
		const onEdit = vi.fn()

		render(
			<HiredCrewCard
				employee={createEmployee({ userRole: CollaboratorPermissionEnum.READONLY })}
				href="/crew/agent-1"
				onEdit={onEdit}
				isCollaboratedCard
			/>,
		)

		fireEvent.click(screen.getByTestId("my-crew-card-edit-button"))

		expect(onEdit).toHaveBeenCalledWith("agent-1")
	})
})
