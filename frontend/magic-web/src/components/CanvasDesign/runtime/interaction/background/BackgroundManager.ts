import type { Canvas } from "../../core/Canvas"
import { createLeadingRafThrottle } from "../../shared/throttle"

/**
 * 背景管理器
 * 职责：
 * 1. 管理画布点阵背景的显示
 * 2. 通过容器级 CSS 实现无限平铺效果
 * 3. 背景随画布平移同步偏移，点尺寸与间距不随缩放变化
 */
export class BackgroundManager {
	private canvas: Canvas

	// 背景可见性控制
	private visible = true

	private readonly PATTERN_SIZE = 12
	private readonly DOT_SIZE = 0.5
	private readonly DOT_EDGE_SIZE = 1
	private readonly DOT_COLOR = "rgba(0, 0, 0, 0.15)"
	private readonly BACKGROUND_COLOR = "#fafafa"
	private readonly AURA_RADIUS = 140
	private readonly AURA_COLOR = "rgba(0, 0, 0, 0.6)"

	private readonly backgroundUpdateThrottle: ReturnType<typeof createLeadingRafThrottle<null>>
	private unsubscribers: Array<() => void> = []
	private lastBackgroundPosition = ""
	private lastBackgroundSize = ""
	private lastAuraMaskPosition = ""
	private lastVisibility: boolean | null = null
	private auraElement: HTMLDivElement | null = null
	private auraRaf = 0
	private auraNextX = 0
	private auraNextY = 0
	private auraVisible = false
	private auraContainerRect: DOMRectReadOnly | null = null

	constructor(options: { canvas: Canvas }) {
		const { canvas } = options
		this.canvas = canvas

		this.backgroundUpdateThrottle = createLeadingRafThrottle<null>(
			(value: null) => {
				void value
				this.applyBackgroundStyles()
			},
			{ enabled: true, leading: true },
		)

		this.setupEventListeners()
		this.setupCursorAuraListeners()
		this.scheduleBackgroundUpdate()
	}

	/**
	 * 对齐到当前 tile 尺寸范围内，避免 position 累积过大。
	 */
	private normalizeOffset(offset: number): number {
		const normalized = offset % this.PATTERN_SIZE
		return normalized >= 0 ? normalized : normalized + this.PATTERN_SIZE
	}

	/**
	 * 清理容器上的背景样式，回退到外层容器底色。
	 */
	private clearBackgroundStyles(): void {
		const { style } = this.canvas.container
		style.backgroundImage = ""
		style.backgroundRepeat = ""
		style.backgroundPosition = ""
		style.backgroundSize = ""
		style.backgroundColor = ""
		this.lastBackgroundPosition = ""
		this.lastBackgroundSize = ""
	}

	private ensureAuraElement(): HTMLDivElement {
		if (this.auraElement?.isConnected) {
			return this.auraElement
		}

		const auraElement = document.createElement("div")
		auraElement.setAttribute("aria-hidden", "true")

		const { style } = auraElement
		style.position = "absolute"
		style.inset = "0"
		style.pointerEvents = "none"
		style.opacity = "0"
		style.transition = "opacity 300ms ease-out"
		style.background = this.AURA_COLOR

		const dotMask = `radial-gradient(circle, #000 ${this.DOT_SIZE}px, transparent ${this.DOT_EDGE_SIZE}px)`
		const haloMask = `radial-gradient(
			circle ${this.AURA_RADIUS}px at var(--cursor-x, -9999px) var(--cursor-y, -9999px),
			#000 0%,
			rgba(0, 0, 0, 0.7) 35%,
			rgba(0, 0, 0, 0.25) 70%,
			transparent 100%
		)`

		style.setProperty("-webkit-mask-image", `${dotMask}, ${haloMask}`)
		style.setProperty(
			"-webkit-mask-size",
			`${this.PATTERN_SIZE}px ${this.PATTERN_SIZE}px, 100% 100%`,
		)
		style.setProperty("-webkit-mask-repeat", "repeat, no-repeat")
		style.setProperty("-webkit-mask-composite", "source-in")
		style.setProperty("mask-image", `${dotMask}, ${haloMask}`)
		style.setProperty("mask-size", `${this.PATTERN_SIZE}px ${this.PATTERN_SIZE}px, 100% 100%`)
		style.setProperty("mask-repeat", "repeat, no-repeat")
		style.setProperty("mask-composite", "intersect")

		const stageContent = this.canvas.container.querySelector(".konvajs-content")
		this.canvas.container.insertBefore(
			auraElement,
			stageContent ?? this.canvas.container.firstChild,
		)
		this.auraElement = auraElement

		return auraElement
	}

	private updateAuraMaskPosition(backgroundPosition: string): void {
		const auraElement = this.ensureAuraElement()
		const maskPosition = `${backgroundPosition}, 0 0`

		if (maskPosition !== this.lastAuraMaskPosition) {
			auraElement.style.setProperty("-webkit-mask-position", maskPosition)
			auraElement.style.setProperty("mask-position", maskPosition)
			this.lastAuraMaskPosition = maskPosition
		}
	}

	private flushAuraPosition = (): void => {
		this.auraRaf = 0
		if (!this.auraElement) return

		this.auraElement.style.setProperty("--cursor-x", `${this.auraNextX}px`)
		this.auraElement.style.setProperty("--cursor-y", `${this.auraNextY}px`)
	}

