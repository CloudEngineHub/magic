import Konva from "konva"
import type { Rect } from "../../shared/ids"
import type { AlignmentInfo, AlignmentType } from "./snapGuideTypes"
import type { SpacingGuide } from "./spacingSnapTypes"

/**
 * 吸附辅助线渲染器
 * 职责：仅负责辅助线与对齐点标记的绘制与更新
 */
export class SnapGuideRenderer {
	private overlayLayer: Konva.Layer

	private allGuideLines: Konva.Line[] = []
	private alignmentMarkers: Konva.Group[] = []
	private spacingGuideGroups: Konva.Group[] = []
	private spacingMarkers: Konva.Group[] = []

	private readonly GUIDE_STROKE = "rgb(220, 38, 38)"
	private readonly GUIDE_STROKE_WIDTH = 1
	private readonly GUIDE_DASH = [4, 4]
	private readonly MARKER_SIZE = 8
	private readonly MARKER_STROKE = "rgb(220, 38, 38)"
	private readonly MARKER_STROKE_WIDTH = 2
	private readonly SPACING_ARROW_ANGLE = Math.PI / 6

	private cachedGuideStrokeWidth = 0
	private cachedGuideDash: number[] = []
	private cachedMarkerSize = 0
	private cachedMarkerStrokeWidth = 0

	constructor(options: { overlayLayer: Konva.Layer }) {
		this.overlayLayer = options.overlayLayer
	}

	/**
	 * 交互开始时应调用，缓存视觉参数（viewport 不变）
	 */
	cacheVisualParams(scale: number): void {
		this.cachedGuideStrokeWidth = this.GUIDE_STROKE_WIDTH / scale
		this.cachedGuideDash = this.GUIDE_DASH.map((d) => d / scale)
		this.cachedMarkerSize = this.MARKER_SIZE / scale
		this.cachedMarkerStrokeWidth = this.MARKER_STROKE_WIDTH / scale
	}

	/**
	 * 绘制辅助线与标记（吸附关系变化时调用）
	 */
	render(snappedAlignments: AlignmentInfo[], getSnappedRect: () => Rect | null): void {
		const snappedRect = getSnappedRect()
		if (!snappedRect) return
		for (const alignment of snappedAlignments) {
			const line = this.createGuideLine(alignment, snappedRect)
			this.allGuideLines.push(line)
			this.overlayLayer.add(line)
		}
		const points = this.collectMarkerPoints(snappedAlignments, getSnappedRect)
		for (const p of points) {
			const marker = this.createXMarker(
				p.x,
				p.y,
				this.cachedMarkerSize,
				this.cachedMarkerStrokeWidth,
			)
			this.alignmentMarkers.push(marker)
			this.overlayLayer.add(marker)
		}
	}

	/**
	 * 就地更新辅助线与标记位置（吸附关系未变，仅元素位移）
	 */
	update(snappedAlignments: AlignmentInfo[], getSnappedRect: () => Rect | null): void {
		const snappedRect = getSnappedRect()
		if (!snappedRect) return
		for (let i = 0; i < snappedAlignments.length; i++) {
			const alignment = snappedAlignments[i]
			const line = this.allGuideLines[i]
			if (!line) continue
			const points = this.computeLinePoints(alignment, snappedRect)
			line.points(points)
		}
		const points = this.collectMarkerPoints(snappedAlignments, getSnappedRect)
		for (let i = 0; i < points.length && i < this.alignmentMarkers.length; i++) {
			const p = points[i]
			this.alignmentMarkers[i].x(p.x)
			this.alignmentMarkers[i].y(p.y)
		}
	}

	/**
	 * 绘制等间距辅助线。两段线和成对标记表达两侧 gap 相等，
	 * 与元素边缘共线的普通对齐辅助线保持不同的视觉语义。
	 */
	renderSpacing(guides: SpacingGuide[]): void {
		for (const guide of guides) {
			for (const segment of guide.segments) {
				const group = this.createSpacingGuideGroup(segment)
				this.spacingGuideGroups.push(group)
				this.overlayLayer.add(group)
			}
			for (const segment of guide.segments) {
				const marker = this.createSpacingMarker(segment)
				this.spacingMarkers.push(marker)
				this.overlayLayer.add(marker)
			}
		}
	}

	/** 就地更新等间距辅助线，避免同一候选关系下重复创建 Konva 节点。 */
	updateSpacing(guides: SpacingGuide[]): void {
		const segments = guides.flatMap((guide) => guide.segments)
		if (
			this.spacingGuideGroups.length !== segments.length ||
			this.spacingMarkers.length !== segments.length
		) {
			this.clearSpacing()
			this.renderSpacing(guides)
			return
		}

		segments.forEach((segment, index) => {
			this.updateSpacingGuideGroup(this.spacingGuideGroups[index], segment)
			const markerPosition = this.getSegmentMidpoint(segment)
			this.spacingMarkers[index].position(markerPosition)
		})
	}

