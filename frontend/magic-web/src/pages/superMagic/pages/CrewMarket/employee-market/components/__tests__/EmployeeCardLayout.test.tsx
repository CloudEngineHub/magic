import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { StoreAgentView } from "@/services/crew/CrewService"
import EmployeeCard from "../EmployeeCard"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) =>
			({
				"crew/create:untitledCrew": "未命名员工",
				"interface:appList.noDescription": "暂无描述",
				"crew/market:skillsLibrary.official": "官方内置",
				"crew/market:employeeCard.officialBuiltin": "官方内置",
				"crew/market:employeeCard.publisherDefault": "官方内置",
				"crew/market:details": "详情",
			})[key] ?? key,
	}),
}))

vi.mock("@/components/other/SmartTooltip", () => ({
	default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

function createEmployee(): StoreAgentView {
	return {
		id: "store-1",
		agentCode: "agent-1",
		userCode: null,
		isFeatured: false,
		latestVersionCode: "1.0.0",
		name: "数据分析专家",
		role: "数据分析师",
		description: "专业数据 AI 助理，深度挖掘各类办公数据的潜在价值。",
		icon: "",
		playbooks: [],
		publisherType: "OFFICIAL_BUILTIN",
		publisherName: null,
		marketType: "OFFICIAL",
		categoryId: null,
		isAdded: false,
		allowDelete: false,
		updatedAt: "2026-08-06T00:00:00.000Z",
	}
}

describe("EmployeeCard desktop layout", () => {
	it("keeps the card surface independent from Safari grid height calculation", () => {
		render(<EmployeeCard employee={createEmployee()} />)

		const card = screen.getByTestId("employee-card")
		const cardSurface = card.children[1] as HTMLElement

		expect(card).toHaveClass("pt-10")
		expect(card).not.toHaveClass("h-full")
		expect(cardSurface).toHaveClass("flex-1")
	})
})
