import type { ElementNode } from "../ir/dom"

/** A paint-neutral transform that still preserves transform containing blocks. */
export const CSS_IDENTITY_TRANSFORM = "matrix(1, 0, 0, 1, 0, 0)"

export interface TransformStyleState {
	transform?: string
	translate?: string
	rotate?: string
	scale?: string
}

export interface TransformMeasurementTarget {
	element: Element
	style: TransformStyleState
}

interface InlineTransformSnapshot {
	style: CSSStyleDeclaration
	property: "transform" | "translate" | "rotate" | "scale"
	value: string
	priority: string
}

export function hasActiveTransform(style: TransformStyleState): boolean {
	return (
		isActiveTransformValue(style.transform) ||
		isActiveTransformValue(style.translate) ||
		isActiveTransformValue(style.rotate) ||
		isActiveTransformValue(style.scale)
	)
}

function isActiveTransformValue(value: string | undefined): boolean {
	return Boolean(value && value !== "none")
}

/** Neutralize paint transforms while preserving the transform containing block. */
export function withNeutralizedTransforms<T>(
	targets: TransformMeasurementTarget[],
	measure: () => T,
): T {
	const snapshots: InlineTransformSnapshot[] = []

	for (const target of targets) {
		if (!hasActiveTransform(target.style)) continue
		const style = (target.element as Element & { style?: CSSStyleDeclaration }).style
		if (!style) continue
		for (const property of ["transform", "translate", "rotate", "scale"] as const) {
			snapshots.push({
				style,
				property,
				value: style.getPropertyValue(property),
				priority: style.getPropertyPriority(property),
			})
		}
	}

	try {
		for (const snapshot of snapshots) {
			snapshot.style.setProperty(
				snapshot.property,
				snapshot.property === "transform" ? CSS_IDENTITY_TRANSFORM : "none",
				"important",
			)
		}
		return measure()
	} finally {
		for (const snapshot of snapshots) {
			if (snapshot.value) {
				snapshot.style.setProperty(snapshot.property, snapshot.value, snapshot.priority)
			} else {
				snapshot.style.removeProperty(snapshot.property)
			}
		}
	}
}

/**
 * Measure layout with CSS transforms removed from the element and its layout
 * ancestors. Transforms are a paint-time operation, so browser line wrapping
 * must be recovered from the untransformed text flow.
 */
export function withTransformChainDisabled<T>(node: ElementNode, measure: () => T): T {
	const targets: TransformMeasurementTarget[] = []
	for (let current: ElementNode | null = node; current; current = current.parent) {
		targets.push({ element: current.element, style: current.style })
	}
	return withNeutralizedTransforms(targets, measure)
}
