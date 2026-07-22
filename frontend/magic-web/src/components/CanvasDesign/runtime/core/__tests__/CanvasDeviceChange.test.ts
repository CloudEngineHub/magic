import { describe, expect, it, vi } from "vitest"
import { Canvas } from "../Canvas"
import type { CanvasDeviceInfo } from "../../document/types"

function createDeviceInfo(overrides?: Partial<CanvasDeviceInfo>): CanvasDeviceInfo {
	return {
		formFactor: overrides?.formFactor ?? "desktop",
		layout: overrides?.layout ?? "regular",
		input: {
			touch: overrides?.input?.touch ?? false,
			coarsePointer: overrides?.input?.coarsePointer ?? false,
			hover: overrides?.input?.hover ?? true,
		},
	}
}

function createCanvasHarness(deviceInfo: CanvasDeviceInfo) {
	const canvas = Object.create(Canvas.prototype) as Canvas
	Object.assign(canvas, {
		deviceInfo,
		eventEmitter: {
			emit: vi.fn(),
		},
	})
	return canvas
}

describe("Canvas device info updates", () => {
	it("does not emit devicechange when device info is unchanged", () => {
		const deviceInfo = createDeviceInfo()
		const canvas = createCanvasHarness(deviceInfo)

		canvas.updateDeviceInfo(() => createDeviceInfo())

		expect(canvas.deviceInfo).toBe(deviceInfo)
		expect(canvas.eventEmitter.emit).not.toHaveBeenCalled()
	})

	it("emits devicechange with previous and current device info when changed", () => {
		const previous = createDeviceInfo()
		const current = createDeviceInfo({
			layout: "compact",
			input: {
				touch: true,
				coarsePointer: true,
				hover: false,
			},
		})
		const canvas = createCanvasHarness(previous)

		canvas.updateDeviceInfo(() => current)

		expect(canvas.deviceInfo).toBe(current)
		expect(canvas.eventEmitter.emit).toHaveBeenCalledWith({
			type: "canvas:devicechange",
			data: { previous, current },
		})
	})
})
