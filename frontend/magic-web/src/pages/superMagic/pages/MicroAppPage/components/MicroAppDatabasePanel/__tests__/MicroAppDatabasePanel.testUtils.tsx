import { cleanup, render } from "@testing-library/react"
import { SWRConfig } from "swr"
import { vi } from "vitest"

import type { MagicBaseTable } from "@/apis/modules/magicBase"
import type { CollaboratorPermission } from "@/pages/superMagic/types/collaboration"

import MicroAppDatabasePanel from "../index"

Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
	configurable: true,
	value: () => undefined,
})

const mocks = vi.hoisted(() => ({
	getTables: vi.fn(),
	getTable: vi.fn(),
	queryRows: vi.fn(),
	getPermissions: vi.fn(),
	batchSavePermissions: vi.fn(),
	deletePermission: vi.fn(),
}))

export function getPanelMocks() {
	return mocks
}

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
	default: ({ onDirtyChange }: { onDirtyChange?: (dirty: boolean) => void }) => (
		<button
			type="button"
			data-testid="mock-permission-dirty"
			onClick={() => onDirtyChange?.(true)}
		>
			change permission
		</button>
	),
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

vi.mock("react-i18next", () => ({
	initReactI18next: { type: "3rdParty", init: () => undefined },
	useTranslation: () => ({
		t: (key: string, options?: Record<string, string | number>) => {
			if (options?.loaded != null && options?.total != null) {
				return `${key}:${options.loaded}/${options.total}`
			}
			if (options?.total != null) return `${key}:${options.total}`
			if (options?.page != null && options?.totalPages != null) {
				return `${key}:${options.page}/${options.totalPages}`
			}
			return key
		},
	}),
}))

export const tables: MagicBaseTable[] = [
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

export const tableDetail: MagicBaseTable = {
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

export function resetPanelMocks() {
	vi.clearAllMocks()
	localStorage.clear()
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
}

export function cleanupPanelTest() {
	cleanup()
	document.body.removeAttribute("data-scroll-locked")
	document.body.style.pointerEvents = ""
}

export function renderPanel(projectRole?: CollaboratorPermission) {
	return render(
		<SWRConfig
			value={{
				provider: () => new Map(),
				dedupingInterval: 0,
				shouldRetryOnError: false,
			}}
		>
			<MicroAppDatabasePanel
				active
				projectId="project-1"
				projectName="Demo App"
				projectRole={projectRole}
			/>
		</SWRConfig>,
	)
}