	/**
	 * 清除所有辅助线与标记
	 */
	clear(): void {
		for (const line of this.allGuideLines) {
			line.destroy()
		}
		this.allGuideLines = []
		for (const marker of this.alignmentMarkers) {
			marker.destroy()
		}
		this.alignmentMarkers = []
		this.clearSpacing()
		this.overlayLayer.batchDraw()
	}

	/**
	 * 触发 overlay 重绘
	 */
	batchDraw(): void {
		this.overlayLayer.batchDraw()
	}

	private createGuideLine(alignment: AlignmentInfo, snappedRect: Rect): Konva.Line {
		const points = this.computeLinePoints(alignment, snappedRect)
		return new Konva.Line({
			points,
			stroke: this.GUIDE_STROKE,
			strokeWidth: this.cachedGuideStrokeWidth,
			dash: this.cachedGuideDash,
			listening: false,
		})
	}

	private createSpacingGuideGroup(segment: SpacingGuide["segments"][number]): Konva.Group {
		const group = new Konva.Group({ name: "spacing-guide-group", listening: false })
		group.add(this.createSpacingMainLine(segment))
		group.add(this.createSpacingArrowHead(segment, "start"))
		group.add(this.createSpacingArrowHead(segment, "end"))
		return group
	}

	private updateSpacingGuideGroup(
		group: Konva.Group,
		segment: SpacingGuide["segments"][number],
	): void {
		const mainLine = group.findOne(".spacing-guide-main") as Konva.Line | null
		const startArrow = group.findOne(".spacing-guide-arrow-start") as Konva.Line | null
		const endArrow = group.findOne(".spacing-guide-arrow-end") as Konva.Line | null

		mainLine?.points(this.getSegmentPoints(segment))
		startArrow?.points(this.getSpacingArrowHeadPoints(segment, "start"))
		endArrow?.points(this.getSpacingArrowHeadPoints(segment, "end"))
	}

	private createSpacingMainLine(segment: SpacingGuide["segments"][number]): Konva.Line {
		return new Konva.Line({
			name: "spacing-guide-main",
			points: this.getSegmentPoints(segment),
			stroke: this.GUIDE_STROKE,
			strokeWidth: this.cachedGuideStrokeWidth,
			lineCap: "round",
			listening: false,
		})
	}

	private createSpacingArrowHead(
		segment: SpacingGuide["segments"][number],
		end: "start" | "end",
	): Konva.Line {
		return new Konva.Line({
			name: `spacing-guide-arrow-${end}`,
			points: this.getSpacingArrowHeadPoints(segment, end),
			stroke: this.GUIDE_STROKE,
			strokeWidth: this.cachedGuideStrokeWidth,
			lineCap: "round",
			lineJoin: "round",
			listening: false,
		})
	}

	private computeLinePoints(alignment: AlignmentInfo, snappedRect: Rect): number[] {
		const dragPoints = this.getAlignmentPoints(alignment.type, snappedRect)
		const allPoints = [...dragPoints, ...alignment.targetPoints]
		return ["left", "center", "right"].includes(alignment.type)
			? [
					alignment.position,
					Math.min(...allPoints.map((p) => p.y)),
					alignment.position,
					Math.max(...allPoints.map((p) => p.y)),
				]
			: [
					Math.min(...allPoints.map((p) => p.x)),
					alignment.position,
					Math.max(...allPoints.map((p) => p.x)),
					alignment.position,
				]
	}

	private collectMarkerPoints(
		alignments: AlignmentInfo[],
		getSnappedRect: () => Rect | null,
	): Array<{ x: number; y: number }> {
		const result: Array<{ x: number; y: number }> = []
		const seen = new Set<string>()
		const snappedRect = getSnappedRect()
		if (!snappedRect) return result
		for (const alignment of alignments) {
			for (const p of this.getAlignmentPoints(alignment.type, snappedRect)) {
				const key = `${p.x.toFixed(2)},${p.y.toFixed(2)}`
				if (!seen.has(key)) {
					seen.add(key)
					result.push(p)
				}
			}
			for (const p of alignment.targetPoints) {
				const key = `${p.x.toFixed(2)},${p.y.toFixed(2)}`
				if (!seen.has(key)) {
					seen.add(key)
					result.push(p)
				}
			}
		}
		return result
	}

