import { createElement, type ComponentProps, type ReactNode } from "react"
import { fireEvent, render } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { SuperMagicMessageItem } from "../type"
import { buildVirtualMessageProjection } from "../virtual-message-items"
import { VirtualMessageList } from "../components/VirtualMessageList"

const virtualState = vi.hoisted(() => ({
	toolStatus: "completed",
	canonicalNode: undefined as Record<string, unknown> | undefined,
	lastProps: undefined as Record<string, any> | undefined,
}))

vi.mock("react-virtuoso", () => ({
	GroupedVirtuoso: (props: Record<string, any>) => {
		virtualState.lastProps = props
		const Group = props.components?.Group || "div"
		const List = props.components?.List || "div"
		let itemIndex = 0
		const groups = (props.groupCounts || []).map((count: number, groupIndex: number) => {
			const header = createElement(
				Group,
				{
					key: `group-${groupIndex}`,
					"data-index": groupIndex,
					"data-item-index": itemIndex,
					"data-known-size": 80,
					style: { position: "sticky", top: 0 },
				},
				props.groupContent?.(groupIndex),
			)
			const groupItems = Array.from({ length: count }, (_, offset) => {
				const currentIndex = itemIndex + offset
				const absoluteIndex = currentIndex + (props.firstItemIndex || 0)
				return createElement(
					"div",
					{
						key: currentIndex,
						"data-virtuoso-item-index": currentIndex,
					},
					props.itemContent?.(absoluteIndex, groupIndex, undefined, undefined),
				)
			})
			itemIndex += count
			return [header, ...groupItems]
		})

		return createElement(
			List,
			{ "data-testid": "mock-virtuoso-list" },
			groups.flat() as ReactNode,
		)
	},
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

function message(id: string, role: "user" | "assistant" | "tool"): SuperMagicMessageItem {
	return {
		super_message_id: id,
		app_message_id: id,
		role,
		content: `${role} message`,
	} as unknown as SuperMagicMessageItem
}

function renderList(
	items: Array<SuperMagicMessageItem>,
	options?: Partial<ComponentProps<typeof VirtualMessageList>>,
) {
	const projection = buildVirtualMessageProjection(items)
	return render(
		<VirtualMessageList
			items={projection.items}
			userIndices={projection.userIndices}
			isMobile={false}
			getScrollElement={() => null}
			renderNode={({ item }) => <span>{item.key}</span>}
			{...options}
		/>,
	)
}

describe("VirtualMessageList", () => {
	beforeEach(() => {
		virtualState.toolStatus = "completed"
		virtualState.canonicalNode = undefined
		virtualState.lastProps = undefined
	})

	it("passes grouped counts to Virtuoso and renders each User as one sticky group header", () => {
		const { container } = renderList([
			message("user-0", "user"),
			message("assistant-1", "assistant"),
			message("assistant-2", "assistant"),
			message("user-3", "user"),
			message("tool-4", "tool"),
		])

		expect(virtualState.lastProps?.groupCounts).toEqual([2, 1])
		expect(virtualState.lastProps?.data).toBeUndefined()
		expect(container.querySelectorAll('[data-message-id="user-0"]')).toHaveLength(1)
		expect(container.querySelectorAll('[data-message-id="user-3"]')).toHaveLength(1)
		expect(container.querySelector('[data-message-id="assistant-1"]')).not.toBeNull()
		expect(container.querySelector('[data-message-id="tool-4"]')).not.toBeNull()
		expect(container.querySelector('[data-virtual-message-spacing="true"]')).toHaveClass("h-2")
		expect(
			(container.querySelector("[data-virtual-message-kind='group']") as HTMLElement).style
				.transform,
		).toBe("")
	})

	it("uses a measurable spacer for the leading group without a User header", () => {
		const { container } = renderList([message("leading", "assistant")])

		expect(
			container.querySelector('[data-virtual-message-leading-group-spacer="true"]'),
		).toHaveStyle({ height: "1px" })
	})

	it("passes the real scroll parent and uses a desktop sticky offset variable", () => {
		const viewport = document.createElement("div")
		const { container } = renderList([message("user-0", "user")], {
			isMobile: false,
			getScrollElement: () => viewport,
		})

		expect(virtualState.lastProps?.customScrollParent).toBe(viewport)
		expect(
			container.querySelector("[data-virtual-message-kind='group']")?.parentElement,
		).toHaveStyle({
			top: "var(--message-group-sticky-top, 0px)",
		})
		expect(
			container.querySelector('[data-message-id="user-0"]')?.parentElement,
		).not.toHaveClass("before:bg-[rgb(var(--mobile-background-rgb))]", "after:bg-none")
	})

	it("does not treat a range-only update as a scroll request", () => {
		const onVirtualizerChange = vi.fn()
		renderList([message("user-0", "user"), message("assistant-1", "assistant")], {
			onVirtualizerChange,
		})

		virtualState.lastProps?.rangeChanged?.({ startIndex: 0, endIndex: 1 })
		expect(onVirtualizerChange).not.toHaveBeenCalled()

		virtualState.lastProps?.totalListHeightChanged?.(256)
		expect(onVirtualizerChange).toHaveBeenCalledTimes(1)
	})

	it("uses a stable positive firstItemIndex and decreases it only for prepended ordinary items", () => {
		const initialMessages = [
			message("user-0", "user"),
			message("assistant-0", "assistant"),
			message("user-1", "user"),
			message("assistant-1", "assistant"),
		]
		const initialProjection = buildVirtualMessageProjection(initialMessages)
		const view = render(
			<VirtualMessageList
				items={initialProjection.items}
				isMobile={false}
				getScrollElement={() => null}
				renderNode={({ item }) => <span>{item.key}</span>}
			/>,
		)

		const initialFirstItemIndex = virtualState.lastProps?.firstItemIndex
		expect(initialFirstItemIndex).toBeGreaterThan(0)

		const prependedProjection = buildVirtualMessageProjection([
			message("history-user", "user"),
			message("history-assistant", "assistant"),
			...initialMessages,
		])
		view.rerender(
			<VirtualMessageList
				items={prependedProjection.items}
				isMobile={false}
				getScrollElement={() => null}
				renderNode={({ item }) => <span>{item.key}</span>}
			/>,
		)

		expect(virtualState.lastProps?.firstItemIndex).toBe(initialFirstItemIndex - 1)

		const headerOnlyProjection = buildVirtualMessageProjection([
			message("header-only-user", "user"),
			message("history-user", "user"),
			message("history-assistant", "assistant"),
			...initialMessages,
		])
		view.rerender(
			<VirtualMessageList
				items={headerOnlyProjection.items}
				isMobile={false}
				getScrollElement={() => null}
				renderNode={({ item }) => <span>{item.key}</span>}
			/>,
		)

		expect(virtualState.lastProps?.firstItemIndex).toBe(initialFirstItemIndex - 1)
		view.unmount()
	})

	it("filters a non-terminal empty Tool before it reaches Virtuoso", () => {
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
		const projection = buildVirtualMessageProjection([message("assistant-0", "assistant")])

		render(
			<VirtualMessageList
				topicId="chat-topic"
				items={projection.items}
				isMobile={false}
				getScrollElement={() => null}
				renderNode={({ item }) => {
					renderedTopicId = String(item.node?.topic_id || "")
					return <span>{item.key}</span>
				}}
			/>,
		)

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
