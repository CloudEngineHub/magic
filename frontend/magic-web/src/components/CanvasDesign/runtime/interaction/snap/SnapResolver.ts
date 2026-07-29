/**
 * SnapResolver - 吸附计算的单一入口
 *
 * 职责：给定拖拽意图与选区，计算吸附后的目标 rect（始终在 content 空间）
 * 调用方根据场景决定如何应用：
 * - 单选：直接更新节点
 * - 多选：通过 BoxMapper 转为 Konva box，由 boundBoxFunc 返回
 *
 * 消除理解负担：吸附的「计算」与「应用」分离，此处只负责计算
 */
import type { Box } from "konva/lib/shapes/Transformer"
import type { Rect } from "../../shared/ids"
import type { LayerElement } from "../../document/types"
import type { AlignmentInfo, AlignmentType } from "./snapGuideTypes"
import { BoxMapper } from "../../shared/geometry/BoxMapper"
import { constrainRectToAspectRatio } from "../transform/anchorUtils"

const ALIGNMENT_EPSILON = 0.5

export interface SnapResolverContext {
	findAlignments(rect: Rect, targets: LayerElement[], anchor?: string | null): AlignmentInfo[]
	calculateSnapResult(
		alignments: AlignmentInfo[],
		rect: Rect,
	): { snappedAlignments: AlignmentInfo[]; snapOffsetX: number; snapOffsetY: number }
	getAlignmentTargets(selectedIds: string[]): LayerElement[]
	getActiveAlignmentTargets?(selectedIds: string[], draggingRect: Rect): LayerElement[]
	calculateElementsRect(selectedIds: string[]): Rect | null
	ensureCache(): void
	getAllowedAlignments(overrideAnchor?: string | null): Set<AlignmentType>
}

export interface SnapResult {
	snappedRect: Rect
	snappedAlignments: AlignmentInfo[]
	snapOffsetX: number
	snapOffsetY: number
	coordinateSpace: "content"
}

/**
 * 吸附解析器
 */
export class SnapResolver {
	private readonly ctx: SnapResolverContext

	constructor(ctx: SnapResolverContext) {
		this.ctx = ctx
	}

	/**
	 * 在 content 空间计算吸附后的 rect
	 * @returns 若有吸附则返回结果，否则 null
	 */
	resolveInContentSpace(params: {
		draggingRect: Rect
		targets: LayerElement[]
		activeAnchor: string | null
		options?: { keepRatio: boolean; aspectRatio: number }
	}): SnapResult | null {
		const { draggingRect, targets, activeAnchor, options } = params
		this.ctx.ensureCache()

		const alignments = this.ctx.findAlignments(draggingRect, targets, activeAnchor)
		const { snappedAlignments, snapOffsetX, snapOffsetY } = this.ctx.calculateSnapResult(
			alignments,
			draggingRect,
		)

		if (snappedAlignments.length === 0) return null

		let x = draggingRect.x
		let y = draggingRect.y
		let width = draggingRect.width
		let height = draggingRect.height

		const xAlign = snappedAlignments.find((a) => ["left", "center", "right"].includes(a.type))
		const yAlign = snappedAlignments.find((a) => ["top", "middle", "bottom"].includes(a.type))

		if (!activeAnchor) {
			x = draggingRect.x + snapOffsetX
			y = draggingRect.y + snapOffsetY
		} else if (xAlign) {
			if (xAlign.type === "left") {
				x = draggingRect.x + snapOffsetX
				width = draggingRect.width - snapOffsetX
			} else if (xAlign.type === "right") {
				width = draggingRect.width + snapOffsetX
			} else {
				x = draggingRect.x + snapOffsetX
			}
		}
		if (activeAnchor && yAlign) {
			if (yAlign.type === "top") {
				y = draggingRect.y + snapOffsetY
				height = draggingRect.height - snapOffsetY
			} else if (yAlign.type === "bottom") {
				height = draggingRect.height + snapOffsetY
			} else {
				y = draggingRect.y + snapOffsetY
			}
		}

		let snappedRect: Rect = { x, y, width, height }
		if (options?.keepRatio && options.aspectRatio > 0 && activeAnchor) {
			snappedRect = this.constrainSnapRectToAspectRatio(
				snappedRect,
				draggingRect,
				activeAnchor,
				options.aspectRatio,
				snappedAlignments,
			)
		}

		const effectiveAlignments = this.filterAlignmentsBySnappedRect(
			snappedAlignments,
			snappedRect,
		)
		if (effectiveAlignments.length === 0) return null

		return {
			snappedRect,
			snappedAlignments: effectiveAlignments,
			snapOffsetX,
			snapOffsetY,
			coordinateSpace: "content",
		}
	}

