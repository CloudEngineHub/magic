import { Link2, Maximize2, PlusIcon, X } from "lucide-react"
import {
	Fragment,
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
	type CSSProperties,
	type ReactNode,
	type RefCallback,
} from "react"
import ReferenceMediaPreview from "../../previews/reference-media/index"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"
import { Tooltip, TooltipContent, TooltipTrigger } from "../../primitives/shadcn/tooltip"
import { usePortalContainer } from "../../primitives/custom/PortalContainerContext"
import { Checkbox } from "../../primitives/shadcn/checkbox"
import styles from "./SourceList.module.css"
import { cn } from "../../../runtime/shared/lib/utils"
import { getMediaResourcePathKind } from "../../../runtime/resources/media-common/mediaResourcePathKind"
import { getCanvasResourceFileName } from "../../../runtime/shared/path/canvasResourcePath"
import type { MediaResourceFullscreenPreviewItem } from "../../fullscreen/media-resource/index"
import type { CropConfig } from "../../../runtime/document/types"

const DEFAULT_OVERLAY_SLOT_ORDINALS: [number, number] = [0, 1]

export interface SourceListSelectionOption {
	checked: boolean
	disabled?: boolean
	ariaLabel: string
	title?: string
	onCheckedChange: (checked: boolean) => void
}

/** 素材槽位：空槽为「+ 标签」；已配置时由列表内置铺满预览与 hover 删除 */
export interface SourceListSlotOption {
	kind: "slot"
	label: string
	secondaryLabel?: string
	value: string
	slotIndex: number
	/** 可选分组：供业务层传递资源类别，列表本身不展示分组标题 */
	groupId?: string
	/** 已选资源路径，有值时渲染预览 + hover 删除，不再使用默认「+」内容 */
	resourcePath?: string
	resourceFileName?: string
	/** 已配置资源的状态标签，例如首帧/尾帧分配状态 */
	resourceStatusLabel?: string
	sourceCrop?: CropConfig
	/** 只读资源：可预览/移除，但点击槽位不会进入替换选择流程 */
	readOnly?: boolean
	/** 是否为连线媒体；仅用于在资源左上角显示关联图标 */
	isLinked?: boolean
	/** 可选选择能力：用于将槽位作为候选资源，由业务层控制是否参与提交 */
	selection?: SourceListSelectionOption
	onRemoveResource?: () => void
	/** 删除按钮无障碍标签 */
	removeResourceAriaLabel?: string
	onPreviewResource?: (resource: MediaResourceFullscreenPreviewItem) => void
	/** 预览按钮无障碍标签 */
	previewResourceAriaLabel?: string
}

/**
 * 叠在列表区域几何中心，不占 flex 文档流；内容由 `render` 完全自定义（如圆形图标按钮）。
 * 多个 overlay 按顺序叠在同一锚点上，由调用方控制层级与内容。
 */
export interface SourceListOverlayOption {
	kind: "overlay"
	value: string
	/** 覆盖层定位的两个槽位序号；未传时默认定位前两个槽位 */
	betweenSlotOrdinals?: [number, number]
	render: () => ReactNode
}

export type SourceListOption = SourceListSlotOption | SourceListOverlayOption

export function isSourceListSlotOption(entry: SourceListOption): entry is SourceListSlotOption {
	return entry.kind === "slot"
}

export function isSourceListOverlayOption(
	entry: SourceListOption,
): entry is SourceListOverlayOption {
	return entry.kind === "overlay"
}

export interface SourceListRenderItemParams {
	option: SourceListSlotOption
	index: number
	className: string
	style: CSSProperties
	content: ReactNode
	/** SourceList 内置的槽位点击行为；自定义 renderItem 需挂到槽位根节点 */
	onClick?: () => void
	/** 有 overlay 且需按槽位定位时，由列表传入并挂到槽位根节点（用于测量两槽中点） */
	slotRootRef?: RefCallback<HTMLDivElement | null>
}

interface SourceListProps {
	options?: SourceListOption[]
	className?: string
	style?: CSSProperties
	renderItem?: (params: SourceListRenderItemParams) => ReactNode
}

