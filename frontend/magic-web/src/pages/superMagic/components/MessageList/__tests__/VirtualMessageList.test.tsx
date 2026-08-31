import {
	createElement,
	forwardRef,
	useImperativeHandle,
	type ComponentProps,
	type ReactElement,
} from "react"
import { act, fireEvent, render } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { SuperMagicMessageItem } from "../type"
import { buildVirtualMessageProjection } from "../virtual-message-items"
import { VirtualMessageList } from "../components/VirtualMessageList"

const ROW_HEIGHT = 100

const virtualState = vi.hoisted(() => ({
	toolStatus: "completed",
	canonicalNode: undefined as Record<string, unknown> | undefined,
	lastProps: undefined as Record<string, any> | undefined,
	scrollOffset: 0,
	scrollSize: 2000,
	viewportSize: 400,
	resizeCallbacks: [] as ResizeObserverCallback[],
	scrollToIndexCalls: [] as Array<[number, Record<string, unknown> | undefined]>,
	/** Every render's pinned indices against the rows actually available to resolve them. */
	keepMountedRenders: [] as Array<{ keepMounted?: Array<number>; rowCount: number }>,
}))

/**
 * virtua drives layout from a measurement cache; the mock replaces that cache with a fixed grid
 * so index math (sticky handoff, push-out) can be asserted without a real layout engine.
 */
vi.mock("virtua", () => ({
	Virtualizer: forwardRef((props: Record<string, any>, ref) => {
		virtualState.lastProps = props
		virtualState.keepMountedRenders.push({
			keepMounted: props.keepMounted,
			rowCount: ((props.children as Array<unknown>) || []).length,
		})
		useImperativeHandle(ref, () => ({
			get scrollOffset() {
				return virtualState.scrollOffset
			},
			get scrollSize() {
				return virtualState.scrollSize
			},
			get viewportSize() {
				return virtualState.viewportSize
			},
			findItemIndex: (offset: number) =>
				Math.max(0, Math.floor((offset - (props.startMargin || 0)) / ROW_HEIGHT)),
			getItemOffset: (index: number) => index * ROW_HEIGHT,
			getItemSize: () => ROW_HEIGHT,
			scrollTo: vi.fn(),
			scrollToIndex: (index: number, opts?: Record<string, unknown>) => {
				virtualState.scrollToIndexCalls.push([index, opts])
			},
		}))

		const Item = props.item || "div"
		const children = (props.children as Array<ReactElement>) || []
		return createElement(
			"div",
			{ "data-testid": "mock-virtualizer" },
			children.map((child, index) =>
				createElement(
					Item,
					{
						key: child.key ?? index,
						index,
						style: { position: "absolute", top: index * ROW_HEIGHT },
					},
					child,
				),
			),
		)
	}),
}))

vi.mock("@/pages/superMagic/stores", () => ({
	superMagicStore: {
		getMessageNode: () => ({ status: virtualState.toolStatus }),
		getTopicMessageNode: () => virtualState.canonicalNode,
		getMessageRevision: () => 1,
	},
}))

vi.mock("react-i18next", async (importOriginal) => {
	const actual = await importOriginal<typeof import("react-i18next")>()
	return {
		...actual,
		useTranslation: () => ({ t: (key: string) => key }),
	}
})

class ControlledResizeObserver {
	constructor(callback: ResizeObserverCallback) {
		virtualState.resizeCallbacks.push(callback)
	}

	observe = vi.fn()
	disconnect = vi.fn()
}

function message(id: string, role: "user" | "assistant" | "tool"): SuperMagicMessageItem {
	return {
		super_message_id: id,
		app_message_id: id,
		role,
		content: `${role} message`,
	} as unknown as SuperMagicMessageItem
}

function createViewport() {
	return document.createElement("div")
}

function renderList(
	items: Array<SuperMagicMessageItem>,
	options?: Partial<ComponentProps<typeof VirtualMessageList>>,
) {
	const projection = buildVirtualMessageProjection(items)
	const viewport = createViewport()
	return render(
		<VirtualMessageList
			items={projection.items}
			userIndices={projection.userIndices}
			isMobile={false}
			getScrollElement={() => viewport}
			renderNode={({ item }) => <span>{item.key}</span>}
			{...options}
		/>,
	)
}

function scrollTo(offset: number) {
	virtualState.scrollOffset = offset
	act(() => {
		virtualState.lastProps?.onScroll?.(offset)
	})
}