	private getAlignmentPoints(type: AlignmentType, rect: Rect): Array<{ x: number; y: number }> {
		switch (type) {
			case "left":
				return [
					{ x: rect.x, y: rect.y },
					{ x: rect.x, y: rect.y + rect.height },
				]
			case "right":
				return [
					{ x: rect.x + rect.width, y: rect.y },
					{ x: rect.x + rect.width, y: rect.y + rect.height },
				]
			case "top":
				return [
					{ x: rect.x, y: rect.y },
					{ x: rect.x + rect.width, y: rect.y },
				]
			case "bottom":
				return [
					{ x: rect.x, y: rect.y + rect.height },
					{ x: rect.x + rect.width, y: rect.y + rect.height },
				]
			case "center":
			case "middle":
				return [{ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }]
		}
	}

	private createXMarker(x: number, y: number, size: number, strokeWidth: number): Konva.Group {
		const group = new Konva.Group({ x, y, listening: false })
		group.add(
			new Konva.Line({
				points: [-size / 2, -size / 2, size / 2, size / 2],
				stroke: this.MARKER_STROKE,
				strokeWidth,
				listening: false,
			}),
		)
		group.add(
			new Konva.Line({
				points: [-size / 2, size / 2, size / 2, -size / 2],
				stroke: this.MARKER_STROKE,
				strokeWidth,
				listening: false,
			}),
		)
		return group
	}

	private createSpacingMarker(segment: SpacingGuide["segments"][number]): Konva.Group {
		const marker = new Konva.Group({
			name: "spacing-marker",
			...this.getSegmentMidpoint(segment),
			listening: false,
		})
		this.addSpacingMarkerLines(marker, segment.axis)
		return marker
	}

	private addSpacingMarkerLines(marker: Konva.Group, axis: SpacingGuide["axis"]): void {
		const markerLength = this.cachedMarkerSize
		const markerOffset = markerLength / 4
		const linePoints =
			axis === "horizontal"
				? [
						[-markerLength / 2, -markerOffset, markerLength / 2, -markerOffset],
						[-markerLength / 2, markerOffset, markerLength / 2, markerOffset],
					]
				: [
						[-markerOffset, -markerLength / 2, -markerOffset, markerLength / 2],
						[markerOffset, -markerLength / 2, markerOffset, markerLength / 2],
					]
		for (const points of linePoints) {
			marker.add(
				new Konva.Line({
					points,
					stroke: this.MARKER_STROKE,
					strokeWidth: this.cachedMarkerStrokeWidth,
					listening: false,
				}),
			)
		}
	}

	private getSegmentPoints(segment: SpacingGuide["segments"][number]): number[] {
		return [segment.start.x, segment.start.y, segment.end.x, segment.end.y]
	}

	private getSpacingArrowHeadPoints(
		segment: SpacingGuide["segments"][number],
		end: "start" | "end",
	): number[] {
		const tip = end === "start" ? segment.start : segment.end
		const segmentAngle = Math.atan2(
			segment.end.y - segment.start.y,
			segment.end.x - segment.start.x,
		)
		const arrowAngle = end === "start" ? segmentAngle + Math.PI : segmentAngle
		const arrowLength = Math.min(
			this.cachedMarkerSize * 0.75,
			this.getSegmentLength(segment) / 2,
		)

		if (arrowLength <= 0) return [tip.x, tip.y, tip.x, tip.y, tip.x, tip.y]

		const firstBaseAngle = arrowAngle - this.SPACING_ARROW_ANGLE
		const secondBaseAngle = arrowAngle + this.SPACING_ARROW_ANGLE
		const firstBase = {
			x: tip.x - arrowLength * Math.cos(firstBaseAngle),
			y: tip.y - arrowLength * Math.sin(firstBaseAngle),
		}
		const secondBase = {
			x: tip.x - arrowLength * Math.cos(secondBaseAngle),
			y: tip.y - arrowLength * Math.sin(secondBaseAngle),
		}

		return [firstBase.x, firstBase.y, tip.x, tip.y, secondBase.x, secondBase.y]
	}

	private getSegmentLength(segment: SpacingGuide["segments"][number]): number {
		return Math.hypot(segment.end.x - segment.start.x, segment.end.y - segment.start.y)
	}

	private getSegmentMidpoint(segment: SpacingGuide["segments"][number]): {
		x: number
		y: number
	} {
		return {
			x: (segment.start.x + segment.end.x) / 2,
			y: (segment.start.y + segment.end.y) / 2,
		}
	}

	private clearSpacing(): void {
		for (const group of this.spacingGuideGroups) {
			group.destroy()
		}
		this.spacingGuideGroups = []
		for (const marker of this.spacingMarkers) {
			marker.destroy()
		}
		this.spacingMarkers = []
	}
}
