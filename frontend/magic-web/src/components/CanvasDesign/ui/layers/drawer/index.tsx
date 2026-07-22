import { useCallback, useMemo, useState, useEffect } from "react"
import styles from "./index.module.css"
import IconButton from "../../primitives/custom/IconButton/index"
import {
	Eye,
	EyeClosed,
	Folder,
	LockKeyhole,
	LockOpen,
	Minimize2 as MinimizeIcon,
	Search,
	Type,
	Video,
	X,
} from "lucide-react"
import { FolderIcon } from "../../primitives/icons/index"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"
import { Input } from "../../primitives/shadcn/input"
import LayersEmpty from "../empty/index"
import { Tooltip, TooltipTrigger, TooltipContent } from "../../primitives/shadcn/tooltip"
import { usePortalContainer } from "../../primitives/custom/PortalContainerContext"
import classNames from "classnames"
import Tree, { type TreeNode, type RenderNodeContext } from "../../primitives/custom/Tree/index"
import {
	ElementTypeEnum,
	type RectangleElement,
	type EllipseElement,
	type TriangleElement,
	type StarElement,
	type ImageElement,
} from "../../../runtime/document/types"
import { useCanvas } from "../../../app/providers/CanvasProvider"
import { useCanvasData, useCanvasEvent } from "../../../app/hooks/canvas"
import { useCanvasUI } from "../../../app/providers/CanvasUIProvider"
import { useLayersUI } from "../../../app/providers/LayersUIProvider"
import { useElementMenu } from "../../panels/menu/ElementMenuContext"
import { useMagic } from "../../../app/providers/MagicProvider"
import type { CanvasDesignStorageData } from "../../../public/magic-types"
import { RectanglePreview } from "../previews/RectanglePreview"
import { EllipsePreview } from "../previews/EllipsePreview"
import { TrianglePreview } from "../previews/TrianglePreview"
import { StarPreview } from "../previews/StarPreview"
import { useCanvasDesignI18n } from "../../../app/providers/I18nProvider"
import type { LayerTreeData } from "../types"
import { convertLayerToTreeNode } from "../layerTreeAdapter"
import LayerImageLowPreview from "../previews/ImageLowPreview"

const LAYER_TREE_VIRTUAL_THRESHOLD = 80
const LAYER_TREE_ROW_HEIGHT = 34

function normalizeLayerSearchKeyword(value: string) {
	return value.trim().toLowerCase()
}

function filterLayerTreeData(
	nodes: TreeNode<LayerTreeData>[],
	keyword: string,
): TreeNode<LayerTreeData>[] {
	if (!keyword) {
		return nodes
	}

	return nodes.reduce<TreeNode<LayerTreeData>[]>((result, node) => {
		const isMatched = normalizeLayerSearchKeyword(node.label).includes(keyword)
		if (isMatched) {
			result.push(node)
			return result
		}

		const filteredChildren = node.children ? filterLayerTreeData(node.children, keyword) : []
		if (filteredChildren.length) {
			result.push({
				...node,
				children: filteredChildren,
			})
		}

		return result
	}, [])
}

function collectExpandableNodeIds(nodes: TreeNode<LayerTreeData>[], result = new Set<string>()) {
	nodes.forEach((node) => {
		if (node.children?.length) {
			result.add(node.id)
			collectExpandableNodeIds(node.children, result)
		}
	})
	return result
}

