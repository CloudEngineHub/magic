import { createElement } from "react"
import { flushSync } from "react-dom"
import { createRoot, type Root } from "react-dom/client"
import type Konva from "konva"
import type { Canvas } from "../../core/Canvas"
import { StoryboardSelectOverlay } from "./StoryboardSelectOverlay"

export interface StoryboardSelectOption {
	label: string
	value: string
	icon?: string
	secondaryLabel?: string
	preview?: {
		iconWidth: number
		iconHeight: number
	}
}

export interface StoryboardSelectGroup {
	id: string
	label: string
	icon?: string
	options: StoryboardSelectOption[]
}

export type StoryboardFieldOverlayMountOptions = {
	anchorNode: Konva.Node
	ariaLabel: string
	value: string
	fontSize: number
	borderRadius: number
	onCommit: (value: string) => void
	onCancel?: () => void
} & (
	| {
			kind: "select"
			options: StoryboardSelectOption[]
			groups?: StoryboardSelectGroup[]
			horizontalPadding: number
			suffixGap: number
			suffixIconSize: number
			modelIconUrl?: string
			modelIconSize?: number
			modelIconGap?: number
	  }
	| {
			kind: "textarea"
			placeholder?: string
	  }
	| {
			kind: "number"
			step?: string
			min?: string
	  }
)

type StoryboardFieldControl = HTMLTextAreaElement | HTMLInputElement

/**
 * 分镜字段的临时 DOM 编辑层。
 *
 * 常态渲染仍完全由 Konva 负责；只有用户实际编辑时才在 stage container 内挂载
 * 临时表单控件。文本和数字输入使用原生控件，枚举字段复用画布 Select primitive。
 * 定位直接复用 Konva 绝对变换矩阵，能够覆盖视口缩放、平移、Frame 嵌套与元素旋转，
 * 且不会在输入过程中持续写入画布历史。
 */
export class StoryboardFieldOverlayHost {
	private readonly canvas: Canvas
	private wrapper: HTMLDivElement | null = null
	private control: StoryboardFieldControl | null = null
	private selectRoot: Root | null = null
	private options: StoryboardFieldOverlayMountOptions | null = null
	private finishing = false
	private eventUnsubscribers: Array<() => void> = []

	constructor(options: { canvas: Canvas }) {
		this.canvas = options.canvas
	}

	public isMounted(): boolean {
		return Boolean(this.wrapper && (this.control || this.selectRoot) && this.options)
	}

	public mount(options: StoryboardFieldOverlayMountOptions): void {
		this.cancel()
		this.options = options
		this.finishing = false

		const wrapper = document.createElement("div")
		wrapper.dataset.canvasUi = "storyboard-field-overlay"
		wrapper.style.position = "absolute"
		wrapper.style.left = "0"
		wrapper.style.top = "0"
		wrapper.style.zIndex = "1001"
		wrapper.style.transformOrigin = "0 0"
		wrapper.style.pointerEvents = "auto"

		this.canvas.stage.container().appendChild(wrapper)
		this.wrapper = wrapper

		if (options.kind === "select") {
			const selectContainer = document.createElement("div")
			selectContainer.style.width = "100%"
			selectContainer.style.height = "100%"
			wrapper.appendChild(selectContainer)
			this.selectRoot = createRoot(selectContainer)
			flushSync(() => {
				this.selectRoot?.render(
					createElement(StoryboardSelectOverlay, {
						...options,
						onCommit: (value) => this.commitValue(value),
						onCancel: () => this.cancel(),
					}),
				)
			})
		} else {
			const control = this.createControl(options)
			wrapper.appendChild(control)
			this.control = control
		}

		this.bindDomEventBoundary(wrapper)
		this.bindCanvasEvents()
		this.updatePosition()
		if (this.control) this.focusControl(this.control)
	}

	public commit(): void {
		if (!this.options || this.finishing) return
		this.commitValue(this.control?.value ?? this.options.value)
	}

	public cancel(): void {
		if (!this.options || this.finishing) {
			this.unmount()
			return
		}
		this.finishing = true
		const onCancel = this.options.onCancel
		this.unmount()
		onCancel?.()
	}

	public updatePosition(): void {
		if (!this.wrapper || !this.options) return
		const anchor = this.options.anchorNode
		if (!anchor.getStage()) {
			this.cancel()
			return
		}

		const [a, b, c, d, e, f] = anchor.getAbsoluteTransform().getMatrix()
		this.wrapper.style.width = `${Math.max(1, anchor.width())}px`
		this.wrapper.style.height = `${Math.max(1, anchor.height())}px`
		this.wrapper.style.transform = `matrix(${a}, ${b}, ${c}, ${d}, ${e}, ${f})`
	}

