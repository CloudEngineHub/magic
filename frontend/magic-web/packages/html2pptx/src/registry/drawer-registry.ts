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

type DrawerFn = (slide: Slide, node: never) => void | Promise<void>

const registry: Record<SerializablePPTNode["type"], DrawerFn> = {
	shape: (slide, node) => drawShape(slide, node as never),
	image: (slide, node) => drawImage(slide, node as never),
	text: (slide, node) => drawText(slide, node as never),
	table: (slide, node) => drawTable(slide, node as never),
	borderLine: (slide, node) => drawBorderLine(slide, node as never),
	media: (slide, node) => drawMedia(slide, node as never),
}

/**
 * 通过注册表派发节点绘制：
 * Worker 内由统一入口分派，新增节点类型只需在 registry 中加一行。
 */
export async function drawByRegistry(
	slide: Slide,
	node: SerializablePPTNode,
): Promise<void> {
	const drawer = registry[node.type]
	if (!drawer) return
	await drawer(slide, node as never)
}
