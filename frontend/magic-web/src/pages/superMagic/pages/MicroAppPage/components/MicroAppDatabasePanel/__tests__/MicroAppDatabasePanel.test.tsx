import { fireEvent, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
	cleanupPanelTest,
	getPanelMocks,
	renderPanel,
	resetPanelMocks,
	tableDetail,
	tables,
} from "./MicroAppDatabasePanel.testUtils"

const mocks = getPanelMocks()

async function selectFilterOption(label: string, optionName: string, index = 0) {
	const trigger = screen.getAllByLabelText(label)[index]
	fireEvent.keyDown(trigger, { key: "ArrowDown" })
	fireEvent.click(await screen.findByRole("option", { name: optionName }))
}

describe("MicroAppDatabasePanel", () => {
	beforeEach(() => {
		resetPanelMocks()
	})

	afterEach(() => {
		cleanupPanelTest()
	})

	it("loads table list, selects the first table, and renders rows", async () => {
		renderPanel()

		await screen.findByText("Apple")
		expect(screen.getByText("Survey")).toBeInTheDocument()
		expect(screen.getByText("microAppPage.databasePanel.title")).toBeInTheDocument()
		expect(screen.getByText("microAppPage.databasePanel.description")).toBeInTheDocument()
		expect(document.body).not.toHaveTextContent("enabled")
		expect(document.body).not.toHaveTextContent("survey")
		expect(document.body).not.toHaveTextContent("brand")
		expect(document.body).not.toHaveTextContent("text")
		expect(document.body).not.toHaveTextContent("row-1")
		expect(document.body).not.toHaveTextContent("2026-07-06 18:01:42")
		expect(document.getElementById("magicbase-table-list-panel")).not.toBeInTheDocument()
		expect(mocks.getTables).toHaveBeenCalledWith("project-1")
		expect(mocks.getTable).toHaveBeenCalledWith("project-1", "table-1")
		expect(mocks.queryRows).toHaveBeenCalledWith(
			"project-1",
			"table-1",
			expect.objectContaining({
				select: "id,brand,organization_code,created_by,created_at,updated_at",
				filter: { logic: "and", items: [] },
				sort: [{ field: "created_at", order: "desc" }],
				page: 1,
				page_size: 20,
				include_total: true,
			}),
		)
	})

	it("auto-collapses a single table and allows manual expansion", async () => {
		renderPanel()

		await screen.findByText("Apple")
		expect(document.getElementById("magicbase-table-list-panel")).not.toBeInTheDocument()
		expect(screen.getByTestId("magicbase-table-header")).toHaveClass("pl-10")

		const expandButton = screen.getByRole("button", {
			name: "microAppPage.databasePanel.expandTableList",
		})
		expect(expandButton).toHaveAttribute("aria-expanded", "false")
		fireEvent.focus(expandButton)
		expect(await screen.findByRole("tooltip")).toHaveTextContent(
			"microAppPage.databasePanel.expandTableList",
		)
		fireEvent.blur(expandButton)
		fireEvent.click(expandButton)

		expect(document.getElementById("magicbase-table-list-panel")).toBeInTheDocument()
		expect(screen.queryByPlaceholderText("microAppPage.databasePanel.searchTables")).toBeNull()
		expect(screen.getByText("microAppPage.databasePanel.tableListTitle")).toBeInTheDocument()
		const collapseButton = screen.getByRole("button", {
			name: "microAppPage.databasePanel.collapseTableList",
		})
		expect(collapseButton).toHaveAttribute("aria-expanded", "true")
		expect(mocks.getTable).toHaveBeenCalledTimes(1)

		fireEvent.click(collapseButton)
		expect(document.getElementById("magicbase-table-list-panel")).not.toBeInTheDocument()
		expect(screen.getByText("Apple")).toBeInTheDocument()
	})

	it("keeps the table list open and shows search when there are many data types", async () => {
		mocks.getTables.mockResolvedValue(
			Array.from({ length: 9 }, (_, index) => ({
				...tables[0],
				id: `table-${index + 1}`,
				table_key: `survey_${index + 1}`,
				table_name: `Survey ${index + 1}`,
			})),
		)
		renderPanel()

		await screen.findByText("Apple")
		const tableList = document.getElementById("magicbase-table-list-panel")
		expect(tableList).toBeInTheDocument()
		expect(tableList).toHaveClass("w-[220px]")
		expect(
			screen.getByPlaceholderText("microAppPage.databasePanel.searchTables"),
		).toBeInTheDocument()
	})

	it("clips long table descriptions inside the table list", async () => {
		const longDescription =
			"A very long table description that must stay inside the data type panel"
		mocks.getTables.mockResolvedValue([
			{ ...tables[0], description: longDescription },
			{
				...tables[0],
				id: "table-2",
				table_key: "orders",
				table_name: "Orders",
				description: longDescription,
			},
		])
		renderPanel()

		await screen.findByText("Apple")
		const description = screen.getAllByText(longDescription)[0]
		const tableItem = description.closest("button")
		const viewport = description.closest('[data-slot="scroll-area-viewport"]')

		expect(tableItem).toHaveClass("max-w-full", "overflow-hidden")
		expect(description).toHaveClass("truncate")
		expect(description).toHaveAttribute("data-slot", "tooltip-trigger")
		expect(description).not.toHaveAttribute("title")
		expect(viewport).toHaveClass(
			"overflow-x-hidden",
			"[&>div]:!block",
			"[&>div]:!w-full",
			"[&>div]:!min-w-0",
		)
	})

	it("shows the beginner guide once and remembers dismissal", async () => {
		const firstRender = renderPanel()

		await screen.findByText("microAppPage.databasePanel.intro")
		fireEvent.click(
			screen.getByRole("button", { name: "microAppPage.databasePanel.dismissIntro" }),
		)
		expect(screen.queryByText("microAppPage.databasePanel.intro")).not.toBeInTheDocument()

		firstRender.unmount()
		renderPanel()
		await screen.findByText("Apple")
		expect(screen.queryByText("microAppPage.databasePanel.intro")).not.toBeInTheDocument()
	})

	it("opens field settings from the secondary data settings menu", async () => {
		renderPanel()

		await screen.findByText("Apple")
		expect(screen.getByTestId("magicbase-load-more-status")).toBeInTheDocument()

		fireEvent.keyDown(screen.getByTestId("magicbase-data-settings-trigger"), { key: "Enter" })
		fireEvent.click(await screen.findByText("microAppPage.databasePanel.fieldSettings"))

		expect(screen.queryByTestId("magicbase-load-more-status")).not.toBeInTheDocument()
		expect(
			screen.getByRole("button", { name: "microAppPage.databasePanel.backToData" }),
		).toBeInTheDocument()
		expect(screen.getByText("microAppPage.databasePanel.columnKey")).toBeInTheDocument()
	})

	it("shows system fields only after the user enables them", async () => {
		renderPanel()

		await screen.findByText("Apple")
		expect(document.body).not.toHaveTextContent("row-1")

		fireEvent.keyDown(screen.getByTestId("magicbase-data-settings-trigger"), { key: "Enter" })
		fireEvent.click(await screen.findByText("microAppPage.databasePanel.showSystemFields"))

		expect(await screen.findByText("row-1")).toBeInTheDocument()
		expect(screen.getByText("2026-07-06 18:01:42")).toBeInTheDocument()
	})

	it("hides access permission settings from non-managers", async () => {
		renderPanel("editor")

		await screen.findByText("Apple")
		fireEvent.keyDown(screen.getByTestId("magicbase-data-settings-trigger"), { key: "Enter" })

		expect(
			await screen.findByText("microAppPage.databasePanel.fieldSettings"),
		).toBeInTheDocument()
		expect(
			screen.queryByText("microAppPage.databasePanel.accessPermissions"),
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

	it("filters rows with typed operators and any-match conditions", async () => {
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
		renderPanel()

		const selectedCell = await screen.findByText("Apple")
		fireEvent.mouseDown(selectedCell.closest("td") as HTMLElement, { button: 0 })
		fireEvent.mouseUp(selectedCell.closest("td") as HTMLElement)
		expect(await screen.findByTestId("magicbase-selection-actions")).toBeInTheDocument()

		fireEvent.click(screen.getByTestId("magicbase-filter-trigger"))
		const matchModeTrigger = screen.getByLabelText("microAppPage.databasePanel.filterMatchMode")
		expect(matchModeTrigger).toHaveAttribute("data-slot", "select-trigger")
		await selectFilterOption(
			"microAppPage.databasePanel.filterMatchMode",
			"microAppPage.databasePanel.filterMatchAny",
		)
		const valueInputs = screen.getAllByLabelText("microAppPage.databasePanel.filterValue")
		fireEvent.change(valueInputs[0], { target: { value: "Apple" } })
		fireEvent.click(screen.getByText("microAppPage.databasePanel.addFilterCondition"))
		const fieldInputs = screen.getAllByLabelText("microAppPage.databasePanel.filterField")
		expect(fieldInputs[0]).toHaveAttribute("data-slot", "select-trigger")
		await selectFilterOption("microAppPage.databasePanel.filterField", "Price", 1)
		const operatorInputs = screen.getAllByLabelText("microAppPage.databasePanel.filterOperator")
		expect(operatorInputs[0]).toHaveAttribute("data-slot", "select-trigger")
		await selectFilterOption(
			"microAppPage.databasePanel.filterOperator",
			"microAppPage.databasePanel.filterOperatorGte",
			1,
		)
		const nextValueInputs = screen.getAllByLabelText("microAppPage.databasePanel.filterValue")
		fireEvent.change(nextValueInputs[1], { target: { value: "5999" } })
		fireEvent.click(screen.getByText("microAppPage.databasePanel.applyFilters"))

		await waitFor(() => {
			expect(mocks.queryRows).toHaveBeenLastCalledWith(
				"project-1",
				"table-1",
				expect.objectContaining({
					filter: {
						logic: "or",
						items: [
							{ field: "brand", operator: "contains", value: "Apple" },
							{ field: "price", operator: "gte", value: 5999 },
						],
					},
					page: 1,
					include_total: false,
				}),
			)
		})
		expect(screen.getByText("microAppPage.databasePanel.loadedRows:1")).toBeInTheDocument()
		expect(screen.getByTestId("magicbase-filter-trigger")).toHaveTextContent(
			"microAppPage.databasePanel.filterCount:2",
		)
		expect(screen.queryByTestId("magicbase-selection-actions")).not.toBeInTheDocument()
		expect(
			screen.getByText("microAppPage.databasePanel.filterMatchAnySummary"),
		).toBeInTheDocument()

		fireEvent.click(
			screen.getAllByLabelText("microAppPage.databasePanel.removeFilterCondition")[0],
		)
		await waitFor(() => {
			expect(mocks.queryRows).toHaveBeenLastCalledWith(
				"project-1",
				"table-1",
				expect.objectContaining({
					filter: {
						logic: "or",
						items: [{ field: "price", operator: "gte", value: 5999 }],
					},
				}),
			)
		})

		fireEvent.click(screen.getByLabelText("microAppPage.databasePanel.removeFilterCondition"))

		await waitFor(() => {
			expect(mocks.queryRows).toHaveBeenLastCalledWith(
				"project-1",
				"table-1",
				expect.objectContaining({
					filter: { logic: "and", items: [] },
					page: 1,
				}),
			)
		})
	})

	it("loads the next page when scrolling near the bottom", async () => {
		mocks.queryRows.mockImplementation(
			(_projectId: string, _tableId: string, request: { page: number }) =>
				Promise.resolve({
					page: request.page,
					page_size: 20,
					total: 35,
					has_more: request.page === 1,
					list:
						request.page === 1
							? [{ id: "row-1", brand: "Apple" }]
							: [{ id: "row-2", brand: "Samsung" }],
				}),
		)
		renderPanel()

		await screen.findByText("Apple")
		expect(screen.queryByText("microAppPage.databasePanel.next")).not.toBeInTheDocument()
		const grid = screen.getByTestId("magicbase-data-grid")
		Object.defineProperties(grid, {
			scrollTop: { configurable: true, value: 700 },
			clientHeight: { configurable: true, value: 300 },
			scrollHeight: { configurable: true, value: 1100 },
		})
		fireEvent.scroll(grid)

		await waitFor(() => {
			expect(mocks.queryRows).toHaveBeenLastCalledWith(
				"project-1",
				"table-1",
				expect.objectContaining({ page: 2 }),
			)
		})
		expect(mocks.queryRows).toHaveBeenLastCalledWith(
			"project-1",
			"table-1",
			expect.objectContaining({ page: 2, include_total: false }),
		)
		expect(await screen.findByText("Samsung")).toBeInTheDocument()
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
