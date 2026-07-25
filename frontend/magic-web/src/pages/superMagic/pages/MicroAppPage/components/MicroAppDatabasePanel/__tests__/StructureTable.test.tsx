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
	it("renders column metadata without permissions", () => {
		const columns: MagicBaseColumn[] = [
			{
				id: "column-1",
				table_id: "table-1",
				column_key: "brand",
				column_name: "Brand",
				data_type: "text",
				is_required: true,
				status: "enabled",
				source: "schema",
				dynamic_permission: { read_scope: "public", edit_scope: "owner" },
			},
			{
				id: "system:created_by",
				table_id: "table-1",
				column_key: "created_by",
				column_name: "created_by",
				data_type: "text",
				is_required: true,
				status: "enabled",
				source: "system",
				system: true,
				readonly: true,
			},
		]

		render(<StructureTable columns={columns} />)

		expect(screen.getByText("Brand")).toBeInTheDocument()
		expect(screen.getByText("brand")).toBeInTheDocument()
		expect(screen.getAllByText("text").length).toBeGreaterThan(0)
		expect(screen.getByText("microAppPage.databasePanel.schemaField")).toBeInTheDocument()
		expect(screen.getByText("microAppPage.databasePanel.systemField")).toBeInTheDocument()
		expect(screen.getAllByText("microAppPage.databasePanel.yes").length).toBeGreaterThan(0)
		expect(screen.getAllByText("enabled").length).toBeGreaterThan(0)
		expect(screen.queryByText("microAppPage.databasePanel.permission")).not.toBeInTheDocument()
		expect(screen.queryByText("public / owner")).not.toBeInTheDocument()
	})

	it("renders empty column state", () => {
		render(<StructureTable columns={[]} />)

		expect(screen.getByText("microAppPage.databasePanel.noColumns")).toBeInTheDocument()
	})
})
