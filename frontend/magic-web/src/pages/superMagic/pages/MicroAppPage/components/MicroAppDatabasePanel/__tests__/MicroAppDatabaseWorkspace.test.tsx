import { fireEvent, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import * as layout from "../../../layoutConstants"
import {
	cleanupPanelTest,
	getPanelMocks,
	renderPanel,
	resetPanelMocks,
	tableDetail,
	tables,
} from "./MicroAppDatabasePanel.testUtils"

const mocks = getPanelMocks()

describe("MicroAppDatabasePanel workspace", () => {
	beforeEach(() => {
		resetPanelMocks()
	})

	afterEach(() => {
		cleanupPanelTest()
	})

	it("exposes database actions directly in the toolbar", async () => {
		renderPanel()

		await screen.findByText("Apple")
		expect(screen.queryByTestId("magicbase-data-settings-trigger")).not.toBeInTheDocument()
		expect(
			screen.getByRole("switch", {
				name: "microAppPage.databasePanel.showSystemFields",
			}),
		).toBeInTheDocument()
		expect(
			screen.getByRole("button", { name: "microAppPage.databasePanel.fieldSettings" }),
		).toBeInTheDocument()
		expect(
			screen.getByRole("button", {
				name: "microAppPage.databasePanel.accessPermissions",
			}),
		).toBeInTheDocument()
		expect(
			screen.getByRole("button", { name: "microAppPage.databasePanel.refresh" }),
		).toBeInTheDocument()
	})

	it("hides static permission entries and skips static permission requests", async () => {
		renderPanel()

		const cell = await screen.findByText("Apple")
		expect(mocks.getPermissions).not.toHaveBeenCalled()

		fireEvent.contextMenu(cell.closest("td") as HTMLElement)
		expect(
			screen.queryByText("microAppPage.databasePanel.contextMenu.rowPermission"),
		).not.toBeInTheDocument()
		expect(
			screen.queryByText("microAppPage.databasePanel.contextMenu.columnPermission"),
		).not.toBeInTheDocument()

		fireEvent.click(
			screen.getByRole("button", { name: "microAppPage.databasePanel.expandTableList" }),
		)
		const tableButton = screen
			.getAllByText("Survey")
			.map((element) => element.closest("button"))
			.find(Boolean)
		fireEvent.contextMenu(tableButton as HTMLElement)
		expect(
			screen.queryByText("microAppPage.databasePanel.contextMenu.tablePermission"),
		).not.toBeInTheDocument()
	})

	it("opens field settings in a right side panel without replacing the data grid", async () => {
		renderPanel()

		await screen.findByText("Apple")
		expect(screen.getByTestId("magicbase-load-more-status")).toBeInTheDocument()

		fireEvent.click(
			screen.getByRole("button", { name: "microAppPage.databasePanel.fieldSettings" }),
		)

		expect(screen.getByTestId("magicbase-load-more-status")).toBeInTheDocument()
		expect(screen.getByTestId("magicbase-settings-side-panel")).toBeInTheDocument()
		expect(screen.getByTestId("magicbase-settings-side-panel")).toHaveStyle({ width: "420px" })
		expect(screen.getByTestId("handle-mouse-down")).toBeInTheDocument()
		expect(screen.getByText("microAppPage.databasePanel.columnKey")).toBeInTheDocument()

		fireEvent.click(screen.getByRole("button", { name: "common.close" }))
		expect(screen.queryByTestId("magicbase-settings-side-panel")).not.toBeInTheDocument()
		expect(screen.getByText("Apple")).toBeInTheDocument()
	})

	it("resizes the settings side panel and persists its width", async () => {
		renderPanel()

		await screen.findByText("Apple")
		fireEvent.click(
			screen.getByRole("button", { name: "microAppPage.databasePanel.fieldSettings" }),
		)

		const resizeHandle = screen.getByTestId("handle-mouse-down")
		fireEvent(resizeHandle, new MouseEvent("pointerdown", { bubbles: true, clientX: 800 }))
		fireEvent(document, new MouseEvent("pointermove", { bubbles: true, clientX: 700 }))
		fireEvent(document, new MouseEvent("pointerup", { bubbles: true, clientX: 700 }))

		await waitFor(() => {
			expect(screen.getByTestId("magicbase-settings-side-panel")).toHaveStyle({
				width: "520px",
			})
		})
		expect(localStorage.getItem(layout.MICRO_APP_DATABASE_STRUCTURE_PANEL_STORAGE_KEY)).toBe(
			"520",
		)
	})

	it("opens access permissions in the same right side panel", async () => {
		renderPanel()

		await screen.findByText("Apple")
		fireEvent.click(
			screen.getByRole("button", {
				name: "microAppPage.databasePanel.accessPermissions",
			}),
		)

		expect(screen.getByTestId("magicbase-settings-side-panel")).toHaveTextContent(
			"microAppPage.databasePanel.accessPermissions",
		)
		expect(screen.getByTestId("magicbase-settings-side-panel")).toHaveStyle({ width: "620px" })
		expect(screen.getByText("Apple")).toBeInTheDocument()

		fireEvent.click(screen.getByRole("button", { name: "common.close" }))
		expect(screen.queryByTestId("confirm-dialog")).not.toBeInTheDocument()
		expect(screen.queryByTestId("magicbase-settings-side-panel")).not.toBeInTheDocument()
	})

	it("requires confirmation before closing permissions with unsaved changes", async () => {
		renderPanel()

		await screen.findByText("Apple")
		fireEvent.click(
			screen.getByRole("button", {
				name: "microAppPage.databasePanel.accessPermissions",
			}),
		)
		fireEvent.click(screen.getByTestId("mock-permission-dirty"))
		fireEvent.click(screen.getByRole("button", { name: "common.close" }))

		expect(screen.getByTestId("confirm-dialog-title")).toHaveTextContent(
			"microAppPage.databasePanel.dynamicUnsavedTitle",
		)
		expect(screen.getByTestId("magicbase-settings-side-panel")).toBeInTheDocument()

		fireEvent.click(screen.getByTestId("confirm-dialog-cancel"))
		expect(screen.getByTestId("magicbase-settings-side-panel")).toBeInTheDocument()

		fireEvent.click(screen.getByRole("button", { name: "common.close" }))
		fireEvent.click(screen.getByTestId("confirm-dialog-confirm"))

		await waitFor(() => {
			expect(screen.queryByTestId("magicbase-settings-side-panel")).not.toBeInTheDocument()
		})
	})

	it("requires confirmation before switching tables with unsaved permissions", async () => {
		const ordersTable = {
			...tables[0],
			id: "table-2",
			table_key: "orders",
			table_name: "Orders",
		}
		mocks.getTables.mockResolvedValue([tables[0], ordersTable])
		mocks.getTable.mockImplementation((_projectId: string, tableId: string) =>
			Promise.resolve(
				tableId === ordersTable.id
					? { ...tableDetail, ...ordersTable, columns: tableDetail.columns }
					: tableDetail,
			),
		)
		renderPanel()

		await screen.findByText("Apple")
		fireEvent.click(
			screen.getByRole("button", {
				name: "microAppPage.databasePanel.accessPermissions",
			}),
		)
		fireEvent.click(screen.getByTestId("mock-permission-dirty"))
		fireEvent.click(screen.getByText("Orders").closest("button") as HTMLElement)

		expect(screen.getByTestId("confirm-dialog-title")).toHaveTextContent(
			"microAppPage.databasePanel.dynamicUnsavedTitle",
		)
		expect(mocks.getTable).not.toHaveBeenCalledWith("project-1", "table-2")

		fireEvent.click(screen.getByTestId("confirm-dialog-confirm"))
		await waitFor(() => {
			expect(mocks.getTable).toHaveBeenCalledWith("project-1", "table-2")
		})
	})

	it("requires confirmation before creating a row with unsaved permissions", async () => {
		renderPanel()

		await screen.findByText("Apple")
		fireEvent.click(
			screen.getByRole("button", {
				name: "microAppPage.databasePanel.accessPermissions",
			}),
		)
		fireEvent.click(screen.getByTestId("mock-permission-dirty"))
		fireEvent.click(screen.getByText("microAppPage.databasePanel.rowCreate"))

		expect(screen.getByTestId("confirm-dialog-title")).toHaveTextContent(
			"microAppPage.databasePanel.dynamicUnsavedTitle",
		)
		expect(screen.getByTestId("magicbase-settings-side-panel")).toBeInTheDocument()
	})

	it("shows system fields only after the user enables them", async () => {
		renderPanel()

		await screen.findByText("Apple")
		expect(document.body).not.toHaveTextContent("row-1")

		const systemFieldsSwitch = screen.getByRole("switch", {
			name: "microAppPage.databasePanel.showSystemFields",
		})
		const filterButton = screen.getByTestId("magicbase-filter-trigger")
		expect(systemFieldsSwitch).toHaveAttribute("data-state", "unchecked")
		expect(systemFieldsSwitch.closest("label")?.compareDocumentPosition(filterButton)).toBe(
			Node.DOCUMENT_POSITION_FOLLOWING,
		)
		fireEvent.click(systemFieldsSwitch)

		expect(await screen.findByText("row-1")).toBeInTheDocument()
		expect(screen.getByText("2026-07-06 18:01:42")).toBeInTheDocument()
		expect(systemFieldsSwitch).toHaveAttribute("data-state", "checked")
	})

	it("hides access permission settings from non-managers", async () => {
		renderPanel("editor")

		await screen.findByText("Apple")
		expect(
			screen.getByRole("button", { name: "microAppPage.databasePanel.fieldSettings" }),
		).toBeInTheDocument()
		expect(
			screen.queryByRole("button", {
				name: "microAppPage.databasePanel.accessPermissions",
			}),
		).not.toBeInTheDocument()
	})

	it("shows edit and delete actions only after selecting data", async () => {
		renderPanel()

		const cell = await screen.findByText("Apple")
		expect(screen.queryByTestId("magicbase-selection-actions")).not.toBeInTheDocument()

		fireEvent.mouseDown(cell.closest("td") as HTMLElement, { button: 0 })
		fireEvent.mouseUp(cell.closest("td") as HTMLElement)

		expect(await screen.findByTestId("magicbase-selection-actions")).toBeInTheDocument()
		expect(
			screen.getByText("microAppPage.databasePanel.contextMenu.clearSelection"),
		).toBeInTheDocument()
		expect(screen.getByText("microAppPage.databasePanel.rowEdit")).toBeInTheDocument()
		expect(screen.getByText("microAppPage.databasePanel.rowDelete")).toBeInTheDocument()
	})

	it("selects complete rows instead of a partial cell range", async () => {
		mocks.getTable.mockResolvedValue({
			...tableDetail,
			columns: [
				...tableDetail.columns,
				{
					id: "column-3",
					table_id: "table-1",
					column_key: "price",
					column_name: "Price",
					data_type: "number",
					is_required: false,
					status: "enabled",
				},
			],
		})
		mocks.queryRows.mockResolvedValue({
			page: 1,
			page_size: 20,
			total: 2,
			list: [
				{ id: "row-1", brand: "Apple", price: 3999 },
				{ id: "row-2", brand: "Orange", price: 2999 },
			],
		})
		renderPanel()

		const startCell = (await screen.findByText("Apple")).closest("td") as HTMLElement
		const endCell = screen.getByText("2999").closest("td") as HTMLElement
		fireEvent.mouseDown(startCell, { button: 0 })
		fireEvent.mouseEnter(endCell)
		fireEvent.mouseUp(endCell)

		const selectedRows = [startCell.closest("tr"), endCell.closest("tr")]
		selectedRows.forEach((row) => {
			const cells = Array.from(row?.querySelectorAll("td") || [])
			expect(cells.length).toBeGreaterThan(1)
			cells.forEach((cell) => expect(cell).toHaveClass("bg-primary/10"))
		})
		expect(screen.getByTestId("magicbase-selection-actions")).toHaveTextContent(
			"microAppPage.databasePanel.selectedRows:2",
		)
	})

	it("selects a continuous row range with Shift click", async () => {
		mocks.queryRows.mockResolvedValue({
			page: 1,
			page_size: 20,
			total: 4,
			list: [
				{ id: "row-1", brand: "Apple" },
				{ id: "row-2", brand: "Orange" },
				{ id: "row-3", brand: "Banana" },
				{ id: "row-4", brand: "Pear" },
			],
		})
		renderPanel()

		const appleCell = (await screen.findByText("Apple")).closest("td") as HTMLElement
		const bananaCell = screen.getByText("Banana").closest("td") as HTMLElement
		fireEvent.mouseDown(appleCell, { button: 0 })
		fireEvent.mouseUp(appleCell)
		fireEvent.mouseDown(bananaCell, { button: 0, shiftKey: true })
		fireEvent.mouseUp(bananaCell)

		for (const value of ["Apple", "Orange", "Banana"]) {
			expect(screen.getByText(value).closest("td")).toHaveClass("bg-primary/10")
		}
		expect(screen.getByText("Pear").closest("td")).not.toHaveClass("bg-primary/10")
		expect(screen.getByTestId("magicbase-selection-actions")).toHaveTextContent(
			"microAppPage.databasePanel.selectedRows:3",
		)
	})

	it("toggles non-contiguous rows with Command or Ctrl click", async () => {
		mocks.queryRows.mockResolvedValue({
			page: 1,
			page_size: 20,
			total: 3,
			list: [
				{ id: "row-1", brand: "Apple" },
				{ id: "row-2", brand: "Orange" },
				{ id: "row-3", brand: "Banana" },
			],
		})
		renderPanel()

		const appleCell = (await screen.findByText("Apple")).closest("td") as HTMLElement
		const orangeCell = screen.getByText("Orange").closest("td") as HTMLElement
		const bananaCell = screen.getByText("Banana").closest("td") as HTMLElement
		fireEvent.mouseDown(appleCell, { button: 0 })
		fireEvent.mouseUp(appleCell)
		fireEvent.mouseDown(bananaCell, { button: 0, metaKey: true })
		fireEvent.mouseUp(bananaCell)

		expect(appleCell).toHaveClass("bg-primary/10")
		expect(orangeCell).not.toHaveClass("bg-primary/10")
		expect(bananaCell).toHaveClass("bg-primary/10")
		expect(screen.getByTestId("magicbase-selection-actions")).toHaveTextContent(
			"microAppPage.databasePanel.selectedRows:2",
		)

		fireEvent.mouseDown(appleCell, { button: 0, ctrlKey: true })
		fireEvent.mouseUp(appleCell)
		expect(appleCell).not.toHaveClass("bg-primary/10")
		expect(bananaCell).toHaveClass("bg-primary/10")
		expect(screen.getByTestId("magicbase-selection-actions")).toHaveTextContent(
			"microAppPage.databasePanel.selectedRows:1",
		)

		fireEvent.mouseDown(orangeCell, { button: 0, ctrlKey: true, shiftKey: true })
		fireEvent.mouseUp(orangeCell)
		expect(appleCell).toHaveClass("bg-primary/10")
		expect(orangeCell).toHaveClass("bg-primary/10")
		expect(bananaCell).toHaveClass("bg-primary/10")
		expect(screen.getByTestId("magicbase-selection-actions")).toHaveTextContent(
			"microAppPage.databasePanel.selectedRows:3",
		)

		fireEvent.contextMenu(bananaCell)
		expect(screen.getByRole("menu")).toBeInTheDocument()
	})

	it("opens the row menu for a macOS Ctrl context-menu event", async () => {
		renderPanel()

		const appleCell = (await screen.findByText("Apple")).closest("td") as HTMLElement
		fireEvent.contextMenu(appleCell, { ctrlKey: true })

		expect(screen.getByRole("menu")).toBeInTheDocument()
		expect(appleCell).toHaveClass("bg-primary/10")
	})

	it("clears the selection when clicking the empty area outside grid cells", async () => {
		renderPanel()

		const cell = await screen.findByText("Apple")
		fireEvent.mouseDown(cell.closest("td") as HTMLElement, { button: 0 })
		fireEvent.mouseUp(cell.closest("td") as HTMLElement)
		expect(await screen.findByTestId("magicbase-selection-actions")).toBeInTheDocument()

		fireEvent.mouseDown(screen.getByTestId("magicbase-data-grid"), { button: 0 })

		expect(screen.queryByTestId("magicbase-selection-actions")).not.toBeInTheDocument()
	})

	it("clears the selection from non-interactive areas in the table toolbar", async () => {
		renderPanel()

		const cell = await screen.findByText("Apple")
		const cellElement = cell.closest("td") as HTMLElement
		fireEvent.mouseDown(cellElement, { button: 0 })
		fireEvent.mouseUp(cellElement)
		expect(await screen.findByTestId("magicbase-selection-actions")).toBeInTheDocument()

		const createButton = screen
			.getByText("microAppPage.databasePanel.rowCreate")
			.closest("button") as HTMLElement
		fireEvent.mouseDown(createButton, { button: 0 })
		expect(screen.getByTestId("magicbase-selection-actions")).toBeInTheDocument()

		fireEvent.mouseDown(screen.getByTestId("magicbase-table-header"), { button: 0 })

		await waitFor(() => {
			expect(screen.queryByTestId("magicbase-selection-actions")).not.toBeInTheDocument()
			expect(cellElement).not.toHaveClass("bg-primary/10")
		})
	})

	it("clears the selection from the toolbar action and outer panel area", async () => {
		renderPanel()

		const cell = await screen.findByText("Apple")
		const cellElement = cell.closest("td") as HTMLElement
		fireEvent.mouseDown(cellElement, { button: 0 })
		fireEvent.mouseUp(cellElement)
		fireEvent.click(screen.getByText("microAppPage.databasePanel.contextMenu.clearSelection"))
		expect(screen.queryByTestId("magicbase-selection-actions")).not.toBeInTheDocument()

		fireEvent.mouseDown(cellElement, { button: 0 })
		fireEvent.mouseUp(cellElement)
		expect(await screen.findByTestId("magicbase-selection-actions")).toBeInTheDocument()

		fireEvent.mouseDown(screen.getByTestId("micro-app-database-panel"), { button: 0 })

		await waitFor(() => {
			expect(screen.queryByTestId("magicbase-selection-actions")).not.toBeInTheDocument()
			expect(cellElement).not.toHaveClass("bg-primary/10")
		})
	})

	it("uses an opaque background for the sticky table header", async () => {
		renderPanel()

		await screen.findByText("Apple")
		const headerCell = screen.getByText("Brand").closest("th")

		expect(headerCell).toHaveClass("bg-muted")
		expect(headerCell).not.toHaveClass("bg-muted/50")
	})
})
