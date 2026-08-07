import { describe, expect, it, vi } from "vitest"
import { MarkerManager } from "../MarkerManager"
import {
	ElementTypeEnum,
	MarkerTypeEnum,
	type ImageElementV2,
	type Marker,
} from "../../../document/types"
import type { Canvas } from "../../../core/Canvas"

function createMarker(id: string, versionId?: string): Marker {
	return {
		id,
		type: MarkerTypeEnum.Mark,
		elementId: "image-1",
		versionId,
		relativeX: 0.5,
		relativeY: 0.5,
	}
}

function createManager(activeVersionId = "v2") {
	const image: ImageElementV2 = {
		id: "image-1",
		type: ElementTypeEnum.Image,
		imageDslVersion: 2,
		activeVersionId,
		mainVersionId: "v1",
		versions: [
			{ id: "v1", src: "./images/v1.png", status: "completed" },
			{ id: "v2", src: "./images/v2.png", status: "completed" },
		],
	}
	const emit = vi.fn()
	const canvas = {
		elementManager: {
			getElementData: vi.fn((elementId: string) =>
				elementId === image.id ? image : undefined,
			),
			hasElement: vi.fn((elementId: string) => elementId === image.id),
		},
		eventEmitter: {
			on: vi.fn(() => vi.fn()),
			off: vi.fn(),
			emit,
		},
		permissionManager: {
			canCreateMarker: vi.fn(() => true),
			canAddImageMarker: vi.fn(() => true),
			canDeleteMarker: vi.fn(() => false),
		},
		runtimeScheduler: { requestLayerDraw: vi.fn() },
	} as unknown as Canvas
	const manager = new MarkerManager({ canvas })
	const internals = manager as unknown as {
		markers: Marker[]
		renderAllMarkers: ReturnType<typeof vi.fn>
		isMarkerVisible: (marker: Marker) => boolean
	}
	internals.renderAllMarkers = vi.fn()
	return { manager, internals, emit, image }
}

describe("MarkerManager image versions", () => {
	it("binds legacy markers to the first V2 version and emits marker updates", () => {
		const { manager, internals, emit } = createManager("v1")
		internals.markers = [createMarker("legacy"), createMarker("existing", "v2")]

		manager.bindMarkersToImageVersion("image-1", "v1")

		expect(manager.getMarker("legacy")?.versionId).toBe("v1")
		expect(manager.getMarker("existing")?.versionId).toBe("v2")
		expect(emit).toHaveBeenCalledWith({
			type: "marker:updated",
			data: { marker: manager.getMarker("legacy") },
		})
	})

	it("permanently removes every previous-version marker during a system version switch", () => {
		const { manager, internals, emit } = createManager("v2")
		internals.markers = [
			createMarker("old-1", "v1"),
			createMarker("old-2", "v1"),
			createMarker("current", "v2"),
		]

		manager.handleImageVersionChanged("image-1", "v1", "v2")

		expect(manager.exportMarkers().map((marker) => marker.id)).toEqual(["current"])
		expect(emit).toHaveBeenCalledWith({ type: "marker:deleted", data: { id: "old-1" } })
		expect(emit).toHaveBeenCalledWith({ type: "marker:deleted", data: { id: "old-2" } })
	})

	it("attaches loaded versionless markers to active and hides inactive versions", () => {
		const { manager, internals } = createManager("v2")
		manager.setMarkers([createMarker("legacy"), createMarker("inactive", "v1")])

		expect(manager.getMarker("legacy")?.versionId).toBe("v2")
		expect(internals.isMarkerVisible(manager.getMarker("legacy") as Marker)).toBe(true)
		expect(internals.isMarkerVisible(manager.getMarker("inactive") as Marker)).toBe(false)
	})
})
