import type { ComponentProps, ReactNode } from "react"
import { render } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { Table } from "antd"
import { ORGANIZATION_TAB_TYPE, VIEW } from "../../consts"
import { DetailSection } from "../DetailSection"

const tableProps = vi.hoisted(() => ({
	current: null as ComponentProps<typeof Table> | null,
}))

vi.mock("antd", () => ({
	Table: (props: ComponentProps<typeof Table>) => {
		tableProps.current = props
		return null
	},
	Tabs: ({
		activeKey,
		items,
	}: {
		activeKey: string
		items: Array<{ key: string; children?: ReactNode }>
	}) => <>{items.find((item) => item.key === activeKey)?.children}</>,
	Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock("@admin/hooks/useIsMobile", () => ({
	useIsMobile: () => false,
}))

vi.mock("@admin-components", () => ({
	MagicAvatar: () => null,
}))

vi.mock("../../styles", () => ({
	useStyles: () => ({
		styles: new Proxy({}, { get: (_, key) => String(key) }),
	}),
}))

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}))

describe("DetailSection", () => {
	it("does not scroll the dashboard to the first row when a tab reloads", () => {
		render(
			<DetailSection
				view={VIEW.OrganizationAnalysis}
				activeTab={ORGANIZATION_TAB_TYPE.Usage}
				pageSize={10}
				loading={false}
				onTabChange={vi.fn()}
				onPageChange={vi.fn()}
			/>,
		)

		expect(tableProps.current?.scroll).toMatchObject({
			scrollToFirstRowOnChange: false,
		})
	})
})