export default function LayersDrawer() {
	const { t } = useCanvasDesignI18n()
	const portalContainer = usePortalContainer()
	// 从 Context 获取图层面板 UI 状态
	const {
		collapsed,
		width,
		transitionAnimation,
		setCollapsed,
		getLayersScrollTop,
		setLayersScrollTop,
	} = useLayersUI()

	// 从 Context 获取 methods
	const { methods } = useMagic()

	// 图层展开状态
	const [expandedElementIds, setExpandedElementIds] = useState<Set<string>>(() => {
		if (methods?.getStorage) {
			try {
				const storageData = methods.getStorage()
				if (storageData?.expandedElementIds) {
					return new Set(storageData.expandedElementIds)
				}
			} catch (error) {
				console.error("加载 expandedElementIds 状态失败:", error)
			}
		}
		return new Set<string>()
	})
	// 监听画布 hover 事件，同步到图层面板
	const [hoveredElementId, setHoveredElementId] = useState<string | null>(null)
	const [layerSearchValue, setLayerSearchValue] = useState("")

	// 订阅并获取画布数据
	const elements = useCanvasData((manager) => manager.getAllElements(), ["element:change"], {
		shouldUpdateOnElementChange: (event) => event.data?.phase !== "transient",
	})

	// 获取操作方法
	const { canvas } = useCanvas()

	// 获取元素菜单方法
	const { openMenu } = useElementMenu()

	// 从 Context 获取画布 UI 状态
	const { layerRenamingElementId, setLayerRenamingElementId, selectedElementIds, readonly } =
		useCanvasUI()

	// 将画布数据转换为树形结构，先按 zIndex 降序排序（zIndex 大的在上面）
	const treeData = useMemo(() => {
		if (collapsed || !elements) return []
		const sortedFrames = [...elements].sort((a, b) => (b.zIndex ?? 0) - (a.zIndex ?? 0))
		return sortedFrames.map((frame) => convertLayerToTreeNode(frame, canvas))
	}, [collapsed, elements, canvas])

	const normalizedLayerSearchKeyword = useMemo(
		() => normalizeLayerSearchKeyword(layerSearchValue),
		[layerSearchValue],
	)
	const isLayerSearching = normalizedLayerSearchKeyword.length > 0
	const filteredTreeData = useMemo(
		() => filterLayerTreeData(treeData, normalizedLayerSearchKeyword),
		[treeData, normalizedLayerSearchKeyword],
	)
	const searchExpandedElementIds = useMemo(() => {
		if (!isLayerSearching) {
			return expandedElementIds
		}
		return collectExpandableNodeIds(filteredTreeData, new Set(expandedElementIds))
	}, [expandedElementIds, filteredTreeData, isLayerSearching])

	// 获取选中的元素 ID（只读下与画布选区一致，便于高亮与定位）
	const selectedIds = useMemo(() => selectedElementIds, [selectedElementIds])

	// 获取悬浮的元素 ID
	const hoveredIds = useMemo(() => {
		return hoveredElementId ? [hoveredElementId] : []
	}, [hoveredElementId])

	// 切换展开状态
	const toggleExpandedElement = useCallback((id: string) => {
		setExpandedElementIds((prev) => {
			const next = new Set(prev)
			if (next.has(id)) {
				next.delete(id)
			} else {
				next.add(id)
			}
			return next
		})
	}, [])

	// 切换锁定状态
	const toggleLocked = useCallback(
		(elementId: string, currentLocked: boolean) => {
			if (!canvas) return
			const willLock = !currentLocked
			canvas.setElementLock(elementId, willLock)
		},
		[canvas],
	)

	// 切换可见性
	const toggleVisible = useCallback(
		(elementId: string, currentVisible: boolean) => {
			if (!canvas) return
			canvas.setElementVisible(elementId, !currentVisible)
		},
		[canvas],
	)

	const stopPropagation = useCallback((event: React.MouseEvent) => {
		event.stopPropagation()
	}, [])

	const handleLayerSearchChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
		setLayerSearchValue(event.target.value)
	}, [])

	const handleClearLayerSearch = useCallback((event: React.MouseEvent) => {
		event.stopPropagation()
		setLayerSearchValue("")
	}, [])

	const renderLayerNode = useCallback(
		(node: TreeNode<LayerTreeData>, context: RenderNodeContext) => {
			const isLocked = node.data?.locked ?? false
			const isVisible = node.data?.visible ?? true
			const isEditing = layerRenamingElementId === node.id
			const LockIcon = isLocked ? LockKeyhole : LockOpen
			const VisibilityIcon = isVisible ? Eye : EyeClosed

			let iconContent: React.ReactNode = null
			switch (node.data?.type) {
				case ElementTypeEnum.Frame:
					iconContent = <FolderIcon size={16} className={styles.layerNodeFolderIcon} />
					break
				case ElementTypeEnum.Group:
					iconContent = <Folder size={16} className={styles.layerNodeFolderIcon} />
					break
				case ElementTypeEnum.Text:
					iconContent = <Type size={16} className={styles.layerNodeTextIcon} />
					break
				case ElementTypeEnum.Image:
					iconContent = (
						<LayerImageLowPreview
							element={node.data as ImageElement}
							alt={node.label}
						/>
					)
					break
				case ElementTypeEnum.Rectangle:
					iconContent = (
						<div className={styles.layerNodeElementIcon}>
							<RectanglePreview element={node.data as RectangleElement} />
						</div>
					)
					break
				case ElementTypeEnum.Ellipse:
					iconContent = (
						<div className={styles.layerNodeElementIcon}>
							<EllipsePreview element={node.data as EllipseElement} />
						</div>
					)
					break
				case ElementTypeEnum.Triangle:
					iconContent = (
						<div className={styles.layerNodeElementIcon}>
							<TrianglePreview element={node.data as TriangleElement} />
						</div>
					)
					break
				case ElementTypeEnum.Star:
					iconContent = (
						<div className={styles.layerNodeElementIcon}>
							<StarPreview element={node.data as StarElement} />
						</div>
					)
					break
				case ElementTypeEnum.Video:
					iconContent = <Video size={16} className={styles.layerNodeVideoIcon} />
					break
				default:
					iconContent = <div className={styles.layerNodeElementIcon}></div>
					break
			}

			return (
				<div className={styles.layerNode}>
					<div className={styles.layerNodeIcon}>{iconContent}</div>
					<div className={styles.layerNodeLabel}>
						{isEditing ? (
							<Input
								className={classNames(
									styles.layerNodeInput,
									context.noHoverClassName,
									context.noActiveClassName,
								)}
								defaultValue={node.label}
								autoFocus
								onClick={stopPropagation}
								onBlur={(e) => {
									const newName = e.target.value.trim()
									if (newName && newName !== node.label) {
										canvas?.elementManager.update(node.id, { name: newName })
									}
									setLayerRenamingElementId(null)
								}}
								onKeyDown={(e) => {
									const nativeEvent = e.nativeEvent
									if (
										e.key === "Enter" &&
										!nativeEvent.isComposing &&
										nativeEvent.keyCode !== 229
									) {
										e.currentTarget.blur()
									} else if (e.key === "Escape") {
										setLayerRenamingElementId(null)
									}
								}}
							/>
						) : (
							<div className={styles.layerNodeLabelText}>{node.label}</div>
						)}
					</div>
					{!isEditing && (
						<div className={styles.layerNodeActions}>
							<div
								className={classNames(
									// 锁定按钮：当被锁定时一直显示，否则只在 hover 时显示
									!isLocked && context.showOnHoverClassName,
									readonly && !isLocked && styles.hidden,
								)}
							>
								<IconButton
									className={classNames(
										styles.layerNodeActionButton,
										readonly && styles.noHover,
										context.noHoverClassName,
										context.noActiveClassName,
									)}
									onClick={(e) => {
										if (readonly) return
										stopPropagation(e)
										toggleLocked(node.id, isLocked)
									}}
								>
									<LockIcon size={12} strokeWidth={2.5} />
								</IconButton>
							</div>
							<div
								className={classNames(
									// 可见性按钮：当不可见时一直显示，否则只在 hover 时显示
									isVisible && context.showOnHoverClassName,
								)}
							>
								<IconButton
									className={classNames(
										styles.layerNodeActionButton,
										context.noHoverClassName,
										context.noActiveClassName,
									)}
									onClick={(e) => {
										stopPropagation(e)
										toggleVisible(node.id, isVisible)
									}}
								>
									<VisibilityIcon size={12} strokeWidth={2.5} />
								</IconButton>
							</div>
						</div>
					)}
				</div>
			)
		},
		[
			layerRenamingElementId,
			stopPropagation,
			toggleLocked,
			toggleVisible,
			readonly,
			canvas,
			setLayerRenamingElementId,
		],
	)

	const handleContextMenu = useCallback(
		(event: React.MouseEvent, node: TreeNode<LayerTreeData>) => {
			// 右键时也定位到元素
			if (canvas && node.id) {
				canvas.userActionRegistry.execute("view.focus-element", {
					elementIds: [node.id],
				})
			}
			openMenu(event, node.id, "layers")
		},
		[openMenu, canvas],
	)

	const handleDoubleClick = useCallback(
		(_event: React.MouseEvent, node: TreeNode<LayerTreeData>) => {
			// readonly 状态下不允许编辑名称
			if (readonly) {
				return
			}
			// 双击进入编辑模式
			setLayerRenamingElementId(node.id)
		},
		[readonly, setLayerRenamingElementId],
	)

	const handleMouseEnter = useCallback(
		(_event: React.MouseEvent, node: TreeNode<LayerTreeData>) => {
			// 在画布上显示 hover 效果
			canvas?.hoverManager.manualSetHover(node.id)
		},
		[canvas?.hoverManager],
	)

	const handleMouseLeave = useCallback(() => {
		// 清除画布上的 hover 效果
		canvas?.hoverManager.manualSetHover(null)
	}, [canvas?.hoverManager])

	const handleLayersScrollTopChange = useCallback(
		(scrollTop: number) => {
			setLayersScrollTop(scrollTop)
		},
		[setLayersScrollTop],
	)

	// 监听画框创建事件，自动展开新创建的画框
	useCanvasEvent("frame:created", (event) => {
		if (event.data?.frameId) {
			setExpandedElementIds((prev) => {
				const next = new Set(prev)
				next.add(event.data.frameId)
				return next
			})
		}
	})

	// 监听画布 hover 事件，同步到图层面板
	useCanvasEvent("element:hover", (event) => {
		setHoveredElementId(event.data?.elementId ?? null)
	})

	// 监听 expandedElementIds 变化，直接保存到 storage
	useEffect(() => {
		if (!methods?.saveStorage) {
			return
		}
		try {
			// 先获取现有的 storage 数据
			const existingData = methods.getStorage() || {}
			const storageData: CanvasDesignStorageData = {
				...existingData,
				expandedElementIds:
					expandedElementIds.size > 0 ? Array.from(expandedElementIds) : undefined,
			}
			methods.saveStorage(storageData)
		} catch (error) {
			console.error("保存 expandedElementIds 状态失败:", error)
		}
	}, [methods, expandedElementIds])

	return (
		<div
			className={classNames(
				styles.layersDrawer,
				collapsed && styles.collapsed,
				readonly && styles.readonly,
			)}
			style={{
				width: width,
				transition: transitionAnimation,
			}}
			data-canvas-ui-component
		>
			<div className={styles.layersDrawerHeader}>
				<span className={styles.layersDrawerTitle}>{t("layers.title", "图层")}</span>
				{!collapsed && !!elements?.length && (
					<div
						className={classNames(
							styles.layersDrawerSearch,
							layerSearchValue && styles.layersDrawerSearchActive,
						)}
					>
						<Search size={14} className={styles.layersSearchIcon} />
						<Input
							className={styles.layersSearchInput}
							value={layerSearchValue}
							placeholder={t("layers.search.placeholder", "搜索图层")}
							onChange={handleLayerSearchChange}
							onClick={(event) => event.stopPropagation()}
							onKeyDown={(event) => event.stopPropagation()}
						/>
						{layerSearchValue && (
							<IconButton
								className={styles.layersSearchClearButton}
								aria-label={t("layers.search.clear", "清空搜索")}
								onClick={handleClearLayerSearch}
							>
								<X size={12} strokeWidth={2.5} />
							</IconButton>
						)}
					</div>
				)}
			</div>
			<div className={styles.layersDrawerBody}>
				{!collapsed &&
					(elements?.length ? (
						filteredTreeData.length ? (
							<Tree
								key={
									isLayerSearching
										? `search:${normalizedLayerSearchKeyword}`
										: "layers"
								}
								data={filteredTreeData}
								selectedIds={selectedIds}
								hoveredIds={hoveredIds}
								treeNodeContentClassName={
									readonly ? styles.treeNodeContentReadonly : undefined
								}
								virtualize
								virtualThreshold={LAYER_TREE_VIRTUAL_THRESHOLD}
								virtualRowHeight={LAYER_TREE_ROW_HEIGHT}
								initialScrollTop={isLayerSearching ? 0 : getLayersScrollTop()}
								onScrollTopChange={
									isLayerSearching ? undefined : handleLayersScrollTopChange
								}
								onSelect={(_nodes, ids) => {
									// 智能判断：只有当选中状态发生变化时才自动聚焦
									// 比较新旧选中的元素ID，判断是否有变化
									const hasSelectionChanged =
										ids.length !== selectedElementIds.length ||
										ids.some((id) => !selectedElementIds.includes(id)) ||
										selectedElementIds.some((id) => !ids.includes(id))
									canvas?.selectionManager.replaceSelection(
										ids,
										hasSelectionChanged,
									)
									// 定位到选中的元素
									if (ids.length > 0) {
										canvas?.userActionRegistry.execute("view.focus-element", {
											elementIds: ids,
										})
									}
								}}
								expandedIds={searchExpandedElementIds}
								onToggle={toggleExpandedElement}
								renderNode={renderLayerNode}
								onContextMenu={handleContextMenu}
								onDoubleClick={handleDoubleClick}
								onMouseEnter={handleMouseEnter}
								onMouseLeave={handleMouseLeave}
							/>
						) : (
							<div className={styles.layersSearchEmpty}>
								{t("layers.search.empty", "未找到匹配图层")}
							</div>
						)
					) : (
						<LayersEmpty />
					))}
			</div>
			<div className={styles.layersDrawerFooter}>
				<Tooltip>
					<TooltipTrigger>
						<IconButton
							className={styles.layersDrawerCollapseButton}
							onClick={() => setCollapsed(true)}
						>
							<MinimizeIcon size={16} />
						</IconButton>
					</TooltipTrigger>
					<TooltipPrimitive.Portal container={portalContainer || undefined}>
						<TooltipContent
							side="top"
							sideOffset={4}
							className="border-black bg-black text-white"
						>
							<span>{t("layers.collapse", "收起")}</span>
							<TooltipPrimitive.Arrow className="fill-black" />
						</TooltipContent>
					</TooltipPrimitive.Portal>
				</Tooltip>
			</div>
		</div>
	)
}
