import { describe, expect, it } from "vitest"
import { generateMagicProjectJsContent, parseMagicProjectJsContent } from "../utils"
import { parseMagicProjectConfigContent } from "@/pages/superMagic/utils/magicProjectConfigParser"
import {
	decompressCanvasData,
	isCompressedCanvas,
	MAGIC_PROJECT_VERSION_V1,
	MAGIC_PROJECT_VERSION_V2,
} from "../magicProjectCompression"
import type { CanvasDocument } from "@/components/CanvasDesign/runtime/document"
import type { DesignData } from "../../types"

function createDesignData(version: string): DesignData {
	const canvas: CanvasDocument = {
		elements: [
			{
				id: "source",
				type: "text",
				x: 0,
				y: 0,
				width: 100,
				height: 40,
			},
			{
				id: "target",
				type: "text",
				x: 200,
				y: 0,
				width: 100,
				height: 40,
			},
		],
		connections: [
			{
				id: "connection-1",
				sourceElementId: "source",
				targetElementId: "target",
			},
		],
	}

	return {
		type: "design",
		name: "Connection Test",
		version,
		canvas,
	}
}

describe("magic project content", () => {
	it("preserves connections in compressed v2 canvas content", () => {
		const content = generateMagicProjectJsContent(createDesignData(MAGIC_PROJECT_VERSION_V2))
		const config = parseMagicProjectConfigContent(content)
		const canvasField = (config as { canvas?: unknown }).canvas

		expect(isCompressedCanvas(canvasField)).toBe(true)
		if (!isCompressedCanvas(canvasField)) return

		const canvas = decompressCanvasData(canvasField) as CanvasDocument
		expect(canvas.connections).toEqual([
			{
				id: "connection-1",
				sourceElementId: "source",
				targetElementId: "target",
			},
		])
	})

	it("preserves connections in plain v1 canvas content", () => {
		const content = generateMagicProjectJsContent(createDesignData(MAGIC_PROJECT_VERSION_V1))
		const config = parseMagicProjectConfigContent(content)
		const canvas = (config as { canvas?: CanvasDocument }).canvas

		expect(canvas?.connections).toEqual([
			{
				id: "connection-1",
				sourceElementId: "source",
				targetElementId: "target",
			},
		])
	})

	it("parses connections back from magic.project.js content", () => {
		const content = generateMagicProjectJsContent(createDesignData(MAGIC_PROJECT_VERSION_V2))
		const parsed = parseMagicProjectJsContent(content)

		expect(parsed?.canvas?.connections).toEqual([
			{
				id: "connection-1",
				sourceElementId: "source",
				targetElementId: "target",
			},
		])
	})
})
