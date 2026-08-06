import { fireEvent, render } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { VirtualItem } from "@tanstack/react-virtual"
import type { SuperMagicMessageItem } from "../type"
import { buildVirtualMessageProjection } from "../virtual-message-items"
import { VirtualMessageList } from "../components/VirtualMessageList"

const virtualState = vi.hoisted(() => ({
	toolStatus: "completed",
	startIndex: 3,
	endIndex: 4,
	scrollOffset: 0,
	measurementsCache: [
		{ index: 0, key: "user-0", start: 0, end: 80, size: 80, lane: 0 },
		{ index: 1, key: "assistant-1", start: 100, end: 180, size: 80, lane: 0 },
		{ index: 2, key: "assistant-2", start: 200, end: 280, size: 80, lane: 0 },
		{ index: 3, key: "assistant-3", start: 300, end: 380, size: 80, lane: 0 },
		{ index: 4, key: "user-4", start: 400, end: 480, size: 80, lane: 0 },
	] as Array<VirtualItem>,
	options: undefined as { gap?: number } | undefined,
	virtualItems: [
		{ index: 0, key: "user-0", start: 0, end: 80, size: 80, lane: 0 },
		{ index: 3, key: "assistant-3", start: 300, end: 380, size: 80, lane: 0 },
		{ index: 4, key: "user-4", start: 400, end: 480, size: 80, lane: 0 },
	] as Array<VirtualItem>,
}))

vi.mock("@tanstack/react-virtual", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@tanstack/react-virtual")>()
	return {
		...actual,
		useVirtualizer: (options: { gap?: number }) => {
			virtualState.options = options
			return {
				range: {
					startIndex: virtualState.startIndex,
					endIndex: virtualState.endIndex,
				},
				scrollOffset: virtualState.scrollOffset,
				measurementsCache: virtualState.measurementsCache,
				getVirtualItems: () => virtualState.virtualItems,
				getTotalSize: () => 500,
				measureElement: vi.fn(),
			}
		},
	}
})

vi.mock("@/pages/superMagic/stores", () => ({
	superMagicStore: {
		getMessageNode: () => ({ status: virtualState.toolStatus }),
	},
}))

vi.mock("react-i18next", async (importOriginal) => {
	const actual = await importOriginal<typeof import("react-i18next")>()
	return {
		...actual,
		useTranslation: () => ({ t: (key: string) => key }),
	}
})

function message(id: string, role: "user" | "assistant" | "tool"): SuperMagicMessageItem {
	return {
		super_message_id: id,
		app_message_id: id,
		role,
	} as unknown as SuperMagicMessageItem
}

