import type { Slide } from "../ir/node"
import type { SerializablePPTNode } from "../ir/serialize"
import {
	drawBorderLine,
	drawImage,
	drawMedia,
	drawShape,
	drawTable,
	drawText,
} from "../drawer"

type DrawerFn = (slide: Slide, node: never, signal?: AbortSignal) => void | Promise<void>

const registry: Record<SerializablePPTNode["type"], DrawerFn> = {
	shape: (slide, node) => drawShape(slide, node as never),
	image: (slide, node) => drawImage(slide, node as never),
	text: (slide, node) => drawText(slide, node as never),
	table: (slide, node) => drawTable(slide, node as never),
	borderLine: (slide, node) => drawBorderLine(slide, node as never),
	media: (slide, node, signal) => drawMedia(slide, node as never, signal),
}

/**
 * Dispatch node drawing through the registry:
 * Inside the worker, a unified entry dispatches drawing; adding a node type only requires one registry entry.
 */
export async function drawByRegistry(
	slide: Slide,
	node: SerializablePPTNode,
	signal?: AbortSignal,
): Promise<void> {
	const drawer = registry[node.type]
	if (!drawer) return
	await drawer(slide, node as never, signal)
}
