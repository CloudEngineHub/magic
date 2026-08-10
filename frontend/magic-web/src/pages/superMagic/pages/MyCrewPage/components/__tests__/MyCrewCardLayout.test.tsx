import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { CollaboratorPermissionEnum } from "@/pages/superMagic/types/collaboration"
import type { MyCrewView } from "@/services/crew/CrewService"
import CreatedCrewCard from "../CreatedCrewCard"
import HiredCrewCard from "../HiredCrewCard"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) =>
			({
				"myCrewPage.edit": "编辑",
				"myCrewPage.openConversation": "打开对话",
				"myCrewPage.origin.organizationShared": "组织共享",
				"interface:appList.noDescription": "暂无描述",
			})[key] ?? key,
	}),
}))

vi.mock("@/components/other/SmartTooltip", () => ({
	default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

function createEmployee(): MyCrewView {
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
	} as MyCrewView
}

describe("MyCrewCard desktop layout", () => {
	it.each([
		[
			"created",
			<CreatedCrewCard key="created" employee={createEmployee()} href="/crew/agent-1" />,
		],
		[
			"hired",
			<HiredCrewCard
				key="hired"
				employee={createEmployee()}
				href="/crew/agent-1"
				onEdit={vi.fn()}
				isCollaboratedCard
			/>,
		],
	])("keeps the %s card avatar spacing inside its grid item", (_kind, cardElement) => {
		render(cardElement)

		const card = screen.getByTestId("my-crew-card")
		const cardSurface = screen.getByTestId("my-crew-card-avatar-wrap").parentElement

		expect(card).toHaveClass("pt-12")
		expect(cardSurface).toHaveClass("flex-1")
	})
})