describe("VirtualMessageList", () => {
	beforeEach(() => {
		virtualState.toolStatus = "completed"
		virtualState.canonicalNode = undefined
		virtualState.lastProps = undefined
		virtualState.scrollOffset = 0
		virtualState.scrollSize = 2000
		virtualState.resizeCallbacks = []
		virtualState.scrollToIndexCalls = []
		virtualState.keepMountedRenders = []
		vi.stubGlobal("ResizeObserver", ControlledResizeObserver)
	})

	it("renders one flat row per message without group wrappers", () => {
		const { container } = renderList([
			message("user-0", "user"),
			message("assistant-1", "assistant"),
			message("assistant-2", "assistant"),
			message("user-3", "user"),
			message("tool-4", "tool"),
		])

		expect(virtualState.lastProps?.data).toBeUndefined()
		expect(virtualState.lastProps?.children).toHaveLength(5)
		expect(container.querySelectorAll('[data-testid="virtual-message-row"]')).toHaveLength(5)
		expect(container.querySelectorAll('[data-message-id="user-0"]')).toHaveLength(1)
		expect(container.querySelectorAll('[data-message-id="user-3"]')).toHaveLength(1)
		expect(container.querySelector('[data-virtual-message-spacing="true"]')).toHaveClass("h-2")
	})

	it("appends the footer as the last virtual row so one virtualizer measures everything", () => {
		const { container } = renderList([message("user-0", "user")], {
			footer: <div data-testid="message-list-footer">footer</div>,
		})

		const rows = virtualState.lastProps?.children as Array<ReactElement>
		expect(rows).toHaveLength(2)
		expect(rows[rows.length - 1].key).toContain("footer")
		expect(container.querySelector('[data-testid="message-list-footer"]')).not.toBeNull()
	})

	it("binds the caller's scroll element and start margin", () => {
		const viewport = createViewport()
		renderList([message("user-0", "user")], {
			getScrollElement: () => viewport,
			startMargin: 50,
		})

		expect(virtualState.lastProps?.scrollRef.current).toBe(viewport)
		expect(virtualState.lastProps?.startMargin).toBe(50)
	})

	it("does not mount the virtualizer before the caller's scroll element exists", () => {
		renderList([message("user-0", "user")], { getScrollElement: () => null })

		expect(virtualState.lastProps).toBeUndefined()
	})

	it("mounts once a caller's ref-based scroll element commits after this subtree", () => {
		// The share shell passes a plain ref filled by an ancestor, so it is still null while
		// this list renders. Reading it again on commit is what makes that path work at all.
		const lateViewport = { current: null as HTMLDivElement | null }
		const view = renderList([message("user-0", "user")], {
			getScrollElement: () => lateViewport.current,
		})
		expect(virtualState.lastProps).toBeUndefined()

		lateViewport.current = createViewport()
		view.rerender(
			<VirtualMessageList
				items={buildVirtualMessageProjection([message("user-0", "user")]).items}
				userIndices={[0]}
				isMobile={false}
				getScrollElement={() => lateViewport.current}
				renderNode={({ item }) => <span>{item.key}</span>}
			/>,
		)

		expect(virtualState.lastProps?.scrollRef.current).toBe(lateViewport.current)
	})

	it("enables shift only for a pure prepend, not for a middle insertion", () => {
		const initialMessages = [
			message("user-0", "user"),
			message("assistant-0", "assistant"),
			message("user-1", "user"),
		]
		const viewport = createViewport()
		const renderWith = (messages: Array<SuperMagicMessageItem>) => {
			const projection = buildVirtualMessageProjection(messages)
			return (
				<VirtualMessageList
					items={projection.items}
					userIndices={projection.userIndices}
					isMobile={false}
					getScrollElement={() => viewport}
					renderNode={({ item }) => <span>{item.key}</span>}
				/>
			)
		}

		const view = render(renderWith(initialMessages))
		expect(virtualState.lastProps?.shift).toBe(false)

		view.rerender(
			renderWith([
				message("history-user", "user"),
				message("history-assistant", "assistant"),
				...initialMessages,
			]),
		)
		expect(virtualState.lastProps?.shift).toBe(true)

		view.rerender(
			renderWith([
				message("history-user", "user"),
				message("history-assistant", "assistant"),
				message("user-0", "user"),
				message("assistant-0", "assistant"),
				message("middle-insert", "assistant"),
				message("user-1", "user"),
			]),
		)
		expect(virtualState.lastProps?.shift).toBe(false)
	})

	it("keeps the User row above the scroll position mounted and pinned", () => {
		// Rows: 0 user-0, 1 assistant-1, 2 assistant-2, 3 user-3, 4 assistant-4
		const { container } = renderList([
			message("user-0", "user"),
			message("assistant-1", "assistant"),
			message("assistant-2", "assistant"),
			message("user-3", "user"),
			message("assistant-4", "assistant"),
		])

		scrollTo(2 * ROW_HEIGHT)
		expect(virtualState.lastProps?.keepMounted).toEqual([0])
		expect(
			container
				.querySelector('[data-virtual-item-sticky="true"]')
				?.querySelector("[data-message-id]"),
		).toHaveAttribute("data-message-id", "user-0")

		scrollTo(4 * ROW_HEIGHT)
		expect(virtualState.lastProps?.keepMounted).toEqual([3])
	})

	it("drops the pinned row from keepMounted once the list no longer reaches it", () => {
		// virtua clamps its own range but renders keepMounted verbatim, so a stale index resolves
		// to no child and throws. Replaying a shared topic restarts the list from empty.
		const viewport = createViewport()
		const renderWith = (messages: Array<SuperMagicMessageItem>) => {
			const projection = buildVirtualMessageProjection(messages)
			return (
				<VirtualMessageList
					items={projection.items}
					userIndices={projection.userIndices}
					isMobile={false}
					getScrollElement={() => viewport}
					renderNode={({ item }) => <span>{item.key}</span>}
				/>
			)
		}

		const view = render(
			renderWith([
				message("user-0", "user"),
				message("assistant-1", "assistant"),
				message("assistant-2", "assistant"),
				message("user-3", "user"),
				message("assistant-4", "assistant"),
			]),
		)

		scrollTo(4 * ROW_HEIGHT)
		expect(virtualState.lastProps?.keepMounted).toEqual([3])

		view.rerender(renderWith([message("user-0", "user")]))

		const outOfRange = virtualState.keepMountedRenders.filter(({ keepMounted, rowCount }) =>
			(keepMounted ?? []).some((index) => index >= rowCount),
		)
		expect(outOfRange).toEqual([])
	})

	it("pushes the pinned row out as the next User row reaches the park line", () => {
		const { container } = renderList([
			message("user-0", "user"),
			message("assistant-1", "assistant"),
			message("user-2", "user"),
		])
		const canvas = container.querySelector(
			'[data-testid="virtual-message-canvas"]',
		) as HTMLElement

		// Desktop parks the pinned row 40px below the viewport top while nothing crowds it.
		expect(canvas.style.getPropertyValue("--message-group-sticky-top")).toBe("40px")

		// user-2 sits at offset 200; once it is within one row height of the park line the
		// pinned row must translate up in lockstep so the handoff has no overlap or gap.
		scrollTo(140)
		expect(canvas.style.getPropertyValue("--message-group-sticky-top")).toBe("-40px")
	})

	it("lets a shell without a header park the pinned turn flush with the viewport top", () => {
		// The workspace parks below its header line; the share shell has no header. Before
		// virtualization this was the caller's `top-*` class on the sticky row itself.
		const { container } = renderList(
			[message("user-0", "user"), message("assistant-1", "assistant")],
			{ stickyTopOffset: 0 },
		)
		const canvas = container.querySelector(
			'[data-testid="virtual-message-canvas"]',
		) as HTMLElement

		expect(canvas.style.getPropertyValue("--message-group-sticky-top")).toBe("0px")
	})

	it("offsets the push-out by startMargin because item offsets exclude it", () => {
		// `getItemOffset` is measured from the virtualizer container while `scrollOffset` is
		// measured from the scroll element; startMargin is the gap between those two origins.
		const { container } = renderList(
			[
				message("user-0", "user"),
				message("assistant-1", "assistant"),
				message("user-2", "user"),
			],
			{ startMargin: 50 },
		)
		const canvas = container.querySelector(
			'[data-testid="virtual-message-canvas"]',
		) as HTMLElement

		// Same geometry as the no-margin case, but every threshold moves 50px later: the
		// no-margin list already pushes out at 140, this one is still parked.
		scrollTo(140)
		expect(canvas.style.getPropertyValue("--message-group-sticky-top")).toBe("10px")

		scrollTo(90)
		expect(canvas.style.getPropertyValue("--message-group-sticky-top")).toBe("40px")

		scrollTo(190)
		expect(canvas.style.getPropertyValue("--message-group-sticky-top")).toBe("-40px")
	})

	it("reports layout growth through the virtualizer change callback", () => {
		const onVirtualizerChange = vi.fn()
		renderList([message("user-0", "user"), message("assistant-1", "assistant")], {
			onVirtualizerChange,
		})

		expect(onVirtualizerChange).not.toHaveBeenCalled()
		act(() => {
			virtualState.resizeCallbacks.forEach((callback) => callback([], {} as ResizeObserver))
		})
		expect(onVirtualizerChange).toHaveBeenCalledTimes(1)
	})

	it("exposes the virtualizer handle through the scroll adapter", () => {
		const virtualizerRef = { current: null } as {
			current: import("../message-list-scroll-adapter").MessageListScrollAdapter | null
		}
		renderList([message("user-0", "user"), message("assistant-1", "assistant")], {
			virtualizerRef,
			footer: <div>footer</div>,
		})

		expect(virtualizerRef.current?.itemCount).toBe(3)
		expect(virtualizerRef.current?.getItemOffset(2)).toBe(200)
		virtualizerRef.current?.scrollToIndex(2, { align: "end" })
	})

	it("folds the space below the virtualizer into a scroll-to-last write", () => {
		// Two rows of 100 sit after a 50px start margin, so virtua projects the scroll element at
		// 250. The caller's message column adds 8px of bottom padding below the virtualizer, and
		// without it the write lands 8px above the scroll end.
		virtualState.scrollSize = 258
		const virtualizerRef = { current: null } as {
			current: import("../message-list-scroll-adapter").MessageListScrollAdapter | null
		}
		renderList([message("user-0", "user"), message("assistant-1", "assistant")], {
			virtualizerRef,
			startMargin: 50,
		})

		virtualizerRef.current?.scrollToIndex(1, { align: "end" })
		expect(virtualState.scrollToIndexCalls).toEqual([[1, { align: "end", offset: 8 }]])

		// A bottom-aligned write on any earlier row still means "this row's bottom on the
		// viewport line", which the trailing strip has nothing to do with.
		virtualizerRef.current?.scrollToIndex(0, { align: "end" })
		expect(virtualState.scrollToIndexCalls[1]).toEqual([0, { align: "end" }])
	})

	it("filters a non-terminal empty Tool before it reaches the virtualizer", () => {
		virtualState.toolStatus = "running"
		const emptyTool = {
			...message("tool-0", "tool"),
			content: null,
			reasoning_content: null,
			tool_calls: null,
		} as unknown as SuperMagicMessageItem
		const { container } = renderList([emptyTool])

		expect(container.querySelector('[data-message-id="tool-0"]')).toBeNull()
		expect(container.querySelector('[data-virtual-message-hidden="true"]')).toBeNull()
	})

	it("renders a Tool whose terminal state is carried by the nested tool result", () => {
		virtualState.toolStatus = ""
		virtualState.canonicalNode = {
			role: "tool",
			debug: {
				status: "running",
				tool: { name: "finish_task", status: "finished" },
			},
		}
		const finishTask = {
			...message("finish-task", "tool"),
			content: null,
			reasoning_content: null,
			tool_calls: null,
			attachments: [{ filename: "result.html" }],
		} as unknown as SuperMagicMessageItem
		const { container } = renderList([finishTask], {
			topicId: "chat-topic",
		})

		expect(container.querySelector('[data-message-id="finish-task"]')).not.toBeNull()
		expect(container.querySelector('[data-virtual-message-hidden="true"]')).toBeNull()
	})

	it("keeps the outer chat Topic ID when merging a historical canonical node", () => {
		virtualState.canonicalNode = {
			role: "assistant",
			topic_id: "inner-sandbox-topic",
			super_message_id: "assistant-0",
		}
		let renderedTopicId = ""
		renderList([message("assistant-0", "assistant")], {
			topicId: "chat-topic",
			renderNode: ({ item }) => {
				renderedTopicId = String(item.node?.topic_id || "")
				return <span>{item.key}</span>
			},
		})

		expect(renderedTopicId).toBe("chat-topic")
	})

	it("keeps other rows mounted when a render callback throws", () => {
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined)
		try {
			const { container } = renderList(
				[message("user-0", "user"), message("assistant-1", "assistant")],
				{
					renderNode: ({ item }) => {
						if (item.key === "assistant-1") throw new Error("render failed")
						return <span>{item.key}</span>
					},
				},
			)

			expect(container.querySelector('[data-message-id="user-0"]')).not.toBeNull()
			expect(container.querySelector('[data-testid="message-render-error"]')).not.toBeNull()
		} finally {
			consoleError.mockRestore()
		}
	})

	it.each([
		["null", null],
		["false", false],
	])("does not expose a message content wrapper when renderNode returns %s", (_, emptyNode) => {
		const { container } = renderList(
			[message("user-0", "user"), message("assistant-1", "assistant")],
			{
				renderNode: ({ item }) =>
					item.key === "assistant-1" ? emptyNode : <span>{item.key}</span>,
			},
		)

		expect(container.querySelector('[data-message-id="user-0"]')).not.toBeNull()
		expect(container.querySelector('[data-message-id="assistant-1"]')).toBeNull()
	})

	it("toggles export selection from the turnKey sidecar", () => {
		const onToggleSelect = vi.fn()
		const { container } = renderList(
			[message("user-0", "user"), message("assistant-1", "assistant")],
			{
				exportMode: true,
				selectedKeys: new Set(),
				onToggleSelect,
			},
		)

		fireEvent.click(
			container
				.querySelector('[data-message-id="assistant-1"]')
				?.closest('[data-testid="virtual-message-row"]') as HTMLElement,
		)
		expect(onToggleSelect).toHaveBeenCalledWith("turn-user-0")
	})
})
