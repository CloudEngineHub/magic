import { forwardRef, useImperativeHandle } from "react"
import type { MouseEvent, ReactNode } from "react"
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import MentionPanel from "../index"
import { defaultMentionPanelCatalogBehavior } from "../catalogBehavior"
import { MentionItemType, PanelState } from "../types"
import type { MentionItem, MentionPanelCatalogBehavior } from "../types"

const { mockPrepareMentionItemForPending } = vi.hoisted(() => ({
	mockPrepareMentionItemForPending: vi.fn(),
}))

const mockSelectItem = vi.fn()
const mockConfirmSelection = vi.fn()
const mockReset = vi.fn()
interface UseMentionPanelMockProps {
	onKeyboardConfirm?: () => boolean | void
	onKeyboardMetaEnter?: () => boolean | void
	onKeyboardNavigateBack?: () => void
	onKeyboardEnterFolder?: () => boolean | void
}

let latestUseMentionPanelProps: UseMentionPanelMockProps | undefined

const mockState = {
	currentState: PanelState.DEFAULT,
	items: [] as MentionItem[],
	selectedIndex: -1,
	searchQuery: "",
	navigationStack: [] as Array<{
		id: string
		name: string
		state: PanelState
		catalogId?: string
	}>,
}

// Mock all dependencies to prevent complex interactions
vi.mock("../hooks/useMentionPanel", () => ({
	useMentionPanel: (props: UseMentionPanelMockProps) => {
		latestUseMentionPanelProps = props
		return {
			state: mockState,
			actions: {
				selectItem: mockSelectItem,
				confirmSelection: mockConfirmSelection,
				search: vi.fn(),
				navigateBack: vi.fn(),
				navigateToBreadcrumb: vi.fn(),
				enterFolder: vi.fn(),
				exit: vi.fn(),
				reset: mockReset,
				deleteHistoryItem: vi.fn(),
			},
			computed: {
				canNavigateBack: false,
				canEnterFolder: false,
				hasSelection: false,
			},
			dataSource: {
				loading: false,
				error: undefined,
				refreshData: vi.fn(),
			},
			focus: {
				shouldFocusSearch: false,
				clearFocusTrigger: vi.fn(),
			},
		}
	},
}))

vi.mock("../runtime/default-runtime", () => ({
	resolveMentionPanelRuntime: (props: {
		dataService?: unknown
		catalogBehavior?: unknown
		buildStoreRequest?: unknown
	}) => ({
		dataService: props.dataService,
		catalogBehavior: props.catalogBehavior ?? {},
		buildStoreRequest: props.buildStoreRequest,
		getItemRenderer: vi.fn(() => ({})),
		getCatalogHeaderMeta: vi.fn(() => ({
			hint: null,
			icon: null,
		})),
	}),
}))

vi.mock("react-virtuoso", () => ({
	Virtuoso: forwardRef<
		{ scrollToIndex: ReturnType<typeof vi.fn> },
		{
			totalCount: number
			itemContent: (index: number) => ReactNode
		}
	>(({ totalCount, itemContent }, ref) => {
		useImperativeHandle(ref, () => ({
			scrollToIndex: vi.fn(),
		}))

		return (
			<div data-testid="virtuoso-list">
				{Array.from({ length: totalCount }, (_, index) => itemContent(index))}
			</div>
		)
	}),
}))

vi.mock("../hooks/useI18n", () => ({
	useI18nStatic: () => ({
		loading: "Loading...",
		empty: "No results found",
		retry: "Retry",
		searchPlaceholder: "Search",
		searchResults: "Search Results",
		multiSelectActions: {
			enter: "多选",
			complete: "完成",
		},
		ariaLabels: {
			panel: "Mention panel",
			retryButton: "Retry loading",
			menuItem: "Menu item",
		},
		keyboardHints: {
			navigate: "Navigate",
			confirm: "Confirm",
			goBack: "Go back",
			goForward: "Go forward",
		},
	}),
}))

vi.mock("../../../hooks/useIsMobile", () => ({
	useIsMobile: () => false,
}))

vi.mock("@/styles/fonts/geist", () => ({
	default: () => undefined,
}))

vi.mock("../utils/multiSelectValidation", () => ({
	prepareMentionItemForPending: mockPrepareMentionItemForPending,
}))

