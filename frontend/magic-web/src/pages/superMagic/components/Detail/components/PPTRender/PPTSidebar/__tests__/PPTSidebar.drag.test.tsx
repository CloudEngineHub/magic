import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ReactNode } from "react"
import PPTSidebar from "../index"
import type { SlideItem } from "../types"

const mockState = vi.hoisted(() => ({
	store: {
		slides: [] as SlideItem[],
		activeIndex: 0,
		ensureSlideScreenshot: vi.fn(),
		getFileIdByPath: vi.fn((path: string) => `file-${path}`),
		getFullRelativePath: vi.fn((path: string) => `/ppt/${path}`),
	},
}))

vi.mock("react-i18next", () => ({
	initReactI18next: {
		type: "3rdParty",
		init: () => undefined,
	},
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}))

vi.mock("mobx-react-lite", () => ({
	observer: <T,>(component: T) => component,
}))

vi.mock("ahooks", () => ({
	useMemoizedFn: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}))

vi.mock("@/lib/utils", () => ({
	cn: (...classNames: Array<string | false | null | undefined>) =>
		classNames.filter(Boolean).join(" "),
}))

vi.mock("@/components/shadcn-ui/tooltip", () => ({
	TooltipProvider: ({ children }: { children?: ReactNode }) => <>{children}</>,
	Tooltip: ({ children }: { children?: ReactNode }) => <>{children}</>,
	TooltipContent: ({ children }: { children?: ReactNode }) => <>{children}</>,
	TooltipTrigger: ({ children }: { children?: ReactNode }) => <>{children}</>,
}))

vi.mock("@/components/shadcn-ui/button", () => ({
	Button: ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) => (
		<button {...props}>{children}</button>
	),
}))

vi.mock("@/components/shadcn-ui/scroll-area", () => ({
	ScrollArea: ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) => (
		<div {...props}>{children}</div>
	),
}))

vi.mock("@/utils/pubsub", () => ({
	default: {
		publish: vi.fn(),
	},
	PubSubEvents: {
		Locate_File_In_Tree: "Locate_File_In_Tree",
	},
}))

vi.mock("../../hooks", () => ({
	usePPTStore: () => mockState.store,
}))

vi.mock("@/pages/superMagic/components/MessageEditor/utils/drag", () => ({
	handlePPTSlideDragStart: vi.fn(),
}))

vi.mock("../hooks/useScreenshotRetry", () => ({
	useScreenshotRetry: () => ({
		canRetry: false,
		manualRetry: vi.fn(),
	}),
}))

vi.mock("../../hooks/useAIEdit", () => ({
	useAIEdit: () => ({
		aiEditItems: [],
	}),
}))

vi.mock("@/components/other/SmartTooltip", () => ({
	default: ({ children }: { children?: ReactNode }) => <>{children}</>,
}))

vi.mock("@/components/shadcn-ui/context-menu", () => ({
	ContextMenu: ({ children }: { children?: ReactNode }) => <>{children}</>,
	ContextMenuTrigger: ({ children }: { children?: ReactNode }) => <>{children}</>,
	ContextMenuContent: ({ children }: { children?: ReactNode }) => <>{children}</>,
	ContextMenuItem: ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) => (
		<button {...props}>{children}</button>
	),
	ContextMenuSeparator: () => null,
	ContextMenuSub: ({ children }: { children?: ReactNode }) => <>{children}</>,
	ContextMenuSubTrigger: ({ children }: { children?: ReactNode }) => <>{children}</>,
	ContextMenuSubContent: ({ children }: { children?: ReactNode }) => <>{children}</>,
}))

