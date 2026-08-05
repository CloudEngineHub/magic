import type { Canvas } from "../../core/Canvas"

export type ImageEditingMode = "crop" | "eraser" | "extend"

interface ActiveImageEditingMode {
	mode: ImageEditingMode
	elementId: string
	cancel: () => void
}

/**
 * 图片特殊编辑模式协调器。
 *
 * 只负责模式互斥与全局交互隔离，不持有裁剪、橡皮或扩展业务数据。
 */
export class ImageEditingCoordinator {
	private readonly canvas: Canvas
	private activeMode: ActiveImageEditingMode | null = null
	private markersVisibleBeforeEditing = true
	private markersListeningBeforeEditing = true

	constructor(options: { canvas: Canvas }) {
		this.canvas = options.canvas
	}

	public activate(next: ActiveImageEditingMode): void {
		if (this.activeMode?.mode === next.mode && this.activeMode.elementId === next.elementId) {
			return
		}

		const previous = this.activeMode
		previous?.cancel()
		if (this.activeMode === previous) {
			this.activeMode = null
			this.restoreMarkersLayer()
		}

		this.activeMode = next
		this.markersVisibleBeforeEditing = this.canvas.markersLayer.visible()
		this.markersListeningBeforeEditing = this.canvas.markersLayer.listening()
		// 裁剪会临时重算 Marker 位置，需要保留视觉预览；其他图片编辑态隐藏 Marker，避免遮挡代理。
		this.canvas.markersLayer.visible(
			next.mode === "crop" ? this.markersVisibleBeforeEditing : false,
		)
		this.canvas.markersLayer.listening(false)
		this.canvas.markersLayer.batchDraw()
	}

	public deactivate(mode: ImageEditingMode, elementId: string): void {
		if (this.activeMode?.mode !== mode || this.activeMode.elementId !== elementId) return

		this.activeMode = null
		this.restoreMarkersLayer()
	}

	public isActive(): boolean {
		return this.activeMode !== null
	}

	public getActiveMode(): ImageEditingMode | null {
		return this.activeMode?.mode ?? null
	}

	public destroy(): void {
		if (!this.activeMode) return
		this.activeMode = null
		this.restoreMarkersLayer()
	}

	private restoreMarkersLayer(): void {
		this.canvas.markersLayer.visible(this.markersVisibleBeforeEditing)
		this.canvas.markersLayer.listening(this.markersListeningBeforeEditing)
		this.canvas.markersLayer.batchDraw()
	}
}