vi.mock("../components/MenuItem", () => ({
	default: ({
		item,
		onClick,
		showCheckbox,
		checkboxChecked,
	}: {
		item: MentionItem
		onClick?: (event?: MouseEvent) => void
		showCheckbox?: boolean
		checkboxChecked?: boolean
	}) => (
		<div data-testid="menu-item" onClick={onClick}>
			<span>{item.name}</span>
			{showCheckbox ? (
				<span
					data-testid="menu-item-checkbox"
					data-checked={checkboxChecked ? "true" : "false"}
				/>
			) : null}
			<button data-testid="menu-item-arrow" data-right-arrow>
				<span data-testid="menu-item-arrow-icon">Arrow</span>
			</button>
		</div>
	),
}))

describe("MentionPanel", () => {
	const setCatalogState = (items: MentionItem[], selectedIndex = 0) => {
		mockState.currentState = PanelState.CATALOG
		mockState.navigationStack = [
			{ id: "project-files", name: "Project", state: PanelState.DEFAULT },
		]
		mockState.items = items
		mockState.selectedIndex = selectedIndex
	}

	const enterMultiSelectMode = () => {
		act(() => {
			latestUseMentionPanelProps?.onKeyboardMetaEnter?.()
		})
	}

	beforeEach(() => {
		mockState.currentState = PanelState.DEFAULT
		mockState.items = []
		mockState.selectedIndex = -1
		mockState.searchQuery = ""
		mockState.navigationStack = []
		mockSelectItem.mockReset()
		mockConfirmSelection.mockReset()
		mockReset.mockReset()
		mockPrepareMentionItemForPending.mockReset()
		mockPrepareMentionItemForPending.mockResolvedValue({
			canSelect: true,
			mcpValidated: false,
		})
		latestUseMentionPanelProps = undefined
	})

	it("should not render when not visible", () => {
		const { container } = render(
			<MentionPanel visible={false} catalogBehavior={defaultMentionPanelCatalogBehavior} />,
		)
		expect(container.firstChild).toBeNull()
	})

	it("should render when visible", () => {
		const { container } = render(
			<MentionPanel visible={true} catalogBehavior={defaultMentionPanelCatalogBehavior} />,
		)
		expect(container.firstChild).toBeTruthy()
	})

	it("should render with default props", () => {
		const { container } = render(
			<MentionPanel catalogBehavior={defaultMentionPanelCatalogBehavior} />,
		)
		expect(container.firstChild).toBeTruthy()
	})

	it("should enter folder when clicking right arrow icon", () => {
		vi.useFakeTimers()
		mockState.items = [
			{
				id: "folder-1",
				name: "Folder 1",
				type: MentionItemType.FOLDER,
			},
		]

		render(<MentionPanel visible={true} catalogBehavior={defaultMentionPanelCatalogBehavior} />)

		fireEvent.click(screen.getByTestId("menu-item-arrow-icon"))
		vi.runAllTimers()

		expect(mockSelectItem).toHaveBeenCalledWith(0)
		expect(mockConfirmSelection).toHaveBeenCalledWith({ enterFolder: true })
		vi.useRealTimers()
	})

	it("should show multi-select hint before entering mode and checkboxes after entering", () => {
		setCatalogState([
			{
				id: "file-1",
				name: "File 1",
				type: MentionItemType.PROJECT_FILE,
			},
		])

		render(<MentionPanel visible={true} catalogBehavior={defaultMentionPanelCatalogBehavior} />)

		expect(screen.getByText("多选")).toBeInTheDocument()
		expect(screen.queryByTestId("menu-item-checkbox")).not.toBeInTheDocument()

		enterMultiSelectMode()

		expect(screen.getByText("完成")).toBeInTheDocument()
		expect(screen.getByLabelText("完成 Ctrl Enter")).toHaveClass("text-primary")
		expect(screen.getByText("Confirm")).toBeInTheDocument()
		expect(screen.getByTestId("menu-item-checkbox")).toHaveAttribute("data-checked", "false")
	})

	it("should enter multi-select mode with keyboard meta enter", () => {
		setCatalogState([
			{
				id: "file-1",
				name: "File 1",
				type: MentionItemType.PROJECT_FILE,
			},
		])

		render(<MentionPanel visible={true} catalogBehavior={defaultMentionPanelCatalogBehavior} />)

		enterMultiSelectMode()

		expect(screen.getByText("完成")).toBeInTheDocument()
		expect(screen.getByTestId("menu-item-checkbox")).toHaveAttribute("data-checked", "false")
	})

	it("should not show or enter multi-select mode when current list has no selectable items", () => {
		setCatalogState([
			{
				id: "disabled-file",
				name: "Disabled File",
				type: MentionItemType.PROJECT_FILE,
				unSelectable: true,
			},
		])

		render(<MentionPanel visible={true} catalogBehavior={defaultMentionPanelCatalogBehavior} />)

		expect(screen.queryByText("多选")).not.toBeInTheDocument()

		act(() => {
			expect(latestUseMentionPanelProps?.onKeyboardMetaEnter?.()).toBe(false)
		})

		expect(screen.queryByText("完成")).not.toBeInTheDocument()
		expect(screen.queryByTestId("menu-item-checkbox")).not.toBeInTheDocument()
	})

	it("should toggle highlighted item with Enter while in multi-select mode", async () => {
		setCatalogState([
			{
				id: "file-1",
				name: "File 1",
				type: MentionItemType.PROJECT_FILE,
			},
		])

		render(<MentionPanel visible={true} catalogBehavior={defaultMentionPanelCatalogBehavior} />)

		enterMultiSelectMode()
		act(() => {
			expect(latestUseMentionPanelProps?.onKeyboardConfirm?.()).toBe(true)
		})

		await waitFor(() => {
			expect(screen.getByTestId("menu-item-checkbox")).toHaveAttribute("data-checked", "true")
		})
		expect(mockConfirmSelection).not.toHaveBeenCalled()
	})

	it("should toggle a drillable directory with Enter while in multi-select mode", async () => {
		setCatalogState([
			{
				id: "folder-1",
				name: "Folder 1",
				type: MentionItemType.FOLDER,
				hasChildren: true,
				isFolder: true,
			},
		])

		render(<MentionPanel visible={true} catalogBehavior={defaultMentionPanelCatalogBehavior} />)

		enterMultiSelectMode()
		act(() => {
			expect(latestUseMentionPanelProps?.onKeyboardConfirm?.()).toBe(true)
		})

		await waitFor(() => {
			expect(screen.getByTestId("menu-item-checkbox")).toHaveAttribute("data-checked", "true")
		})
		expect(mockConfirmSelection).not.toHaveBeenCalled()
	})

	it("should toggle a drillable directory when clicking its row in multi-select mode", async () => {
		setCatalogState([
			{
				id: "folder-1",
				name: "Folder 1",
				type: MentionItemType.FOLDER,
				hasChildren: true,
				isFolder: true,
			},
		])

		render(<MentionPanel visible={true} catalogBehavior={defaultMentionPanelCatalogBehavior} />)

		enterMultiSelectMode()
		fireEvent.click(screen.getByTestId("menu-item"))

		await waitFor(() => {
			expect(screen.getByTestId("menu-item-checkbox")).toHaveAttribute("data-checked", "true")
		})
		expect(mockConfirmSelection).not.toHaveBeenCalled()
	})

	it("should allow custom multi-select predicate while keeping folders navigable", async () => {
		vi.useFakeTimers()
		try {
			setCatalogState([
				{
					id: "folder-1",
					name: "Folder 1",
					type: MentionItemType.FOLDER,
					hasChildren: true,
					isFolder: true,
				},
				{
					id: "file-1",
					name: "File 1",
					type: MentionItemType.PROJECT_FILE,
				},
			])
			const canvasLikeCatalogBehavior: MentionPanelCatalogBehavior = {
				shouldEnterFolderDirectly: ({ selectedItem, enterFolder }) =>
					!enterFolder && selectedItem.type === MentionItemType.FOLDER,
				getDynamicTransition: ({ selectedItem, enterFolder }) =>
					selectedItem.type === MentionItemType.FOLDER &&
					selectedItem.isFolder &&
					enterFolder
						? { state: PanelState.FOLDER }
						: null,
			}

			render(
				<MentionPanel
					visible={true}
					catalogBehavior={canvasLikeCatalogBehavior}
					canToggleMultiSelectItem={(item) => item.type === MentionItemType.PROJECT_FILE}
				/>,
			)

			enterMultiSelectMode()

			const items = screen.getAllByTestId("menu-item")
			expect(within(items[0]).queryByTestId("menu-item-checkbox")).not.toBeInTheDocument()
			expect(within(items[1]).getByTestId("menu-item-checkbox")).toHaveAttribute(
				"data-checked",
				"false",
			)

			fireEvent.click(items[0])
			vi.runAllTimers()
			expect(mockConfirmSelection).toHaveBeenCalledWith({ enterFolder: false })
			vi.useRealTimers()

			fireEvent.click(items[1])
			await waitFor(() => {
				expect(within(items[1]).getByTestId("menu-item-checkbox")).toHaveAttribute(
					"data-checked",
					"true",
				)
			})
		} finally {
			vi.useRealTimers()
		}
	})

	it("should toggle highlighted item with ArrowRight while in multi-select mode", async () => {
		setCatalogState([
			{
				id: "file-1",
				name: "File 1",
				type: MentionItemType.PROJECT_FILE,
			},
		])

		render(<MentionPanel visible={true} catalogBehavior={defaultMentionPanelCatalogBehavior} />)

		enterMultiSelectMode()
		act(() => {
			expect(latestUseMentionPanelProps?.onKeyboardEnterFolder?.()).toBe(true)
		})

		await waitFor(() => {
			expect(screen.getByTestId("menu-item-checkbox")).toHaveAttribute("data-checked", "true")
		})
		expect(mockConfirmSelection).not.toHaveBeenCalled()
	})

	it("should drill down and clear pending items with ArrowRight on a drillable item", async () => {
		setCatalogState([
			{
				id: "file-1",
				name: "File 1",
				type: MentionItemType.PROJECT_FILE,
			},
			{
				id: "folder-1",
				name: "Folder 1",
				type: MentionItemType.FOLDER,
				hasChildren: true,
				isFolder: true,
			},
		])

		const { rerender } = render(
			<MentionPanel visible={true} catalogBehavior={defaultMentionPanelCatalogBehavior} />,
		)

		enterMultiSelectMode()
		act(() => {
			expect(latestUseMentionPanelProps?.onKeyboardConfirm?.()).toBe(true)
		})
		await waitFor(() => {
			expect(screen.getAllByTestId("menu-item-checkbox")[0]).toHaveAttribute(
				"data-checked",
				"true",
			)
		})

		mockState.selectedIndex = 1
		act(() => {
			expect(latestUseMentionPanelProps?.onKeyboardEnterFolder?.()).toBe(true)
		})

		expect(mockConfirmSelection).toHaveBeenCalledWith({ enterFolder: true })
		expect(screen.getAllByTestId("menu-item-checkbox")[0]).toHaveAttribute(
			"data-checked",
			"true",
		)

		mockState.currentState = PanelState.FOLDER
		mockState.navigationStack = [
			...mockState.navigationStack,
			{ id: "folder-1", name: "Folder 1", state: PanelState.CATALOG },
		]
		rerender(
			<MentionPanel
				visible={true}
				className="after-navigation"
				catalogBehavior={defaultMentionPanelCatalogBehavior}
			/>,
		)

		await waitFor(() => {
			expect(screen.getAllByTestId("menu-item-checkbox")[0]).toHaveAttribute(
				"data-checked",
				"false",
			)
		})
	})

	it("should submit checked items as a batch when completing with keyboard", async () => {
		const onSelect = vi.fn()
		setCatalogState([
			{
				id: "file-1",
				name: "File 1",
				type: MentionItemType.PROJECT_FILE,
			},
			{
				id: "file-2",
				name: "File 2",
				type: MentionItemType.PROJECT_FILE,
			},
		])

		render(
			<MentionPanel
				visible={true}
				onSelect={onSelect}
				catalogBehavior={defaultMentionPanelCatalogBehavior}
			/>,
		)

		enterMultiSelectMode()
		fireEvent.click(screen.getAllByTestId("menu-item")[0])
		fireEvent.click(screen.getAllByTestId("menu-item")[1])

		await waitFor(() => {
			expect(screen.getAllByTestId("menu-item-checkbox")[0]).toHaveAttribute(
				"data-checked",
				"true",
			)
			expect(screen.getAllByTestId("menu-item-checkbox")[1]).toHaveAttribute(
				"data-checked",
				"true",
			)
		})

		act(() => {
			latestUseMentionPanelProps?.onKeyboardMetaEnter?.()
		})

		await waitFor(() => {
			expect(onSelect).toHaveBeenCalledTimes(2)
		})
		expect(onSelect.mock.calls[0][1]).toMatchObject({
			batch: { index: 0, total: 2 },
		})
		expect(onSelect.mock.calls[1][1]).toMatchObject({
			batch: { index: 1, total: 2 },
		})
		expect(typeof onSelect.mock.calls[1][1].reset).toBe("function")
		await waitFor(() => {
			expect(screen.queryAllByTestId("menu-item-checkbox")).toHaveLength(0)
		})
	})

	it("should clear local multi-select state before keyboard navigation back", async () => {
		setCatalogState([
			{
				id: "file-1",
				name: "File 1",
				type: MentionItemType.PROJECT_FILE,
			},
		])

		render(<MentionPanel visible={true} catalogBehavior={defaultMentionPanelCatalogBehavior} />)

		enterMultiSelectMode()
		act(() => {
			expect(latestUseMentionPanelProps?.onKeyboardConfirm?.()).toBe(true)
		})

		await waitFor(() => {
			expect(screen.getByTestId("menu-item-checkbox")).toHaveAttribute("data-checked", "true")
		})

		act(() => {
			latestUseMentionPanelProps?.onKeyboardNavigateBack?.()
		})

		await waitFor(() => {
			expect(screen.queryByTestId("menu-item-checkbox")).not.toBeInTheDocument()
			expect(screen.queryByText("完成")).not.toBeInTheDocument()
		})
	})

	it("should close when completing multi-select with no pending items", () => {
		const onClose = vi.fn()
		setCatalogState([
			{
				id: "file-1",
				name: "File 1",
				type: MentionItemType.PROJECT_FILE,
			},
		])

		render(
			<MentionPanel
				visible={true}
				onClose={onClose}
				catalogBehavior={defaultMentionPanelCatalogBehavior}
			/>,
		)

		enterMultiSelectMode()
		act(() => {
			latestUseMentionPanelProps?.onKeyboardMetaEnter?.()
		})

		expect(onClose).toHaveBeenCalledTimes(1)
	})

	it("should not show or enter multi-select mode on the root category screen and should still drill down", () => {
		vi.useFakeTimers()
		mockState.currentState = PanelState.DEFAULT
		mockState.navigationStack = []
		mockState.items = [
			{
				id: "project-files",
				name: "Project Files",
				type: MentionItemType.FOLDER,
				hasChildren: true,
			},
		]
		mockState.selectedIndex = 0

		render(<MentionPanel visible={true} catalogBehavior={defaultMentionPanelCatalogBehavior} />)

		expect(screen.queryByText("多选")).not.toBeInTheDocument()
		act(() => {
			expect(latestUseMentionPanelProps?.onKeyboardMetaEnter?.()).toBe(false)
		})
		expect(screen.queryByText("完成")).not.toBeInTheDocument()
		expect(screen.queryByTestId("menu-item-checkbox")).not.toBeInTheDocument()

		fireEvent.click(screen.getByTestId("menu-item"))
		vi.runAllTimers()

		expect(mockConfirmSelection).toHaveBeenCalledWith({ enterFolder: false })
		vi.useRealTimers()
	})

	it("should still enter folders from the right arrow while in multi-select mode", () => {
		vi.useFakeTimers()
		setCatalogState([
			{
				id: "folder-1",
				name: "Folder 1",
				type: MentionItemType.FOLDER,
				hasChildren: true,
				isFolder: true,
			},
			{
				id: "file-1",
				name: "File 1",
				type: MentionItemType.PROJECT_FILE,
			},
		])

		render(<MentionPanel visible={true} catalogBehavior={defaultMentionPanelCatalogBehavior} />)

		enterMultiSelectMode()
		fireEvent.click(screen.getAllByTestId("menu-item-arrow-icon")[0])
		vi.runAllTimers()

		expect(mockConfirmSelection).toHaveBeenCalledWith({ enterFolder: true })
		vi.useRealTimers()
	})

	it("should not add MCP items to pending when OAuth validation fails", async () => {
		mockPrepareMentionItemForPending.mockResolvedValue({
			canSelect: false,
			mcpValidated: false,
		})
		mockState.currentState = PanelState.CATALOG
		mockState.navigationStack = [{ id: "mcp", name: "MCP", state: PanelState.DEFAULT }]
		mockState.items = [
			{
				id: "mcp-1",
				name: "MCP 1",
				type: MentionItemType.MCP,
				data: {
					id: "mcp-1",
					name: "MCP 1",
					icon: "",
					require_fields: [],
				},
			},
		]
		mockState.selectedIndex = 0

		render(<MentionPanel visible={true} catalogBehavior={defaultMentionPanelCatalogBehavior} />)

		enterMultiSelectMode()
		fireEvent.click(screen.getByTestId("menu-item"))

		await waitFor(() => {
			expect(mockPrepareMentionItemForPending).toHaveBeenCalledTimes(1)
		})
		expect(screen.getByTestId("menu-item-checkbox")).toHaveAttribute("data-checked", "false")
	})
})
