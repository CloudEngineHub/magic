import type Konva from "konva"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { Canvas } from "../../../core/Canvas"
import { EventEmitter } from "../../../core/EventEmitter"
import { StoryboardFieldOverlayHost } from "../StoryboardFieldOverlayHost"

function createHarness() {
	const container = document.createElement("div")
	document.body.appendChild(container)
	const eventEmitter = new EventEmitter()
	let matrix = [0.75, 0, 0, 0.75, 120, 80]
	let mounted = true
	const anchorNode = {
		getStage: () => (mounted ? {} : null),
		getAbsoluteTransform: () => ({ getMatrix: () => matrix }),
		width: () => 320,
		height: () => 120,
	} as unknown as Konva.Node
	const canvas = {
		stage: { container: () => container },
		eventEmitter,
	} as unknown as Canvas

	return {
		container,
		eventEmitter,
		anchorNode,
		canvas,
		setMatrix: (next: number[]) => {
			matrix = next
		},
		unmountAnchor: () => {
			mounted = false
		},
	}
}

describe("StoryboardFieldOverlayHost", () => {
	afterEach(() => {
		document.body.innerHTML = ""
		vi.restoreAllMocks()
	})

	it("tracks the Konva absolute transform and commits a draft exactly once", () => {
		const harness = createHarness()
		const onCommit = vi.fn()
		const host = new StoryboardFieldOverlayHost({ canvas: harness.canvas })
		host.mount({
			kind: "textarea",
			anchorNode: harness.anchorNode,
			ariaLabel: "分镜画面描述",
			value: "初始描述",
			fontSize: 15,
			borderRadius: 9,
			onCommit,
		})

		const wrapper = harness.container.querySelector<HTMLDivElement>(
			"[data-canvas-ui='storyboard-field-overlay']",
		)
		const textarea = wrapper?.querySelector("textarea")
		expect(wrapper?.style.transform).toBe("matrix(0.75, 0, 0, 0.75, 120, 80)")
		expect(wrapper?.style.width).toBe("320px")
		expect(wrapper?.style.height).toBe("120px")
		expect(textarea?.selectionStart).toBe("初始描述".length)
		expect(textarea?.selectionEnd).toBe("初始描述".length)

		harness.setMatrix([1.1, 0, 0, 1.1, 42, 24])
		harness.eventEmitter.emit({ type: "viewport:pan", data: { x: 42, y: 24 } })
		expect(wrapper?.style.transform).toBe("matrix(1.1, 0, 0, 1.1, 42, 24)")

		if (!textarea) throw new Error("Expected textarea overlay")
		textarea.value = "新的描述"
		textarea.dispatchEvent(new FocusEvent("blur"))
		host.commit()

		expect(onCommit).toHaveBeenCalledTimes(1)
		expect(onCommit).toHaveBeenCalledWith("新的描述")
		expect(host.isMounted()).toBe(false)
	})

	it("cancels without committing when the anchor leaves the stage", () => {
		const harness = createHarness()
		const onCommit = vi.fn()
		const onCancel = vi.fn()
		const host = new StoryboardFieldOverlayHost({ canvas: harness.canvas })
		host.mount({
			kind: "number",
			anchorNode: harness.anchorNode,
			ariaLabel: "分镜时长",
			value: "3",
			fontSize: 15,
			borderRadius: 8,
			onCommit,
			onCancel,
		})
		const input = harness.container.querySelector<HTMLInputElement>(
			"[data-canvas-ui='storyboard-field-overlay'] input",
		)
		expect(input?.type).toBe("text")
		expect(input?.inputMode).toBe("decimal")
		expect(input?.selectionStart).toBe(1)
		expect(input?.selectionEnd).toBe(1)

		harness.unmountAnchor()
		harness.eventEmitter.emit({ type: "viewport:scale", data: { scale: 0.5 } })

		expect(onCancel).toHaveBeenCalledTimes(1)
		expect(onCommit).not.toHaveBeenCalled()
		expect(host.isMounted()).toBe(false)
	})
})
