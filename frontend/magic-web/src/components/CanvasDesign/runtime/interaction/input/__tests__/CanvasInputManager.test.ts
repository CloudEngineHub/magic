import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { Canvas } from "../../../core/Canvas"
import { CanvasInputManager } from "../CanvasInputManager"

class TestPointerEvent extends MouseEvent {
	constructor(
		type: string,
		init: MouseEventInit & { pointerId?: number; pointerType?: string } = {},
	) {
		super(type, init)
		Object.defineProperty(this, "pointerId", {
			value: init.pointerId ?? 1,
		})
		Object.defineProperty(this, "pointerType", {
			value: init.pointerType ?? "mouse",
		})
	}
}

type FakeNode = {
	id: () => string
	name: () => string
	getClassName: () => string
	getParent: () => FakeNode | null
}

function createNode(id: string, parent: FakeNode | null): FakeNode {
	return {
		id: () => id,
		name: () => "",
		getClassName: () => "Group",
		getParent: () => parent,
	}
}

function createTouchEvent(
	type: string,
	init: {
		clientX: number
		clientY: number
		identifier?: number
		touches?: Array<{ identifier: number; clientX: number; clientY: number }>
	} & Pick<MouseEventInit, "shiftKey" | "altKey" | "metaKey" | "ctrlKey">,
): TouchEvent {
	const touch = {
		identifier: init.identifier ?? 1,
		clientX: init.clientX,
		clientY: init.clientY,
	}
	const event = new Event(type, { bubbles: true, cancelable: true }) as TouchEvent
	Object.defineProperty(event, "changedTouches", {
		value: [touch],
	})
	Object.defineProperty(event, "touches", {
		value: init.touches ?? (type === "touchend" || type === "touchcancel" ? [] : [touch]),
	})
	Object.defineProperty(event, "shiftKey", {
		value: init.shiftKey ?? false,
	})
	Object.defineProperty(event, "altKey", {
		value: init.altKey ?? false,
	})
	Object.defineProperty(event, "metaKey", {
		value: init.metaKey ?? false,
	})
	Object.defineProperty(event, "ctrlKey", {
		value: init.ctrlKey ?? false,
	})
	return event
}

function createManager() {
	const handlers = new Map<string, Set<(event: { evt: Event; target: FakeNode }) => void>>()
	const emit = vi.fn()

	const stage = {
		id: () => "",
		name: () => "",
		getClassName: () => "Stage",
		getParent: () => null,
		on: vi.fn(
			(eventNames: string, handler: (event: { evt: Event; target: FakeNode }) => void) => {
				eventNames.split(" ").forEach((eventName) => {
					let eventHandlers = handlers.get(eventName)
					if (!eventHandlers) {
						eventHandlers = new Set()
						handlers.set(eventName, eventHandlers)
					}
					eventHandlers.add(handler)
				})
			},
		),
		off: vi.fn(
			(eventNames: string, handler: (event: { evt: Event; target: FakeNode }) => void) => {
				eventNames.split(" ").forEach((eventName) => {
					handlers.get(eventName)?.delete(handler)
				})
			},
		),
		container: () => ({
			getBoundingClientRect: () => ({
				left: 10,
				top: 20,
			}),
		}),
		getAbsoluteTransform: () => ({
			copy: () => ({
				invert: () => ({
					point: (point: { x: number; y: number }) => ({
						x: point.x + 100,
						y: point.y + 200,
					}),
				}),
			}),
		}),
	} as unknown as FakeNode & Canvas["stage"]

	const canvas = {
		stage,
		elementManager: {
			hasElement: (elementId: string) => elementId === "element-1",
		},
		eventEmitter: {
			emit,
		},
	} as unknown as Canvas

	const manager = new CanvasInputManager({ canvas })

	return {
		canvas,
		emit,
		manager,
		stage,
		emitStage: (eventName: string, event: Event, target: FakeNode = stage) => {
			handlers.get(eventName)?.forEach((handler) => handler({ evt: event, target }))
		},
	}
}