	/**
	 * anchor 缩放场景：返回 Konva boundBoxFunc 所需的吸附后 box
	 * 内部完成 content ↔ konva 坐标转换
	 */
	getSnappedBox(
		oldBox: Box,
		newBox: Box,
		activeAnchor: string | null,
		selectedIds: string[],
		options?: { keepRatio: boolean; aspectRatio: number },
	): Box {
		if (!activeAnchor || selectedIds.length === 0) return newBox

		const currentRect = this.ctx.calculateElementsRect(selectedIds)
		if (!currentRect) return newBox

		const mapper = new BoxMapper()
		mapper.calibrate(oldBox, currentRect)

		const targetRect = mapper.applyKonvaDeltaToContent(
			currentRect,
			newBox.x - oldBox.x,
			newBox.y - oldBox.y,
			newBox.width - oldBox.width,
			newBox.height - oldBox.height,
		)

		const targets =
			this.ctx.getActiveAlignmentTargets?.(selectedIds, targetRect) ??
			this.ctx.getAlignmentTargets(selectedIds)
		const result = this.resolveInContentSpace({
			draggingRect: targetRect,
			targets,
			activeAnchor,
			options,
		})

		if (!result) return newBox

		return { ...newBox, ...mapper.contentToKonva(result.snappedRect) }
	}

	private constrainSnapRectToAspectRatio(
		snappedRect: Rect,
		targetRect: Rect,
		activeAnchor: string,
		aspectRatio: number,
		alignments: AlignmentInfo[],
	): Rect {
		const hasHorizontalSnap = alignments.some((alignment) =>
			this.isHorizontalAlignment(alignment.type),
		)
		const hasVerticalSnap = alignments.some((alignment) =>
			this.isVerticalAlignment(alignment.type),
		)

		if (activeAnchor === "top-center" || activeAnchor === "bottom-center") {
			return hasHorizontalSnap && !hasVerticalSnap
				? this.constrainHorizontalEdgeByWidth(snappedRect, activeAnchor, aspectRatio)
				: this.constrainHorizontalEdgeByHeight(snappedRect, activeAnchor, aspectRatio)
		}

		if (activeAnchor === "middle-left" || activeAnchor === "middle-right") {
			return hasVerticalSnap && !hasHorizontalSnap
				? this.constrainVerticalEdgeByHeight(snappedRect, activeAnchor, aspectRatio)
				: this.constrainVerticalEdgeByWidth(snappedRect, activeAnchor, aspectRatio)
		}

		if (hasHorizontalSnap !== hasVerticalSnap) {
			return hasHorizontalSnap
				? this.constrainCornerByWidth(snappedRect, activeAnchor, aspectRatio)
				: this.constrainCornerByHeight(snappedRect, activeAnchor, aspectRatio)
		}

		return constrainRectToAspectRatio(snappedRect, targetRect, activeAnchor, aspectRatio)
	}

	private constrainHorizontalEdgeByHeight(
		rect: Rect,
		activeAnchor: string,
		aspectRatio: number,
	): Rect {
		const height = rect.height
		const width = height * aspectRatio
		return {
			x: activeAnchor === "top-center" ? rect.x + rect.width - width : rect.x,
			y: rect.y,
			width,
			height,
		}
	}

	private constrainHorizontalEdgeByWidth(
		rect: Rect,
		activeAnchor: string,
		aspectRatio: number,
	): Rect {
		const width = rect.width
		const height = width / aspectRatio
		return {
			x: rect.x,
			y: activeAnchor === "top-center" ? rect.y + rect.height - height : rect.y,
			width,
			height,
		}
	}

	private constrainVerticalEdgeByWidth(
		rect: Rect,
		activeAnchor: string,
		aspectRatio: number,
	): Rect {
		const width = rect.width
		const height = width / aspectRatio
		return {
			x: rect.x,
			y: activeAnchor === "middle-left" ? rect.y + rect.height - height : rect.y,
			width,
			height,
		}
	}

	private constrainVerticalEdgeByHeight(
		rect: Rect,
		activeAnchor: string,
		aspectRatio: number,
	): Rect {
		const height = rect.height
		const width = height * aspectRatio
		return {
			x: activeAnchor === "middle-left" ? rect.x + rect.width - width : rect.x,
			y: rect.y,
			width,
			height,
		}
	}

	private constrainCornerByWidth(rect: Rect, activeAnchor: string, aspectRatio: number): Rect {
		const width = rect.width
		const height = width / aspectRatio
		return {
			x: rect.x,
			y: activeAnchor.includes("top") ? rect.y + rect.height - height : rect.y,
			width,
			height,
		}
	}

	private constrainCornerByHeight(rect: Rect, activeAnchor: string, aspectRatio: number): Rect {
		const height = rect.height
		const width = height * aspectRatio
		return {
			x: activeAnchor.includes("left") ? rect.x + rect.width - width : rect.x,
			y: rect.y,
			width,
			height,
		}
	}

	private filterAlignmentsBySnappedRect(
		alignments: AlignmentInfo[],
		snappedRect: Rect,
	): AlignmentInfo[] {
		return alignments.filter((alignment) => {
			const snappedPosition = this.getRectAlignmentPosition(snappedRect, alignment.type)
			return Math.abs(snappedPosition - alignment.position) <= ALIGNMENT_EPSILON
		})
	}

	private getRectAlignmentPosition(rect: Rect, type: AlignmentType): number {
		switch (type) {
			case "left":
				return rect.x
			case "center":
				return rect.x + rect.width / 2
			case "right":
				return rect.x + rect.width
			case "top":
				return rect.y
			case "middle":
				return rect.y + rect.height / 2
			case "bottom":
				return rect.y + rect.height
		}
	}

	private isHorizontalAlignment(type: AlignmentType): boolean {
		return type === "left" || type === "center" || type === "right"
	}

	private isVerticalAlignment(type: AlignmentType): boolean {
		return type === "top" || type === "middle" || type === "bottom"
	}
}