	public destroy(): void {
		this.cancel()
	}

	private createControl(
		options: Exclude<StoryboardFieldOverlayMountOptions, { kind: "select" }>,
	): StoryboardFieldControl {
		let control: StoryboardFieldControl
		if (options.kind === "textarea") {
			const textarea = document.createElement("textarea")
			textarea.value = options.value
			textarea.placeholder = options.placeholder ?? ""
			textarea.wrap = "soft"
			textarea.style.resize = "none"
			textarea.style.lineHeight = "1.45"
			control = textarea
		} else {
			const input = document.createElement("input")
			// 使用文本输入 + decimal 键盘，避免浏览器原生 number spinner 干扰紧凑布局。
			input.type = "text"
			input.value = options.value
			input.inputMode = "decimal"
			input.autocomplete = "off"
			input.spellcheck = false
			input.style.textAlign = "center"
			control = input
		}

		control.setAttribute("aria-label", options.ariaLabel)
		control.style.width = "100%"
		control.style.height = "100%"
		control.style.boxSizing = "border-box"
		control.style.margin = "0"
		control.style.padding = options.kind === "textarea" ? "10px 12px" : "0 12px"
		control.style.border = "2px solid #5B6EF5"
		control.style.borderRadius = `${Math.max(0, options.borderRadius)}px`
		control.style.outline = "none"
		control.style.background = "rgba(255, 255, 255, 0.98)"
		control.style.color = "#272A31"
		control.style.fontFamily = "Arial, PingFang SC, sans-serif"
		// 16px 可避免 iOS Safari 聚焦原生输入框时强制放大页面。
		control.style.fontSize = `${Math.max(16, options.fontSize)}px`
		control.style.boxShadow = "0 4px 16px rgba(36, 49, 87, 0.14)"

		control.addEventListener("keydown", (event) => {
			event.stopPropagation()
			if (event.key === "Escape") {
				event.preventDefault()
				this.cancel()
				return
			}
			if (
				event.key === "Enter" &&
				(options.kind === "number" ||
					(options.kind === "textarea" && (event.metaKey || event.ctrlKey)))
			) {
				event.preventDefault()
				this.commit()
			}
		})
		control.addEventListener("blur", () => this.commit())
		return control
	}

	private commitValue(value: string): void {
		if (!this.options || this.finishing) return
		this.finishing = true
		const onCommit = this.options.onCommit
		this.unmount()
		onCommit(value)
	}

	private focusControl(control: StoryboardFieldControl): void {
		try {
			control.focus({ preventScroll: true })
		} catch {
			control.focus()
		}

		const end = control.value.length
		control.setSelectionRange(end, end)
	}

	private bindDomEventBoundary(wrapper: HTMLDivElement): void {
		const stopPropagation = (event: Event) => event.stopPropagation()
		const eventNames = [
			"pointerdown",
			"pointerup",
			"mousedown",
			"mouseup",
			"touchstart",
			"touchend",
			"click",
			"dblclick",
			"contextmenu",
			"keydown",
			"keyup",
			"wheel",
		] as const
		eventNames.forEach((eventName) => wrapper.addEventListener(eventName, stopPropagation))
		this.eventUnsubscribers.push(() => {
			eventNames.forEach((eventName) =>
				wrapper.removeEventListener(eventName, stopPropagation),
			)
		})
	}

	private bindCanvasEvents(): void {
		const updatePosition = () => this.updatePosition()
		this.eventUnsubscribers.push(
			this.canvas.eventEmitter.on("viewport:scale", updatePosition),
			this.canvas.eventEmitter.on("viewport:pan", updatePosition),
			this.canvas.eventEmitter.on("canvas:resize", updatePosition),
			this.canvas.eventEmitter.on("elements:transform:dragmove", updatePosition),
			this.canvas.eventEmitter.on("elements:transform:anchorDragmove", updatePosition),
			this.canvas.eventEmitter.on("element:updated", updatePosition),
			this.canvas.eventEmitter.on("element:rerendered", updatePosition),
		)
	}

	private unmount(): void {
		this.eventUnsubscribers.forEach((unsubscribe) => unsubscribe())
		this.eventUnsubscribers = []
		this.selectRoot?.unmount()
		this.selectRoot = null
		this.wrapper?.remove()
		this.wrapper = null
		this.control = null
		this.options = null
		this.finishing = false
	}
}