describe("CanvasInputManager", () => {
	beforeEach(() => {
		vi.stubGlobal("PointerEvent", TestPointerEvent)
	})

	afterEach(() => {
		vi.useRealTimers()
		vi.unstubAllGlobals()
		vi.restoreAllMocks()
	})

	it("normalizes pointer events with client, stage, and canvas coordinates", () => {
		const { emitStage, manager } = createManager()
		const received = vi.fn()

		manager.on("down", received)
		emitStage(
			"pointerdown",
			new TestPointerEvent("pointerdown", {
				button: 0,
				buttons: 1,
				clientX: 30,
				clientY: 50,
				pointerId: 7,
				pointerType: "pen",
			}),
		)

		expect(received).toHaveBeenCalledWith(
			expect.objectContaining({
				type: "down",
				pointerId: 7,
				pointerType: "pen",
				activePointerCount: 1,
				client: { x: 30, y: 50 },
				stage: { x: 20, y: 30 },
				canvas: { x: 120, y: 230 },
			}),
		)
	})

	it("clears active pointers on pointer cancel", () => {
		const { emitStage, manager } = createManager()
		const cancel = vi.fn()

		manager.on("cancel", cancel)
		emitStage(
			"pointerdown",
			new TestPointerEvent("pointerdown", {
				button: 0,
				buttons: 1,
				clientX: 0,
				clientY: 0,
				pointerId: 9,
				pointerType: "touch",
			}),
		)
		expect(manager.getActivePointerCount()).toBe(1)

		emitStage(
			"pointercancel",
			new TestPointerEvent("pointercancel", {
				buttons: 0,
				clientX: 0,
				clientY: 0,
				pointerId: 9,
				pointerType: "touch",
			}),
		)

		expect(manager.getActivePointerCount()).toBe(0)
		expect(cancel).toHaveBeenCalledWith(
			expect.objectContaining({
				type: "cancel",
				activePointerCount: 0,
			}),
		)
	})

	it("emits element context menu after a stationary long press", () => {
		vi.useFakeTimers()
		const { emit, emitStage, manager, stage } = createManager()
		const elementNode = createNode("element-1", stage)

		emitStage(
			"pointerdown",
			new TestPointerEvent("pointerdown", {
				button: 0,
				buttons: 1,
				clientX: 40,
				clientY: 60,
				pointerId: 3,
				pointerType: "touch",
			}),
			elementNode,
		)
		vi.advanceTimersByTime(500)

		expect(emit).toHaveBeenCalledWith({
			type: "element:contextmenu",
			data: {
				elementId: "element-1",
				x: 40,
				y: 60,
			},
		})
		manager.destroy()
	})

	it("cancels long press when the pointer moves past the threshold", () => {
		vi.useFakeTimers()
		const { emit, emitStage, manager, stage } = createManager()
		const elementNode = createNode("element-1", stage)

		emitStage(
			"pointerdown",
			new TestPointerEvent("pointerdown", {
				button: 0,
				buttons: 1,
				clientX: 40,
				clientY: 60,
				pointerId: 3,
				pointerType: "touch",
			}),
			elementNode,
		)
		emitStage(
			"pointermove",
			new TestPointerEvent("pointermove", {
				buttons: 1,
				clientX: 49,
				clientY: 60,
				pointerId: 3,
				pointerType: "touch",
			}),
			elementNode,
		)
		vi.advanceTimersByTime(500)

		expect(emit).not.toHaveBeenCalled()
		manager.destroy()
	})

	it("uses a listener snapshot while dispatching input", () => {
		const { emitStage, manager } = createManager()
		const addedDuringDispatch = vi.fn()
		const removedDuringDispatch = vi.fn()
		let unsubscribeRemovedDuringDispatch: () => void = () => {}
		const first = vi.fn(() => {
			unsubscribeRemovedDuringDispatch()
			manager.on("down", addedDuringDispatch)
		})

		manager.on("down", first)
		unsubscribeRemovedDuringDispatch = manager.on("down", removedDuringDispatch)
		emitStage(
			"pointerdown",
			new TestPointerEvent("pointerdown", {
				button: 0,
				buttons: 1,
				clientX: 30,
				clientY: 50,
				pointerId: 7,
				pointerType: "touch",
			}),
		)

		expect(first).toHaveBeenCalledTimes(1)
		expect(removedDuringDispatch).toHaveBeenCalledTimes(1)
		expect(addedDuringDispatch).not.toHaveBeenCalled()
	})

	it("suppresses fallback compatibility mouse events after touch input", () => {
		vi.useFakeTimers()
		vi.setSystemTime(1000)
		vi.unstubAllGlobals()
		Reflect.deleteProperty(window, "PointerEvent")
		const { emitStage, manager } = createManager()
		const received = vi.fn()

		manager.on("down", received)
		emitStage(
			"touchstart",
			createTouchEvent("touchstart", {
				clientX: 40,
				clientY: 60,
			}),
		)
		emitStage(
			"mousedown",
			new MouseEvent("mousedown", {
				button: 0,
				buttons: 1,
				clientX: 42,
				clientY: 62,
			}),
		)

		expect(received).toHaveBeenCalledTimes(1)
		expect(received).toHaveBeenCalledWith(
			expect.objectContaining({
				type: "down",
				pointerType: "touch",
				client: { x: 40, y: 60 },
			}),
		)
	})

	it("does not suppress fallback mouse events beyond time or distance thresholds", () => {
		vi.useFakeTimers()
		vi.setSystemTime(1000)
		vi.unstubAllGlobals()
		Reflect.deleteProperty(window, "PointerEvent")
		const { emitStage, manager } = createManager()
		const received = vi.fn()

		manager.on("down", received)
		emitStage("touchstart", createTouchEvent("touchstart", { clientX: 40, clientY: 60 }))
		vi.advanceTimersByTime(701)
		emitStage(
			"mousedown",
			new MouseEvent("mousedown", {
				button: 0,
				buttons: 1,
				clientX: 42,
				clientY: 62,
			}),
		)
		emitStage("touchstart", createTouchEvent("touchstart", { clientX: 40, clientY: 60 }))
		emitStage(
			"mousedown",
			new MouseEvent("mousedown", {
				button: 0,
				buttons: 1,
				clientX: 80,
				clientY: 100,
			}),
		)

		expect(received).toHaveBeenCalledTimes(4)
		expect(received.mock.calls[1]?.[0]).toEqual(
			expect.objectContaining({
				pointerType: "mouse",
				client: { x: 42, y: 62 },
			}),
		)
		expect(received.mock.calls[3]?.[0]).toEqual(
			expect.objectContaining({
				pointerType: "mouse",
				client: { x: 80, y: 100 },
			}),
		)
	})

	it("clears fallback touch state and listeners on destroy", () => {
		vi.unstubAllGlobals()
		Reflect.deleteProperty(window, "PointerEvent")
		const { emitStage, manager, stage } = createManager()

		emitStage(
			"touchstart",
			createTouchEvent("touchstart", {
				clientX: 40,
				clientY: 60,
			}),
		)
		expect(
			(manager as unknown as { recentTouchState: unknown }).recentTouchState,
		).not.toBeNull()
		expect(manager.getActivePointerCount()).toBe(1)

		manager.destroy()

		expect((manager as unknown as { recentTouchState: unknown }).recentTouchState).toBeNull()
		expect(manager.getActivePointerCount()).toBe(0)
		expect(stage.off).toHaveBeenCalledWith("mousedown touchstart", expect.any(Function))
		expect(stage.off).toHaveBeenCalledWith("mousemove touchmove", expect.any(Function))
		expect(stage.off).toHaveBeenCalledWith("mouseup touchend", expect.any(Function))
		expect(stage.off).toHaveBeenCalledWith("touchcancel", expect.any(Function))
	})
})
