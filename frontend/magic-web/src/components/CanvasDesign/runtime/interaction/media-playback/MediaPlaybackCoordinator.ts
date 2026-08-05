import type { Canvas } from "../../core/Canvas"
import { VideoElement } from "../../elements/video/VideoElement"

/** 统一保证画布内音频和视频不会同时出声。 */
export class MediaPlaybackCoordinator {
	private readonly canvas: Canvas
	private readonly deselectUnsubscribe: () => void

	constructor(options: { canvas: Canvas }) {
		this.canvas = options.canvas
		this.deselectUnsubscribe = this.canvas.eventEmitter.on("element:deselect", () => {
			this.pauseAll()
			this.canvas.audioPlaybackManager.releaseAll()
		})
	}

	public preparePlayback(elementId: string): void {
		this.pauseAll(elementId)
	}

	public pauseAll(exceptElementId?: string): void {
		this.canvas.audioPlaybackManager.pauseAll(exceptElementId)
		this.canvas.elementManager.getAllElementIds().forEach((elementId) => {
			if (elementId === exceptElementId) return
			const element = this.canvas.elementManager.getElementInstance(elementId)
			if (element instanceof VideoElement) {
				element.pausePreview()
			}
		})
	}

	public destroy(): void {
		this.deselectUnsubscribe()
		this.pauseAll()
	}
}
