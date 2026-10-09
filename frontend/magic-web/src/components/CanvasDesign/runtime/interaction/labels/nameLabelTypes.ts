import type Konva from "konva"
import type { LayerElement } from "../../document/types"
import type { BaseElement } from "../../elements/core/BaseElement"

/**
 * Resolver receives runtime state so an icon can reflect element data and
 * transient interaction state without adding icon data to the persisted DSL.
 */
export interface NameLabelIconContext {
	elementId: string
	element: BaseElement
	data: LayerElement
	selected: boolean
	hovered: boolean
}

/**
 * Describes one icon instance next to a name label.
 *
 * `width` and `height` are the icon's unscaled label-space dimensions. The
 * returned Konva node should render at those dimensions; the manager owns its
 * position and disables its hit testing.
 */
export interface NameLabelIconDescriptor {
	key: string
	width: number
	height: number
	gap?: number
	create: (context: NameLabelIconContext) => Konva.Shape | Konva.Group
	update?: (node: Konva.Shape | Konva.Group, context: NameLabelIconContext) => void
}

/**
 * Optional name-label icon provider. Returning null keeps the label text-only.
 */
export type NameLabelIconResolver = (
	context: NameLabelIconContext,
) => NameLabelIconDescriptor | null
