import { describe, expect, it, vi } from "vitest"
import { Canvas } from "../Canvas"

describe("Canvas destroy", () => {
	it("closes image editing sessions before destroying their dependencies", () => {
		const destroyOrder: string[] = []
		const destroyable = (name: string) => ({
			destroy: vi.fn(() => destroyOrder.push(name)),
		})
		const canvas = Object.create(Canvas.prototype) as Canvas

		Object.assign(canvas, {
			visibilityManager: destroyable("visibilityManager"),
			imagePresentationScheduler: destroyable("imagePresentationScheduler"),
			resourceUrlWarmupManager: destroyable("resourceUrlWarmupManager"),
			resourceScheduler: destroyable("resourceScheduler"),
			runtimeScheduler: destroyable("runtimeScheduler"),
			resizeObserver: null,
			containerContextMenuHandler: null,
			stageContextMenuHandler: null,
			handleWindowClick: null,
			cropManager: destroyable("cropManager"),
			extendManager: destroyable("extendManager"),
			eraserManager: destroyable("eraserManager"),
			imageEditingCoordinator: destroyable("imageEditingCoordinator"),
			generationRuntimeManager: destroyable("generationRuntimeManager"),
			eventEmitter: {
				removeAllListeners: vi.fn(() => destroyOrder.push("eventEmitter")),
			},
			dropOverlayManager: destroyable("dropOverlayManager"),
			cursorManager: destroyable("cursorManager"),
			permissionManager: destroyable("permissionManager"),
			imageBatchPollingRegistry: destroyable("imageBatchPollingRegistry"),
			elementManager: destroyable("elementManager"),
			geometryCacheManager: destroyable("geometryCacheManager"),
			connectionManager: destroyable("connectionManager"),
			connectionDragManager: destroyable("connectionDragManager"),
			connectionHandleOverlayManager: destroyable("connectionHandleOverlayManager"),
			viewportController: destroyable("viewportController"),
			selectionManager: destroyable("selectionManager"),
			transformManager: destroyable("transformManager"),
			hoverManager: destroyable("hoverManager"),
			videoSelectionPlaybackManager: destroyable("videoSelectionPlaybackManager"),
			videoPlaybackInteractionManager: destroyable("videoPlaybackInteractionManager"),
			toolManager: destroyable("toolManager"),
			inputManager: destroyable("inputManager"),
			keyboardManager: destroyable("keyboardManager"),
			alignmentManager: destroyable("alignmentManager"),
			frameManager: destroyable("frameManager"),
			historyManager: destroyable("historyManager"),
			markerManager: destroyable("markerManager"),
			snapGuideManager: destroyable("snapGuideManager"),
			elementRenameManager: destroyable("elementRenameManager"),
			textEditingManager: destroyable("textEditingManager"),
			textFormattingManager: destroyable("textFormattingManager"),
			nameLabelManager: destroyable("nameLabelManager"),
			sizeLabelManager: destroyable("sizeLabelManager"),
			backgroundManager: destroyable("backgroundManager"),
			canvasFileUploadManager: destroyable("canvasFileUploadManager"),
			imageResourceManager: destroyable("imageResourceManager"),
			submitImageWorkerManager: destroyable("submitImageWorkerManager"),
			videoPlaybackManager: destroyable("videoPlaybackManager"),
			videoResourceManager: destroyable("videoResourceManager"),
			mediaResourceOfflineCacheManager: destroyable("mediaResourceOfflineCacheManager"),
			pluginManager: destroyable("pluginManager"),
			stage: destroyable("stage"),
		})

		canvas.destroy()

		const eventEmitterIndex = destroyOrder.indexOf("eventEmitter")
		const dependencyIndexes = [
			"cursorManager",
			"elementManager",
			"selectionManager",
			"markerManager",
		].map((name) => destroyOrder.indexOf(name))
		for (const managerName of [
			"cropManager",
			"extendManager",
			"eraserManager",
			"imageEditingCoordinator",
		]) {
			const managerIndex = destroyOrder.indexOf(managerName)
			expect(managerIndex).toBeGreaterThanOrEqual(0)
			expect(managerIndex).toBeLessThan(eventEmitterIndex)
			dependencyIndexes.forEach((dependencyIndex) => {
				expect(managerIndex).toBeLessThan(dependencyIndex)
			})
		}
	})
})
