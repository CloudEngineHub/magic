import { act, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import ToolGenerationProgress from "../index"

function readPercent(container: HTMLElement): number {
	const label = container.querySelector("[data-testid='tool-generation-progress'] span")
	return Number((label?.textContent ?? "").replace("%", ""))
}

describe("ToolGenerationProgress", () => {
	afterEach(() => {
		vi.useRealTimers()
	})

	it("renders nothing for a tool that does not generate images", () => {
		vi.useFakeTimers()

		const { container } = render(
			<ToolGenerationProgress
				toolCallId="spec-non-image"
				toolName="read_file"
				status="running"
			/>,
		)

		expect(container.querySelector("[data-testid='tool-generation-progress']")).toBeNull()
		// 非生图工具不应起每秒定时器，否则消息列表里每个进行中的工具卡都会空转。
		expect(vi.getTimerCount()).toBe(0)
	})

	it("renders nothing once the tool reached a terminal status", () => {
		vi.useFakeTimers()

		for (const status of ["finished", "error", "suspended", "response_missing"]) {
			const { container } = render(
				<ToolGenerationProgress
					toolCallId={`spec-terminal-${status}`}
					toolName="generate_images"
					status={status}
				/>,
			)

			expect(container.querySelector("[data-testid='tool-generation-progress']")).toBeNull()
			expect(vi.getTimerCount()).toBe(0)
		}
	})

	it("ticks once per second while an image generation tool is running", () => {
		vi.useFakeTimers()
		vi.setSystemTime(new Date("2026-01-01T00:00:00Z"))

		const { unmount } = render(
			<ToolGenerationProgress
				toolCallId="spec-tick"
				toolName="generate_images"
				status="running"
			/>,
		)

		expect(vi.getTimerCount()).toBe(1)
		unmount()
		expect(vi.getTimerCount()).toBe(0)
	})

	it("renders a percentage for an image generation tool in progress", () => {
		vi.useFakeTimers()
		vi.setSystemTime(new Date("2026-01-01T00:00:00Z"))

		const { container } = render(
			<ToolGenerationProgress
				toolCallId="spec-running"
				toolName="generate_images"
				status="running"
			/>,
		)

		expect(readPercent(container)).toBe(1)
	})

	it("falls back to the fixed duration when no expected finish time is given", () => {
		vi.useFakeTimers()
		vi.setSystemTime(new Date("2026-01-01T00:00:00Z"))

		const { container } = render(
			<ToolGenerationProgress
				toolCallId="spec-fallback"
				toolName="generate_images"
				status="running"
			/>,
		)

		// 兜底 90 秒：走过 45 秒即一半。
		act(() => {
			vi.advanceTimersByTime(45_000)
		})
		expect(readPercent(container)).toBe(50)
	})

	it("keeps the anchor across a remount so the percentage never restarts", () => {
		vi.useFakeTimers()
		vi.setSystemTime(new Date("2026-01-01T00:00:00Z"))

		const first = render(
			<ToolGenerationProgress
				toolCallId="spec-remount"
				toolName="generate_images"
				status="running"
			/>,
		)
		expect(readPercent(first.container)).toBe(1)

		vi.setSystemTime(new Date("2026-01-01T00:00:30Z"))
		first.unmount()

		const second = render(
			<ToolGenerationProgress
				toolCallId="spec-remount"
				toolName="generate_images"
				status="running"
			/>,
		)

		// 重新挂载后如果重新取锚点，进度会退回 1%。
		expect(readPercent(second.container)).toBeGreaterThan(1)
	})

	it("drops the anchor once the tool finishes, so a new call starts fresh", () => {
		vi.useFakeTimers()
		vi.setSystemTime(new Date("2026-01-01T00:00:00Z"))

		const running = render(
			<ToolGenerationProgress
				toolCallId="spec-reuse"
				toolName="generate_images"
				status="running"
			/>,
		)
		running.unmount()

		vi.setSystemTime(new Date("2026-01-01T00:01:00Z"))
		const finished = render(
			<ToolGenerationProgress
				toolCallId="spec-reuse"
				toolName="generate_images"
				status="finished"
			/>,
		)
		expect(
			finished.container.querySelector("[data-testid='tool-generation-progress']"),
		).toBeNull()
		finished.unmount()

		const restarted = render(
			<ToolGenerationProgress
				toolCallId="spec-reuse"
				toolName="generate_images"
				status="running"
			/>,
		)

		expect(readPercent(restarted.container)).toBe(1)
	})

	it("uses the backend expected_finished_at to derive the percentage", () => {
		vi.useFakeTimers()
		vi.setSystemTime(new Date("2026-01-01T00:00:00Z"))

		const { container } = render(
			<ToolGenerationProgress
				toolCallId="spec-eta"
				toolName="generate_images"
				status="running"
				detail={{
					type: "generation_progress",
					data: { task_id: "IGT-eta", expected_finished_at: "2026-01-01T00:01:30Z" },
				}}
			/>,
		)
		// 刚挂载时起点即当前时间，进度从最小值开始。
		expect(readPercent(container)).toBe(1)

		// 后端预期 90s 完成，走过 30s 即 1/3。
		act(() => {
			vi.advanceTimersByTime(30_000)
		})
		expect(readPercent(container)).toBe(33)
	})

	it("anchors on the backend task id when the card has no tool call id", () => {
		vi.useFakeTimers()
		vi.setSystemTime(new Date("2026-01-01T00:00:00Z"))

		const detail = { type: "generation_progress", data: { task_id: "IGT-no-tool-id" } }
		const first = render(
			<ToolGenerationProgress toolName="generate_images" status="running" detail={detail} />,
		)
		expect(readPercent(first.container)).toBe(1)
		first.unmount()

		vi.setSystemTime(new Date("2026-01-01T00:00:30Z"))
		const second = render(
			<ToolGenerationProgress toolName="generate_images" status="running" detail={detail} />,
		)

		// 起点按 task_id 缓存，重挂载后接着走，而不是回到最小值。
		expect(readPercent(second.container)).toBeGreaterThan(1)
	})

	it("renders nothing when neither a tool call id nor a task id is available", () => {
		vi.useFakeTimers()
		vi.setSystemTime(new Date("2026-01-01T00:00:00Z"))

		const { container } = render(
			<ToolGenerationProgress toolName="generate_images" status="running" />,
		)

		// 没有键就缓存不住起点，宁可不显示进度条，也不显示一条每秒回到原点的假进度。
		expect(container.querySelector("[data-testid='tool-generation-progress']")).toBeNull()
	})
})