describe("VirtualMessageList", () => {
	beforeEach(() => {
		virtualState.toolStatus = "completed"
		virtualState.startIndex = 3
		virtualState.endIndex = 4
		virtualState.scrollOffset = 0
		virtualState.options = undefined
		virtualState.virtualItems = [
			{ index: 0, key: "user-0", start: 0, end: 80, size: 80, lane: 0 },
			{ index: 3, key: "assistant-3", start: 300, end: 380, size: 80, lane: 0 },
			{ index: 4, key: "user-4", start: 400, end: 480, size: 80, lane: 0 },
		]
	})

	it("preserves the existing per-row spacing without adding a second global gap", () => {
		virtualState.startIndex = 0
		virtualState.endIndex = 1
		virtualState.virtualItems = [
			{ index: 0, key: "user-0", start: 0, end: 88, size: 88, lane: 0 },
			{ index: 1, key: "assistant-1", start: 88, end: 216, size: 128, lane: 0 },
		]
		const projection = buildVirtualMessageProjection([
			message("user-0", "user"),
			message("assistant-1", "assistant"),
		])

		const { container } = render(
			<VirtualMessageList
				items={projection.items}
				userIndices={projection.userIndices}
				isMobile={false}
				getScrollElement={() => null}
				renderNode={({ item }) => <span>{item.key}</span>}
			/>,
		)

		expect(virtualState.options?.gap ?? 0).toBe(0)
		expect(
			container
				.querySelector('[data-message-id="user-0"]')
				?.closest('[data-testid="virtual-message-row"]')
				?.querySelector('[data-virtual-message-spacing="true"]'),
		).toHaveClass("h-2")
		expect(container.querySelector('[data-message-id="assistant-1"]')).toHaveClass("pb-2")
	})

	it("pushes the active User upward when the next User reaches the sticky boundary", () => {
		virtualState.scrollOffset = 300
		const projection = buildVirtualMessageProjection([
			message("user-0", "user"),
			message("assistant-1", "assistant"),
			message("assistant-2", "assistant"),
			message("assistant-3", "assistant"),
			message("user-4", "user"),
		])

		const { container } = render(
			<VirtualMessageList
				items={projection.items}
				userIndices={projection.userIndices}
				isMobile={false}
				getScrollElement={() => null}
				renderNode={({ item }) => <span>{item.key}</span>}
			/>,
		)

		expect(container.querySelector('[data-sticky-message-id="user-0"]')).toHaveStyle({
			transform: "translateY(-12px)",
		})
	})

	it("mounts the visible range plus one active User and keeps mobile sticky offset", () => {
		const projection = buildVirtualMessageProjection([
			message("user-0", "user"),
			message("assistant-1", "assistant"),
			message("assistant-2", "assistant"),
			message("assistant-3", "assistant"),
			message("user-4", "user"),
		])

		const { container } = render(
			<VirtualMessageList
				items={projection.items}
				userIndices={projection.userIndices}
				isMobile
				getScrollElement={() => null}
				renderNode={({ item }) => <span data-testid={`message-${item.key}`} />}
			/>,
		)

		expect(container.querySelectorAll("[data-testid='virtual-message-row']")).toHaveLength(3)
		const sticky = container.querySelector<HTMLElement>('[data-sticky-message-id="user-0"]')
		expect(sticky).not.toBeNull()
		expect(sticky).toHaveClass("top-[10px]")
		expect(sticky).not.toHaveClass("!-top-[2px]")
		expect(sticky).toHaveStyle({ position: "sticky", transform: "translateY(0px)" })

		const visibleAssistant = container.querySelector<HTMLElement>(
			'[data-message-id="assistant-3"]',
		)
		expect(visibleAssistant?.closest('[data-testid="virtual-message-row"]')).toHaveStyle({
			position: "absolute",
			transform: "translateY(300px)",
		})
		expect(container.querySelector('[data-message-id="assistant-1"]')).toBeNull()
		expect(container.querySelector('[data-message-id="assistant-2"]')).toBeNull()
	})

	it("uses the desktop sticky offset without duplicating the active User", () => {
		const projection = buildVirtualMessageProjection([
			message("user-0", "user"),
			message("assistant-1", "assistant"),
			message("assistant-2", "assistant"),
			message("assistant-3", "assistant"),
			message("user-4", "user"),
		])

		const { container } = render(
			<VirtualMessageList
				items={projection.items}
				userIndices={projection.userIndices}
				isMobile={false}
				getScrollElement={() => null}
				renderNode={({ item }) => <span>{item.key}</span>}
			/>,
		)

		expect(container.querySelectorAll('[data-message-id="user-0"]')).toHaveLength(1)
		expect(container.querySelector('[data-sticky-message-id="user-0"]')).toHaveClass(
			"top-[40px]",
		)
	})

	it("measures a non-terminal top-level Tool as zero height instead of leaving an estimate gap", () => {
		virtualState.toolStatus = "running"
		virtualState.startIndex = 0
		virtualState.endIndex = 0
		virtualState.virtualItems = [
			{ index: 0, key: "tool-0", start: 0, end: 80, size: 80, lane: 0 },
		]
		const projection = buildVirtualMessageProjection([message("tool-0", "tool")])

		const { container } = render(
			<VirtualMessageList
				items={projection.items}
				userIndices={projection.userIndices}
				isMobile={false}
				getScrollElement={() => null}
				renderNode={({ item }) => <span>{item.key}</span>}
			/>,
		)

		expect(container.querySelector('[data-message-id="tool-0"]')).toBeNull()
		expect(container.querySelector('[data-virtual-message-hidden="true"]')).toHaveStyle({
			height: "0px",
		})
	})

	it("keeps other rows mounted when a render callback throws", () => {
		virtualState.startIndex = 0
		virtualState.endIndex = 1
		virtualState.virtualItems = [
			{ index: 0, key: "user-0", start: 0, end: 80, size: 80, lane: 0 },
			{ index: 1, key: "assistant-1", start: 80, end: 160, size: 80, lane: 0 },
		]
		const projection = buildVirtualMessageProjection([
			message("user-0", "user"),
			message("assistant-1", "assistant"),
		])
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined)

		try {
			const { container } = render(
				<VirtualMessageList
					items={projection.items}
					userIndices={projection.userIndices}
					isMobile={false}
					getScrollElement={() => null}
					renderNode={({ item }) => {
						if (item.key === "assistant-1") throw new Error("render failed")
						return <span>{item.key}</span>
					}}
				/>,
			)

			expect(container.querySelector('[data-message-id="user-0"]')).not.toBeNull()
			expect(container.querySelector('[data-message-id="assistant-1"]')).not.toBeNull()
			expect(container.querySelector('[data-testid="message-render-error"]')).not.toBeNull()
		} finally {
			consoleError.mockRestore()
		}
	})

	it.each([
		["null", null],
		["false", false],
	])("does not expose an empty message row when renderNode returns %s", (_, emptyNode) => {
		virtualState.startIndex = 0
		virtualState.endIndex = 1
		virtualState.virtualItems = [
			{ index: 0, key: "user-0", start: 0, end: 80, size: 80, lane: 0 },
			{ index: 1, key: "assistant-1", start: 80, end: 160, size: 80, lane: 0 },
		]
		const projection = buildVirtualMessageProjection([
			message("user-0", "user"),
			message("assistant-1", "assistant"),
		])

		const { container } = render(
			<VirtualMessageList
				items={projection.items}
				userIndices={projection.userIndices}
				isMobile={false}
				getScrollElement={() => null}
				renderNode={({ item }) =>
					item.key === "assistant-1" ? emptyNode : <span>{item.key}</span>
				}
			/>,
		)

		expect(container.querySelector('[data-message-id="user-0"]')).not.toBeNull()
		expect(container.querySelector('[data-message-id="assistant-1"]')).toBeNull()
	})

	it("toggles export selection from the turnKey sidecar instead of a mounted group DOM", () => {
		virtualState.startIndex = 1
		virtualState.endIndex = 1
		virtualState.virtualItems = [
			{ index: 0, key: "user-0", start: 0, end: 80, size: 80, lane: 0 },
			{ index: 1, key: "assistant-1", start: 80, end: 160, size: 80, lane: 0 },
		]
		const projection = buildVirtualMessageProjection([
			message("user-0", "user"),
			message("assistant-1", "assistant"),
		])
		const onToggleSelect = vi.fn()

		const { container } = render(
			<VirtualMessageList
				items={projection.items}
				userIndices={projection.userIndices}
				isMobile={false}
				getScrollElement={() => null}
				renderNode={({ item }) => <span>{item.key}</span>}
				exportMode
				selectedKeys={new Set()}
				onToggleSelect={onToggleSelect}
			/>,
		)

		fireEvent.click(
			container
				.querySelector('[data-message-id="assistant-1"]')
				?.closest('[data-testid="virtual-message-row"]') as HTMLElement,
		)
		expect(onToggleSelect).toHaveBeenCalledWith("turn-user-0")
	})
})
