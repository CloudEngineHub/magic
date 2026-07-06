import Konva from "konva"
import { BaseTool, type ToolOptions } from "./BaseTool"
import { generateElementId } from "../../shared/ids"
import type { CanvasPointerInput } from "../input/index"

/**
 * 基础绘制工具配置接口
 */
export interface BaseDrawingToolOptions extends ToolOptions {}

/**
 * 基础绘制工具抽象类
 * 提供绘制工具的通用逻辑，包括鼠标事件处理、键盘事件处理等
 */
export abstract class BaseDrawingTool extends BaseTool {
	protected isDrawing = false
	protected startPoint: { x: number; y: number } | null = null
	protected currentElementId: string | null = null
	protected previewNode: Konva.Node | null = null
	private inputUnsubscribers: Array<() => void> = []

	constructor(options: BaseDrawingToolOptions) {
		super(options)
	}

	/**
	 * 激活工具
	 */
	public activate(): void {
		this.isActive = true

		this.inputUnsubscribers = [
			this.canvas.inputManager.on("down", this.handlePointerDown),
			this.canvas.inputManager.on("move", this.handlePointerMove),
			this.canvas.inputManager.on("up", this.handlePointerUp),
			this.canvas.inputManager.on("cancel", this.handlePointerCancel),
		]
		window.addEventListener("keydown", this.handleKeyDown)
	}

	/**
	 * 停用工具
	 */
	public deactivate(): void {
		this.isActive = false

		// 清理预览
		this.clearPreview()

		this.inputUnsubscribers.forEach((unsubscribe) => unsubscribe())
		this.inputUnsubscribers = []
		window.removeEventListener("keydown", this.handleKeyDown)

		// 重置状态
		this.resetDrawingState()
	}

	private handlePointerDown = (input: CanvasPointerInput): void => {
		if (!this.isActive) return
		if (input.button !== 0 || input.activePointerCount > 1) return

		// 如果点击在已有元素上，不开始绘制
		if (input.target !== this.canvas.stage) return

		this.preventDefaultForDirectInput(input)

		// 取消所有元素的选中状态
		this.canvas.selectionManager.deselectAll()

		// 开始绘制
		this.startDrawing(input.canvas)
	}

	private handlePointerMove = (input: CanvasPointerInput): void => {
		if (!this.isDrawing || !this.startPoint) return

		if (input.activePointerCount > 1) {
			this.cancelDrawing()
			return
		}

		this.preventDefaultForDirectInput(input)

		const width = input.canvas.x - this.startPoint.x
		const height = input.canvas.y - this.startPoint.y

		// 更新预览
		this.updatePreview(this.startPoint.x, this.startPoint.y, width, height)
	}

	private handlePointerUp = (input: CanvasPointerInput): void => {
		if (!this.isDrawing || !this.startPoint || !this.currentElementId) return

		this.preventDefaultForDirectInput(input)

		const width = input.canvas.x - this.startPoint.x
		const height = input.canvas.y - this.startPoint.y

		// 只有当尺寸大于最小阈值时才创建元素
		const minSize = 5
		if (Math.abs(width) > minSize && Math.abs(height) > minSize) {
			// 标准化坐标和尺寸（处理负值情况）
			const x = width < 0 ? this.startPoint.x + width : this.startPoint.x
			const y = height < 0 ? this.startPoint.y + height : this.startPoint.y
			// 将宽高转换为整数
			const normalizedWidth = Math.round(Math.abs(width))
			const normalizedHeight = Math.round(Math.abs(height))

			// 创建元素
			const elementId = this.createElement(x, y, normalizedWidth, normalizedHeight)

			// 选中新创建的元素
			if (elementId) {
				this.canvas.selectionManager.selectMultiple([elementId])
				// 绘制完成后切回选择工具
				this.onTaskComplete()
			}
		}

		// 清理状态
		this.finishDrawing()
	}

	private handlePointerCancel = (): void => {
		if (!this.isDrawing) return
		this.cancelDrawing()
	}

	/**
	 * 处理键盘按下事件
	 */
	private handleKeyDown = (e: KeyboardEvent): void => {
		// 如果正在绘制且按下 ESC 键，取消绘制
		if (this.isDrawing && e.key === "Escape") {
			e.preventDefault()
			this.cancelDrawing()
		}
	}

	private preventDefaultForDirectInput(input: CanvasPointerInput): void {
		if (input.pointerType === "mouse") return
		if (input.nativeEvent.cancelable) {
			input.nativeEvent.preventDefault()
		}
	}

	/**
	 * 开始绘制
	 */
	protected startDrawing(canvasPos: { x: number; y: number }): void {
		this.isDrawing = true
		this.startPoint = canvasPos
		this.currentElementId = generateElementId()

		// 创建预览
		this.createPreview(canvasPos.x, canvasPos.y, 0, 0)
	}

	/**
	 * 完成绘制
	 */
	protected finishDrawing(): void {
		this.clearPreview()
		this.resetDrawingState()
	}

	/**
	 * 取消绘制
	 */
	protected cancelDrawing(): void {
		this.clearPreview()
		this.resetDrawingState()
	}

	/**
	 * 重置绘制状态
	 */
	protected resetDrawingState(): void {
		this.isDrawing = false
		this.startPoint = null
		this.currentElementId = null
	}

	/**
	 * 获取当前最大的 zIndex（顶层元素的下一个 zIndex）
	 * 因为新元素总是创建在顶层，所以使用顶层元素的下一个 zIndex
	 */
	protected getNextZIndex(): number {
		return this.canvas.elementManager.getNextZIndexInLevel()
	}

	/**
	 * 创建预览（子类实现）
	 */
	protected abstract createPreview(x: number, y: number, width: number, height: number): void

	/**
	 * 更新预览（子类实现）
	 */
	protected abstract updatePreview(x: number, y: number, width: number, height: number): void

	/**
	 * 清除预览（子类实现）
	 */
	protected abstract clearPreview(): void

	/**
	 * 获取工具元数据
	 */
	public getMetadata() {
		return {
			name: "Drawing Tool",
			cursor: "crosshair" as const,
			isTemporary: false,
		}
	}

	/**
	 * 创建元素（子类实现）
	 * @returns 创建的元素 ID
	 */
	protected abstract createElement(
		x: number,
		y: number,
		width: number,
		height: number,
	): string | null
}
