import { describe, expect, it } from "vitest"
import type { FileItem } from "@/pages/superMagic/components/Detail/components/FilesViewer/types"
import {
	resolveDesignCanvasResourceApiUri,
	resolveDesignCanvasResourceReference,
	resolveDesignCanvasResourceWorkspacePath,
} from "../designResourceReferenceResolver"

function context() {
	return {
		designProjectBasePath: "画布A",
		flatAttachments: [] as FileItem[],
		attachmentsReady: true,
	}
}

describe("designResourceReferenceResolver opaque assets", () => {
	it("preserves asset URIs as opaque generation inputs", () => {
		const path = "asset://virtual-human-asset-id"
		const resolution = resolveDesignCanvasResourceReference(path, context())

		expect(resolution).toMatchObject({
			status: "resolved",
			resourceKind: "opaque-asset",
			storagePath: path,
			identity: `opaque-asset:${path}`,
			resolutionSource: "opaque-asset",
		})
		expect(resolveDesignCanvasResourceApiUri(path, context())).toBe(path)
		expect(resolveDesignCanvasResourceWorkspacePath(path, context())).toBeUndefined()
	})

	it("keeps existing external URL pass-through semantics", () => {
		const url = "https://cdn.example.com/reference.png"

		expect(resolveDesignCanvasResourceApiUri(url, context())).toBe(url)
	})
})
