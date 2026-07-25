import { describe, expect, it, vi } from "vitest"
import {
	materializeSvgPreviewRelations,
	TRANSPARENT_PNG_DATA_URL,
} from "../enterprise/src/packaging/svg-preview"

describe("enterprise SVG preview materialization", () => {
	it("replaces PptxGenJS SVG preview relations and reuses cached rasterization", async () => {
		const svg = "data:image/svg+xml;base64,PHN2Zy8+"
		const png = "data:image/png;base64,cHJldmlldw=="
		const rasterize = vi.fn(async () => png)
		const cache = new Map<string, Promise<string>>()
		const first = { _relsMedia: [{ isSvgPng: true, data: svg }, { data: svg }] }
		const second = { _relsMedia: [{ isSvgPng: true, data: svg }] }

		await materializeSvgPreviewRelations(first, { cache, rasterize })
		await materializeSvgPreviewRelations(second, { cache, rasterize })

		expect(rasterize).toHaveBeenCalledTimes(1)
		expect(first._relsMedia[0]).toEqual({ isSvgPng: false, data: png })
		expect(first._relsMedia[1]).toEqual({ data: svg })
		expect(second._relsMedia[0]).toEqual({ isSvgPng: false, data: png })
	})

	it("uses a valid transparent PNG when SVG rasterization is unavailable", async () => {
		const relation = {
			_relsMedia: [{ isSvgPng: true, data: "data:image/svg+xml;base64,broken" }],
		}

		await materializeSvgPreviewRelations(relation, {
			rasterize: async () => {
				throw new Error("unsupported")
			},
		})

		expect(relation._relsMedia[0]).toEqual({
			isSvgPng: false,
			data: TRANSPARENT_PNG_DATA_URL,
		})
	})
})
