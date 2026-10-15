import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ModelDetailsHoverProvider, useModelDetailsHover } from "../useModelDetailsHover"

/** 用两行 mock 控件验证共享控制器，不依赖真实模型或接口。 */
function MockRow({ id }: { id: string }) {
	const hover = useModelDetailsHover()
	return (
		<div>
			<button onClick={() => hover.requestOpen(id)}>{id}-enter</button>
			<button onClick={() => hover.requestClose(id)}>{id}-leave</button>
			<button onClick={() => hover.requestClose(id, true)}>{id}-close</button>
			<button onClick={hover.keepOpen}>{id}-detail</button>
			<span data-testid={id}>{hover.activeId === id ? "open" : "closed"}</span>
		</div>
	)
}

/** 创建互斥行及可控制时间，验证跨浮层移动而非组件实现细节。 */
function setup() {
	vi.useFakeTimers()
	render(
		<ModelDetailsHoverProvider>
			<MockRow id="a" />
			<MockRow id="b" />
		</ModelDetailsHoverProvider>,
	)
}

afterEach(() => {
	cleanup()
	vi.useRealTimers()
})

describe("模型详情悬停", () => {
	it("显式关闭会取消其他行的待打开任务", () => {
		setup()
		fireEvent.click(screen.getByText("a-enter"))
		act(() => vi.advanceTimersByTime(140))
		fireEvent.click(screen.getByText("b-enter"))
		fireEvent.click(screen.getByText("a-close"))
		act(() => vi.advanceTimersByTime(500))
		expect(screen.getByTestId("a").textContent).toBe("closed")
		expect(screen.getByTestId("b").textContent).toBe("closed")
	})
	it("快速经过模型行不会打开详情，切换后只有新模型详情", () => {
		setup()
		fireEvent.click(screen.getByText("a-enter"))
		fireEvent.click(screen.getByText("a-leave"))
		act(() => vi.advanceTimersByTime(200))
		expect(screen.getByTestId("a").textContent).toBe("closed")
		fireEvent.click(screen.getByText("a-enter"))
		act(() => vi.advanceTimersByTime(140))
		fireEvent.click(screen.getByText("b-enter"))
		act(() => vi.advanceTimersByTime(260))
		expect(screen.getByTestId("a").textContent).toBe("closed")
		expect(screen.getByTestId("b").textContent).toBe("open")
	})

	it("斜向经过其他行再进入详情，取消待切换和待关闭任务", () => {
		setup()
		fireEvent.click(screen.getByText("a-enter"))
		act(() => vi.advanceTimersByTime(140))
		fireEvent.click(screen.getByText("a-leave"))
		fireEvent.click(screen.getByText("b-enter"))
		fireEvent.click(screen.getByText("a-detail"))
		act(() => vi.advanceTimersByTime(500))
		expect(screen.getByTestId("a").textContent).toBe("open")
		expect(screen.getByTestId("b").textContent).toBe("closed")
		fireEvent.click(screen.getByText("a-leave"))
		act(() => vi.advanceTimersByTime(320))
		expect(screen.getByTestId("a").textContent).toBe("closed")
	})

	it("旧行的退出不会关闭已打开的新模型", () => {
		setup()
		fireEvent.click(screen.getByText("a-enter"))
		act(() => vi.advanceTimersByTime(140))
		fireEvent.click(screen.getByText("b-enter"))
		act(() => vi.advanceTimersByTime(260))
		fireEvent.click(screen.getByText("a-leave"))
		act(() => vi.advanceTimersByTime(500))
		expect(screen.getByTestId("b").textContent).toBe("open")
	})
})