vi.mock("@/components/shadcn-ui/dialog", () => ({
	Dialog: ({ children }: { children?: ReactNode }) => <>{children}</>,
	DialogContent: ({ children }: { children?: ReactNode }) => <>{children}</>,
	DialogDescription: ({ children }: { children?: ReactNode }) => <>{children}</>,
	DialogFooter: ({ children }: { children?: ReactNode }) => <>{children}</>,
	DialogHeader: ({ children }: { children?: ReactNode }) => <>{children}</>,
	DialogTitle: ({ children }: { children?: ReactNode }) => <>{children}</>,
}))

vi.mock("@/components/shadcn-ui/input", () => ({
	Input: (props: Record<string, unknown>) => <input {...props} />,
}))

vi.mock("sonner", () => ({
	toast: {
		error: vi.fn(),
	},
}))

describe("PPTSidebar drag sorting", () => {
	beforeEach(() => {
		vi.stubGlobal(
			"IntersectionObserver",
			class MockIntersectionObserver {
				observe = vi.fn()
				unobserve = vi.fn()
				disconnect = vi.fn()
			},
		)
		mockState.store.slides = [
			{ id: "slide-1", index: 0, path: "slide-1.html", title: "Slide 1" },
			{ id: "slide-2", index: 1, path: "slide-2.html", title: "Slide 2" },
			{ id: "slide-3", index: 2, path: "slide-3.html", title: "Slide 3" },
		]
		mockState.store.activeIndex = 0
		vi.clearAllMocks()
	})

	afterEach(() => {
		vi.unstubAllGlobals()
	})

	it("commits the current drop target when the pointer is released on the list gap", () => {
		const onSortChange = vi.fn()

		render(<PPTSidebar allowEdit onSlideClick={vi.fn()} onSortChange={onSortChange} />)

		const draggedSlide = screen.getByTestId("ppt-sidebar-slide-item-slide-1")
		const targetSlide = screen.getByTestId("ppt-sidebar-slide-item-slide-3")
		const list = screen.getByTestId("ppt-sidebar-slides-list")

		fireEvent.dragStart(draggedSlide, {
			dataTransfer: { effectAllowed: "", setData: vi.fn() },
		})
		fireEvent.dragOver(targetSlide, {
			clientY: 1_000,
			dataTransfer: { dropEffect: "" },
		})
		fireEvent.drop(list)

		expect(onSortChange).toHaveBeenCalledTimes(1)
		expect(onSortChange.mock.calls[0][0].map((item: SlideItem) => item.id)).toEqual([
			"slide-2",
			"slide-3",
			"slide-1",
		])
	})

	it("normalizes the previous slide bottom boundary to the next slide top boundary", async () => {
		const onSortChange = vi.fn()

		render(<PPTSidebar allowEdit onSlideClick={vi.fn()} onSortChange={onSortChange} />)

		const draggedSlide = screen.getByTestId("ppt-sidebar-slide-item-slide-3")
		const previousSlide = screen.getByTestId("ppt-sidebar-slide-item-slide-1")

		vi.spyOn(previousSlide, "getBoundingClientRect").mockReturnValue({
			top: 0,
			bottom: 100,
			left: 0,
			right: 100,
			width: 100,
			height: 100,
			x: 0,
			y: 0,
			toJSON: () => ({}),
		})
		fireEvent.dragStart(draggedSlide, {
			dataTransfer: { effectAllowed: "", setData: vi.fn() },
		})
		await waitFor(() => {
			expect(draggedSlide.className).toContain("opacity-50")
		})
		fireEvent.dragOver(previousSlide, {
			clientY: 90,
			dataTransfer: { dropEffect: "" },
		})

		await waitFor(() => {
			expect(screen.getByTestId("ppt-sidebar-drop-indicator")).toHaveAttribute(
				"data-drop-target",
				"1-before",
			)
		})

		fireEvent.drop(previousSlide)

		await waitFor(() => {
			expect(onSortChange).toHaveBeenCalledTimes(1)
		})
		expect(onSortChange.mock.calls[0][0].map((item: SlideItem) => item.id)).toEqual([
			"slide-1",
			"slide-3",
			"slide-2",
		])
	})
})
