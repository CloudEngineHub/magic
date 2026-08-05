import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import PermissionPanel from "../PermissionPanel"

vi.mock("react-i18next", () => ({
	initReactI18next: { type: "3rdParty", init: () => undefined },
	useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock("@/apis", () => ({
	ContactApi: {},
}))

vi.mock("@/components/base/MagicAvatar", () => ({
	default: () => null,
}))

vi.mock("../DynamicPermissionPanel", () => ({
	default: () => <div data-testid="dynamic-permission-panel" />,
}))

describe("PermissionPanel", () => {
	it("only exposes dynamic permissions while static permissions are disabled", () => {
		render(
			<PermissionPanel
				projectId="project-1"
				table={{
					id: "table-1",
					project_id: "project-1",
					table_key: "tasks",
					table_name: "Tasks",
					status: "enabled",
					columns: [],
				}}
				columns={[]}
				onRefreshPermissions={vi.fn()}
				onRefreshTable={vi.fn()}
			/>,
		)

		expect(screen.getByTestId("dynamic-permission-panel")).toBeInTheDocument()
		expect(
			screen.getByText("microAppPage.databasePanel.dynamicPermissions"),
		).toBeInTheDocument()
		expect(
			screen.queryByText("microAppPage.databasePanel.staticPermissions"),
		).not.toBeInTheDocument()
	})
})
