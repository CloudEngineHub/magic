import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { MagicBaseColumn } from "@/apis/modules/magicBase"
import StructureTable from "../StructureTable"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}))

describe("StructureTable", () => {
	it("renders column metadata and permissions", () => {
		const columns: MagicBaseColumn[] = [
			{
				id: "column-1",
				table_id: "table-1",
				column_key: "brand",
				column_name: "Brand",
				data_type: "text",
				is_required: true,
				status: "enabled",
				dynamic_permission: { read_scope: "public", edit_scope: "owner" },
			},
		]

		render(<StructureTable columns={columns} />)

		expect(screen.getByText("Brand")).toBeInTheDocument()
		expect(screen.getByText("brand")).toBeInTheDocument()
		expect(screen.getByText("text")).toBeInTheDocument()
		expect(screen.getByText("microAppPage.databasePanel.yes")).toBeInTheDocument()
		expect(screen.getByText("enabled")).toBeInTheDocument()
		expect(screen.getByText("public / owner")).toBeInTheDocument()
	})

	it("renders empty column state", () => {
		render(<StructureTable columns={[]} />)

		expect(screen.getByText("microAppPage.databasePanel.noColumns")).toBeInTheDocument()
	})
})