/** 视频/图片编辑器顶部素材槽位列表（首帧 / 尾帧 / 参考素材等） */
export default function SourceList(props: SourceListProps) {
	const { className, style, options, renderItem } = props
	const portalContainer = usePortalContainer()

	const entries = options ?? []
	const slotEntries = entries.filter(isSourceListSlotOption)
	const overlayEntries = entries.filter(isSourceListOverlayOption)
	const slotCount = slotEntries.length
	const overlaySlotOrdinals =
		overlayEntries[0]?.betweenSlotOrdinals ?? DEFAULT_OVERLAY_SLOT_ORDINALS
	const measureOverlayBetweenSlots =
		overlayEntries.length > 0 &&
		overlaySlotOrdinals.every((ordinal) => ordinal >= 0 && ordinal < slotCount)

	const listRef = useRef<HTMLDivElement | null>(null)
	const slotElRefs = useRef<(HTMLDivElement | null)[]>([])
	const [overlayPos, setOverlayPos] = useState<{ x: number; y: number } | null>(null)

	const updateOverlayBetweenSlots = useCallback(() => {
		if (!measureOverlayBetweenSlots) {
			setOverlayPos(null)
			return
		}
		const list = listRef.current
		const a = slotElRefs.current[overlaySlotOrdinals[0]]
		const b = slotElRefs.current[overlaySlotOrdinals[1]]
		if (!list || !a || !b) return
		const lr = list.getBoundingClientRect()
		const ar = a.getBoundingClientRect()
		const br = b.getBoundingClientRect()
		const midX = (ar.left + ar.width / 2 + br.left + br.width / 2) / 2 - lr.left
		const midY = (ar.top + ar.height / 2 + br.top + br.height / 2) / 2 - lr.top
		setOverlayPos({ x: midX, y: midY })
	}, [measureOverlayBetweenSlots, overlaySlotOrdinals])

	useLayoutEffect(() => {
		updateOverlayBetweenSlots()
		let raf2 = 0
		const raf1 = requestAnimationFrame(() => {
			raf2 = requestAnimationFrame(updateOverlayBetweenSlots)
		})
		const t = window.setTimeout(updateOverlayBetweenSlots, 320)
		return () => {
			cancelAnimationFrame(raf1)
			cancelAnimationFrame(raf2)
			window.clearTimeout(t)
		}
	}, [updateOverlayBetweenSlots, slotCount, overlayEntries.length])

	useEffect(() => {
		if (!measureOverlayBetweenSlots) return
		const ro = new ResizeObserver(() => updateOverlayBetweenSlots())
		const list = listRef.current
		if (list) ro.observe(list)
		const observeSlots = () => {
			const a = slotElRefs.current[overlaySlotOrdinals[0]]
			const b = slotElRefs.current[overlaySlotOrdinals[1]]
			if (a) ro.observe(a)
			if (b) ro.observe(b)
		}
		observeSlots()
		queueMicrotask(observeSlots)
		window.addEventListener("resize", updateOverlayBetweenSlots)
		return () => {
			ro.disconnect()
			window.removeEventListener("resize", updateOverlayBetweenSlots)
		}
	}, [measureOverlayBetweenSlots, overlaySlotOrdinals, updateOverlayBetweenSlots])

	let slotOrdinal = 0
	return (
		<div className={cn(styles.root, className)} style={style} data-video-editor-source-list="">
			<div ref={listRef} className={styles.sourceList}>
				{slotEntries.map((entry) => {
					const slotIndexInList = slotOrdinal
					slotOrdinal += 1
					const slotRootRef: RefCallback<HTMLDivElement | null> | undefined =
						measureOverlayBetweenSlots && overlaySlotOrdinals.includes(slotIndexInList)
							? (el) => {
									slotElRefs.current[slotIndexInList] = el
								}
							: undefined
					const emptySlotContent = (
						<>
							<PlusIcon size={16} />
							<span className={styles.sourceItemLabel}>
								<span>{entry.label}</span>
								{entry.secondaryLabel ? (
									<span className={styles.sourceItemSecondaryLabel}>
										{entry.secondaryLabel}
									</span>
								) : null}
							</span>
						</>
					)
					const resourcePath = entry.resourcePath
					const hasResource = Boolean(resourcePath)
					const resourceDisplayName =
						resourcePath != null
							? (entry.resourceFileName ??
									getCanvasResourceFileName(resourcePath) ??
									resourcePath) ||
								""
							: ""
					const resourceKind = resourcePath
						? getMediaResourcePathKind(resourcePath)
						: "other"
					const previewResource =
						resourcePath && resourceKind !== "other"
							? ({
									path: resourcePath,
									fileName: resourceDisplayName,
									kind: resourceKind,
									crop: entry.sourceCrop,
								} satisfies MediaResourceFullscreenPreviewItem)
							: null
					const handleSlotClick =
						entry.selection && !entry.selection.disabled
							? () => entry.selection?.onCheckedChange(!entry.selection.checked)
							: undefined
					const slotContent = resourcePath ? (
						<>
							<div className={styles.sourceItemInnerFilled}>
								<ReferenceMediaPreview
									path={resourcePath}
									fileName={resourceDisplayName}
									fillParent
									objectFit="contain"
									inlineOriginal
									sourceCrop={entry.sourceCrop}
								/>
							</div>
							{entry.isLinked ? (
								<span className={styles.sourceItemLinkedIcon} aria-hidden>
									<Link2 size={11} className={styles.sourceItemLinkedIconSvg} />
								</span>
							) : null}
							{entry.resourceStatusLabel ? (
								<span className={styles.sourceItemStatusLabel}>
									{entry.resourceStatusLabel}
								</span>
							) : null}
							{previewResource && entry.onPreviewResource ? (
								<button
									type="button"
									className={styles.sourceItemPreviewButton}
									aria-label={
										entry.previewResourceAriaLabel ?? resourceDisplayName
									}
									onPointerDown={(e) => {
										e.stopPropagation()
									}}
									onClick={(e) => {
										e.preventDefault()
										e.stopPropagation()
										entry.onPreviewResource?.(previewResource)
									}}
								>
									<Maximize2
										size={14}
										className={styles.sourceItemPreviewIcon}
										aria-hidden
									/>
								</button>
							) : null}
							{entry.selection ? (
								<Checkbox
									checked={entry.selection.checked}
									disabled={entry.selection.disabled}
									className={styles.sourceItemSelectionCheckbox}
									aria-label={entry.selection.ariaLabel}
									title={entry.selection.title}
									onPointerDown={(event) => event.stopPropagation()}
									onClick={(event) => event.stopPropagation()}
									onCheckedChange={(checked) =>
										entry.selection?.onCheckedChange(checked === true)
									}
								/>
							) : null}
							{entry.onRemoveResource ? (
								<button
									type="button"
									className={styles.sourceItemRemoveButton}
									aria-label={entry.removeResourceAriaLabel ?? "Remove reference"}
									onClick={(e) => {
										e.preventDefault()
										e.stopPropagation()
										entry.onRemoveResource?.()
									}}
								>
									<X
										size={10}
										className={styles.sourceItemRemoveIcon}
										aria-hidden
									/>
								</button>
							) : null}
						</>
					) : (
						emptySlotContent
					)

					const slotItemClassName = cn(
						styles.sourceItem,
						hasResource && styles.sourceItemHasResource,
						entry.readOnly && styles.sourceItemReadOnly,
						handleSlotClick && styles.sourceItemSelectable,
					)
					const slotItemNode = renderItem ? (
						renderItem({
							option: entry,
							index: slotIndexInList,
							className: slotItemClassName,
							style: {},
							content: slotContent,
							onClick: handleSlotClick,
							slotRootRef,
						})
					) : (
						<div
							ref={slotRootRef}
							className={slotItemClassName}
							onClick={handleSlotClick}
						>
							{slotContent}
						</div>
					)

					const contentNode = hasResource ? (
						<Tooltip delayDuration={400}>
							<TooltipTrigger asChild>
								<div className={styles.sourceItemTooltipTrigger}>
									{slotItemNode}
								</div>
							</TooltipTrigger>
							<TooltipPrimitive.Portal container={portalContainer || undefined}>
								<TooltipContent
									side="top"
									sideOffset={6}
									className="w-max max-w-[85vw] overflow-hidden border-black bg-black text-white"
								>
									<span className="block overflow-hidden text-ellipsis whitespace-nowrap text-left">
										{resourceDisplayName}
									</span>
									<TooltipPrimitive.Arrow className="fill-black" />
								</TooltipContent>
							</TooltipPrimitive.Portal>
						</Tooltip>
					) : (
						slotItemNode
					)

					return <Fragment key={entry.value}>{contentNode}</Fragment>
				})}
				{overlayEntries.length > 0 ? (
					<div
						className={styles.overlayLayer}
						style={
							overlayPos
								? { left: `${overlayPos.x}px`, top: `${overlayPos.y}px` }
								: undefined
						}
					>
						{overlayEntries.map((entry) => (
							<Fragment key={entry.value}>{entry.render()}</Fragment>
						))}
					</div>
				) : null}
			</div>
		</div>
	)
}