	private showAura(): void {
		if (!this.visible) return

		const auraElement = this.ensureAuraElement()
		if (this.auraVisible) return

		this.auraVisible = true
		auraElement.style.opacity = "1"
	}

	private hideAura = (): void => {
		if (!this.auraVisible) return

		this.auraVisible = false
		if (this.auraElement) {
			this.auraElement.style.opacity = "0"
		}
	}

	private refreshAuraContainerRect = (): DOMRectReadOnly => {
		const rect = this.canvas.container.getBoundingClientRect()
		this.auraContainerRect = rect
		return rect
	}

	private invalidateAuraContainerRect = (): void => {
		this.auraContainerRect = null
	}

	private handlePointerMove = (event: PointerEvent): void => {
		if (!this.visible) {
			this.hideAura()
			return
		}

		const rect = this.auraContainerRect ?? this.refreshAuraContainerRect()
		this.auraNextX = event.clientX - rect.left
		this.auraNextY = event.clientY - rect.top
		this.showAura()

		if (!this.auraRaf) {
			this.auraRaf = requestAnimationFrame(this.flushAuraPosition)
		}
	}

	private destroyAuraElement(): void {
		if (this.auraRaf) {
			cancelAnimationFrame(this.auraRaf)
			this.auraRaf = 0
		}

		this.auraElement?.remove()
		this.auraElement = null
		this.auraVisible = false
		this.auraContainerRect = null
		this.lastAuraMaskPosition = ""
	}

	/**
	 * 将背景样式同步到容器。
	 * 使用容器背景而不是 Konva 节点，可以天然获得无边界的无限平铺效果。
	 */
	private applyBackgroundStyles(): void {
		if (!this.visible) {
			if (this.lastVisibility !== false) {
				this.clearBackgroundStyles()
				this.hideAura()
				this.lastVisibility = false
			}
			return
		}

		const stagePosition = this.canvas.stage.position()
		const backgroundPosition = `${this.normalizeOffset(
			stagePosition.x,
		)}px ${this.normalizeOffset(stagePosition.y)}px`
		const backgroundSize = `${this.PATTERN_SIZE}px ${this.PATTERN_SIZE}px`
		const backgroundImage = `radial-gradient(circle, ${this.DOT_COLOR} ${this.DOT_SIZE}px, transparent ${this.DOT_EDGE_SIZE}px)`
		const { style } = this.canvas.container

		style.backgroundImage = backgroundImage
		style.backgroundRepeat = "repeat"
		style.backgroundColor = this.BACKGROUND_COLOR

		if (backgroundPosition !== this.lastBackgroundPosition) {
			style.backgroundPosition = backgroundPosition
			this.lastBackgroundPosition = backgroundPosition
		}

		this.updateAuraMaskPosition(backgroundPosition)

		if (backgroundSize !== this.lastBackgroundSize) {
			style.backgroundSize = backgroundSize
			this.lastBackgroundSize = backgroundSize
		}

		this.lastVisibility = true
	}

	/**
	 * 设置事件监听
	 */
	private setupEventListeners(): void {
		this.unsubscribers.push(
			this.canvas.eventEmitter.on("viewport:scale", this.scheduleBackgroundUpdate),
			this.canvas.eventEmitter.on("viewport:pan", this.scheduleBackgroundUpdate),
			this.canvas.eventEmitter.on("canvas:resize", this.scheduleBackgroundUpdate),
		)
	}

	private setupCursorAuraListeners(): void {
		const { container } = this.canvas

		container.addEventListener("pointerenter", this.refreshAuraContainerRect)
		container.addEventListener("pointermove", this.handlePointerMove)
		container.addEventListener("pointerleave", this.hideAura)
		container.addEventListener("pointercancel", this.hideAura)
		window.addEventListener("resize", this.invalidateAuraContainerRect)
		window.addEventListener("blur", this.hideAura)

		this.unsubscribers.push(
			() => container.removeEventListener("pointerenter", this.refreshAuraContainerRect),
			() => container.removeEventListener("pointermove", this.handlePointerMove),
			() => container.removeEventListener("pointerleave", this.hideAura),
			() => container.removeEventListener("pointercancel", this.hideAura),
			() => window.removeEventListener("resize", this.invalidateAuraContainerRect),
			() => window.removeEventListener("blur", this.hideAura),
		)
	}

	/**
	 * 背景样式更新：与 ViewportController 相同，使用 leadingRafThrottle（leading + RAF 尾随合并）。
	 */
	private scheduleBackgroundUpdate = (): void => {
		this.backgroundUpdateThrottle.processEvent(null)
	}

	/**
	 * 设置背景可见性
	 * @param visible - 是否可见
	 */
	public setVisible(visible: boolean): void {
		this.visible = visible
		this.scheduleBackgroundUpdate()
	}

	/**
	 * 获取背景可见性
	 */
	public isVisible(): boolean {
		return this.visible
	}

	/**
	 * 切换背景可见性
	 */
	public toggleVisible(): void {
		this.setVisible(!this.visible)
	}

	/**
	 * 销毁管理器
	 */
	public destroy(): void {
		this.backgroundUpdateThrottle.destroy()

		this.unsubscribers.forEach((unsubscribe) => unsubscribe())
		this.unsubscribers = []
		this.clearBackgroundStyles()
		this.destroyAuraElement()
	}
}
