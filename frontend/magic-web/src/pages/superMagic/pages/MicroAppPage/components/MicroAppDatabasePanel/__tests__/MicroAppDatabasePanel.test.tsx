import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { SWRConfig } from "swr"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { MagicBaseTable } from "@/apis/modules/magicBase"
import MicroAppDatabasePanel from "../index"

const mocks = vi.hoisted(() => ({
	getTables: vi.fn(),
	getTable: vi.fn(),
	queryRows: vi.fn(),
	getPermissions: vi.fn(),
	batchSavePermissions: vi.fn(),
	deletePermission: vi.fn(),
}))

vi.mock("@/apis", () => ({
	MagicBaseApi: {
		getTables: mocks.getTables,
		getTable: mocks.getTable,
		queryRows: mocks.queryRows,
		getPermissions: mocks.getPermissions,
		batchSavePermissions: mocks.batchSavePermissions,
		deletePermission: mocks.deletePermission,
	},
}))

vi.mock("@/components/business/MemberDepartmentSelector", () => ({
	default: () => null,
}))

vi.mock("../PermissionPanel", () => ({
	default: () => null,
}))

vi.mock("../PermissionEditorDialog", () => ({
	default: () => null,
}))

vi.mock("../RowEditorDialog", () => ({
	default: () => null,
}))

vi.mock("@/models/user", () => ({
	userStore: {
		user: {
			organizationCode: "org-1",
			userInfo: { organization_code: "org-1" },
		},
	},
}))

vi.mock("sonner", () => ({
	toast: {
		error: vi.fn(),
		success: vi.fn(),
	},
}))

vi.mock("react-i18next", () => {
	return {
		initReactI18next: { type: "3rdParty", init: () => undefined },
		useTranslation: () => ({
			t: (key: string, options?: Record<string, string | number>) => {
				if (options?.total != null) return `${key}:${options.total}`
				if (options?.page != null && options?.totalPages != null) {
					return `${key}:${options.page}/${options.totalPages}`
				}
				return key
			},
		}),
	}
})

const tables: MagicBaseTable[] = [
	{
		id: "table-1",
		project_id: "project-1",
		table_key: "survey",
		table_name: "Survey",
		description: "Survey answers",
		status: "enabled",
		columns: [],
	},
]

const tableDetail: MagicBaseTable = {
	...tables[0],
	columns: [
		{
			id: "column-1",
			table_id: "table-1",
			column_key: "brand",
			column_name: "Brand",
			data_type: "text",
			is_required: false,
			status: "enabled",
			dynamic_permission: { read_scope: "public", edit_scope: "public" },
		},
		{
			id: "column-2",
			table_id: "table-1",
			column_key: "created_at",
			column_name: "Created At",
			data_type: "datetime",
			is_required: false,
			status: "enabled",
		},
	],
}

function renderPanel() {
	return render(
		<SWRConfig
			value={{
				provider: () => new Map(),
				dedupingInterval: 0,
				shouldRetryOnError: false,
			}}
		>
			<MicroAppDatabasePanel active projectId="project-1" projectName="Demo App" />
		</SWRConfig>,
	)
}

describe("MicroAppDatabasePanel", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mocks.getTables.mockResolvedValue(tables)
		mocks.getTable.mockResolvedValue(tableDetail)
		mocks.queryRows.mockResolvedValue({
			page: 1,
			page_size: 20,
			total: 35,
			list: [{ id: "row-1", brand: "Apple", created_at: "2026-07-06 18:01:42" }],
		})
		mocks.getPermissions.mockResolvedValue({
			table_permissions: [],
			column_permissions: [],
			row_permissions: [],
		})
	})

	afterEach(() => {
		cleanup()
		document.body.removeAttribute("data-scroll-locked")
		document.body.style.pointerEvents = ""
	})

	it("loads table list, selects the first table, and renders rows", async () => {
		renderPanel()

		await screen.findByText("Apple")
		expect(screen.getAllByText("Survey").length).toBeGreaterThan(0)
		expect(document.body).not.toHaveTextContent("survey")
		expect(document.body).not.toHaveTextContent("brand")
		expect(document.body).toHaveTextContent("text")
		expect(mocks.getTables).toHaveBeenCalledWith("project-1")
		expect(mocks.getTable).toHaveBeenCalledWith("project-1", "table-1")
		expect(mocks.queryRows).toHaveBeenCalledWith(
			"project-1",
			"table-1",
			expect.objectContaining({
				select: "id,brand,organization_code,created_by,created_at,updated_at",
				filter: {},
				sort: [{ field: "created_at", order: "desc" }],
				page: 1,
				page_size: 20,
			}),
		)
	})

	it("renders data and structure tabs", async () => {
		renderPanel()

		await screen.findByText("Apple")
		expect(
			screen.getByRole("tab", { name: "microAppPage.databasePanel.dataTab" }),
		).toHaveAttribute("aria-selected", "true")
		expect(
			screen.getByRole("tab", { name: "microAppPage.databasePanel.structureTab" }),
		).toHaveAttribute("aria-selected", "false")
		expect(
			screen.getByRole("tab", { name: "microAppPage.databasePanel.permissionsTab" }),
		).toHaveAttribute("aria-selected", "false")
	})

	it("sorts by a clicked column", async () => {
		renderPanel()

		await screen.findByText("Apple")
		const brandHeader = screen.getByText("Brand").closest("button")
		expect(brandHeader).not.toBeNull()
		fireEvent.click(brandHeader as HTMLElement)

		await waitFor(() => {
			expect(mocks.queryRows).toHaveBeenLastCalledWith(
				"project-1",
				"table-1",
				expect.objectContaining({
					sort: [{ field: "brand", order: "asc" }],
				}),
			)
		})
	})

	it("moves to the next page", async () => {
		renderPanel()

		await screen.findByText("Apple")
		fireEvent.click(screen.getByText("microAppPage.databasePanel.next"))

		await waitFor(() => {
			expect(mocks.queryRows).toHaveBeenLastCalledWith(
				"project-1",
				"table-1",
				expect.objectContaining({ page: 2 }),
			)
		})
	})

	it("renders empty table state", async () => {
		mocks.getTables.mockResolvedValue([])
		renderPanel()

		await waitFor(() => {
			expect(screen.getAllByText("microAppPage.databasePanel.noTables").length).toBe(2)
		})
		expect(mocks.queryRows).not.toHaveBeenCalled()
	})

	it("renders table list failure and retries", async () => {
		mocks.getTables.mockRejectedValueOnce(new Error("failed"))
		renderPanel()

		expect(
			await screen.findByText("microAppPage.databasePanel.loadTablesFailed"),
		).toBeInTheDocument()

		mocks.getTables.mockResolvedValueOnce(tables)
		fireEvent.click(screen.getByText("microAppPage.databasePanel.retry"))

		await waitFor(() => {
			expect(mocks.getTables).toHaveBeenCalledTimes(2)
		})
	})
})
