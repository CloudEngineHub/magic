import { describe, expect, it } from "vitest"
import type { FileItem } from "@/pages/superMagic/components/Detail/components/FilesViewer/types"
import {
	getDesignPathFileName,
	isCurrentCanvasResourcePath,
	resolveDesignPathForOperation,
	resolveDesignAttachment,
	toDesignApiPath,
	toDesignDslPath,
	toDesignDslPathFromWorkspacePath,
	toWorkspaceAbsoluteApiPath,
	toWorkspaceAbsoluteApiPathForOperation,
	toWorkspaceRelativeCandidates,
	toWorkspaceRelativePath,
} from "../designPath"
import { generateMagicProjectJsContent, normalizePath } from "../utils"

const DESIGN_A = "新建画布A"
const DESIGN_B = "新建画布B"

function fileItem(fileId: string, relativeFilePath: string): FileItem {
	const fileName = relativeFilePath.split("/").pop() ?? ""
	return {
		file_id: fileId,
		file_name: fileName,
		file_extension: fileName.split(".").pop() ?? "",
		relative_file_path: relativeFilePath,
		is_directory: false,
	}
}

describe("designPath contract", () => {
	it("normalizes workspace-relative segments consistently", () => {
		expect(normalizePath("/foo/bar/")).toBe("foo/bar")
		expect(normalizePath("foo/bar")).toBe("foo/bar")
	})

	it("normalizes current canvas resources to DSL storage paths", () => {
		const ctx = { designProjectBasePath: DESIGN_A }

		expect(toDesignDslPath("./images/a.png", ctx)).toBe("./images/a.png")
		expect(toDesignDslPath("images/a.png", ctx)).toBe("./images/a.png")
		expect(toDesignDslPath(`/${DESIGN_A}/images/a.png`, ctx)).toBe("./images/a.png")
		expect(toDesignDslPath(`${DESIGN_A}/images/a.png`, ctx)).toBe("./images/a.png")
	})

	it("keeps other canvas workspace paths outside the current DSL root", () => {
		const ctx = { designProjectBasePath: DESIGN_A }

		expect(toDesignDslPath(`${DESIGN_B}/images/a.png`, ctx)).toBe(`/${DESIGN_B}/images/a.png`)
		expect(toDesignDslPath(`/${DESIGN_B}/images/a.png`, ctx)).toBe(`/${DESIGN_B}/images/a.png`)
		expect(toWorkspaceRelativePath(`${DESIGN_B}/images/a.png`, ctx)).toBe(
			`${DESIGN_B}/images/a.png`,
		)
		expect(toDesignApiPath(`${DESIGN_B}/images/a.png`, ctx)).toBe(`${DESIGN_B}/images/a.png`)
		expect(toWorkspaceRelativeCandidates(`${DESIGN_B}/images/a.png`, ctx)).toEqual([
			`${DESIGN_B}/images/a.png`,
		])
	})

	it("writes known workspace paths as current-relative or workspace-absolute", () => {
		const ctx = { designProjectBasePath: DESIGN_A }

		expect(toDesignDslPathFromWorkspacePath(`/${DESIGN_A}/images/a.png`, ctx)).toBe(
			"./images/a.png",
		)
		expect(toDesignDslPathFromWorkspacePath(`${DESIGN_B}/images/a.png`, ctx)).toBe(
			`/${DESIGN_B}/images/a.png`,
		)
		expect(toDesignDslPathFromWorkspacePath("images/root.png", ctx)).toBe("/images/root.png")
		expect(toDesignDslPathFromWorkspacePath("root.png", ctx)).toBe("/root.png")
	})

	it("treats an explicit /images path as workspace-root absolute", () => {
		const ctx = { designProjectBasePath: DESIGN_A }

		expect(toDesignDslPath("/images/a.png", ctx)).toBe("/images/a.png")
		expect(toWorkspaceRelativeCandidates("/images/a.png", ctx)).toEqual(["images/a.png"])
		expect(isCurrentCanvasResourcePath("/images/a.png", ctx)).toBe(false)
	})

	it("exposes single-segment absolute files as workspace-relative lookup paths", () => {
		const ctx = { designProjectBasePath: DESIGN_A }

		expect(toDesignDslPath("/root.png", ctx)).toBe("/root.png")
		expect(toWorkspaceRelativePath("/root.png", ctx)).toBe("root.png")
		expect(toWorkspaceRelativeCandidates("/root.png", ctx)).toEqual(["root.png"])
	})

	it("treats paths with a directory prefix as project-root anchored", () => {
		const ctx = {
			designProjectBasePath: DESIGN_A,
			flatAttachments: [
				fileItem("project-root", `${DESIGN_B}/images/a.png`),
				fileItem("nested-under-current", `${DESIGN_A}/${DESIGN_B}/images/a.png`),
			],
		}

		const resolved = resolveDesignAttachment(`${DESIGN_B}/images/a.png`, ctx)
		expect(resolved.status).toBe("found")
		if (resolved.status === "found") {
			expect(resolved.fileItem.file_id).toBe("project-root")
			expect(resolved.resolvedPath).toBe(`${DESIGN_B}/images/a.png`)
		}
	})

	it("uses strict current-canvas candidates by default", () => {
		const ctx = { designProjectBasePath: DESIGN_A }

		expect(toWorkspaceRelativeCandidates("./images/a.png", ctx)).toEqual([
			`${DESIGN_A}/images/a.png`,
		])
		expect(toWorkspaceRelativeCandidates("images/a.png", ctx)).toEqual([
			`${DESIGN_A}/images/a.png`,
		])
		expect(
			toWorkspaceRelativeCandidates("images/a.png", ctx, { mode: "legacy-recovery" }),
		).toEqual([`${DESIGN_A}/images/a.png`, "images/a.png"])
	})

	it("outputs workspace absolute API paths only at API boundaries", () => {
		const ctx = { designProjectBasePath: DESIGN_A }

		expect(toWorkspaceAbsoluteApiPath("./images/a.png", ctx)).toBe(`/${DESIGN_A}/images/a.png`)
		expect(toWorkspaceAbsoluteApiPath("images/a.png", ctx)).toBe(`/${DESIGN_A}/images/a.png`)
		expect(toDesignApiPath("./images/a.png", ctx)).toBe("images/a.png")
	})

	it("does not bind current canvas resources to same-name files in another canvas", () => {
		const ctx = {
			designProjectBasePath: DESIGN_A,
			flatAttachments: [
				fileItem("design-a-cat", `/${DESIGN_A}/images/cat.png`),
				fileItem("design-b-cat", `/${DESIGN_B}/images/cat.png`),
			],
		}

		const resolved = resolveDesignAttachment("./images/cat.png", ctx)

		expect(resolved.status).toBe("found")
		if (resolved.status === "found") {
			expect(resolved.fileItem.file_id).toBe("design-a-cat")
			expect(resolved.normalizedPath).toBe(`${DESIGN_A}/images/cat.png`)
		}
	})

	it("returns ambiguous for legacy recovery when candidates hit different file ids", () => {
		const ctx = {
			designProjectBasePath: DESIGN_A,
			flatAttachments: [
				fileItem("design-a-cat", `/${DESIGN_A}/images/cat.png`),
				fileItem("workspace-root-cat", "/images/cat.png"),
			],
		}

		const strictResolved = resolveDesignAttachment("images/cat.png", ctx)
		const legacyResolved = resolveDesignAttachment("images/cat.png", ctx, {
			mode: "legacy-recovery",
		})

		expect(strictResolved.status).toBe("found")
		if (strictResolved.status === "found") {
			expect(strictResolved.fileItem.file_id).toBe("design-a-cat")
		}
		expect(legacyResolved.status).toBe("ambiguous")
	})

	it("resolves a historical bare resource at operation boundaries only when attachments prove it", () => {
		const currentCanvas = resolveDesignPathForOperation("images/cat.png", {
			designProjectBasePath: DESIGN_A,
			flatAttachments: [fileItem("design-a-cat", `${DESIGN_A}/images/cat.png`)],
		})
		expect(currentCanvas).toMatchObject({
			status: "found",
			resolvedPath: `${DESIGN_A}/images/cat.png`,
			legacyRecovered: true,
		})

		const workspaceRoot = toWorkspaceAbsoluteApiPathForOperation("images/cat.png", {
			designProjectBasePath: DESIGN_A,
			flatAttachments: [fileItem("workspace-cat", "images/cat.png")],
		})
		expect(workspaceRoot).toBe("/images/cat.png")

		const ambiguous = resolveDesignPathForOperation("images/cat.png", {
			designProjectBasePath: DESIGN_A,
			flatAttachments: [
				fileItem("design-a-cat", `${DESIGN_A}/images/cat.png`),
				fileItem("workspace-cat", "images/cat.png"),
			],
		})
		expect(ambiguous.status).toBe("ambiguous")
		expect(
			toWorkspaceAbsoluteApiPathForOperation("images/cat.png", {
				designProjectBasePath: DESIGN_A,
				flatAttachments: [
					fileItem("design-a-cat", `${DESIGN_A}/images/cat.png`),
					fileItem("workspace-cat", "images/cat.png"),
				],
			}),
		).toBeNull()
	})

	it("waits for attachment data instead of guessing a historical bare resource", () => {
		expect(
			resolveDesignPathForOperation("images/cat.png", {
				designProjectBasePath: DESIGN_A,
			}),
		).toMatchObject({ status: "attachments-pending" })
	})

	it("resolves long numeric single-segment file ids", () => {
		const ctx = {
			designProjectBasePath: DESIGN_A,
			flatAttachments: [fileItem("911343142164795393", `/${DESIGN_A}/images/cat.png`)],
		}

		const resolved = resolveDesignAttachment("911343142164795393", ctx)

		expect(resolved.status).toBe("found")
		if (resolved.status === "found") {
			expect(resolved.fileItem.file_id).toBe("911343142164795393")
			expect(resolved.normalizedPath).toBe("911343142164795393")
		}
	})

	it("does not resolve short or nonnumeric single segments as file ids", () => {
		const ctx = {
			designProjectBasePath: DESIGN_A,
			flatAttachments: [
				fileItem("123456789012345", `/${DESIGN_A}/images/short-id.png`),
				fileItem("file-1", `/${DESIGN_A}/images/file-1.png`),
			],
		}

		expect(resolveDesignAttachment("123456789012345", ctx).status).toBe("not-found")
		expect(resolveDesignAttachment("file-1", ctx).status).toBe("not-found")
	})

	it("recognizes current canvas resource paths with and without project prefix", () => {
		const ctx = { designProjectBasePath: DESIGN_A }

		expect(isCurrentCanvasResourcePath("./images/a.png", ctx)).toBe(true)
		expect(isCurrentCanvasResourcePath("images/a.png", ctx)).toBe(true)
		expect(isCurrentCanvasResourcePath(`/${DESIGN_A}/images/a.png`, ctx)).toBe(true)
		expect(isCurrentCanvasResourcePath(`${DESIGN_B}/images/a.png`, ctx)).toBe(false)
	})

	it("extracts path file names without callers splitting manually", () => {
		expect(getDesignPathFileName("https://example.com/assets/cat.png?x=1")).toBe("cat.png")
		expect(getDesignPathFileName("./images/cat.png#hash")).toBe("cat.png")
	})

	it("normalizes magic.project.js saved layer paths to DSL paths", () => {
		const content = generateMagicProjectJsContent(
			{
				version: "1.0.0",
				canvas: {
					elements: [
						{
							id: "image-1",
							type: "image",
							src: `/${DESIGN_A}/images/cat.png`,
						},
					],
				},
			} as never,
			{ projectBasePath: DESIGN_A },
		)

		expect(content).toContain("./images/cat.png")
		expect(content).not.toContain(`/${DESIGN_A}/images/cat.png`)
	})

	it("keeps external workspace resources absolute when saving magic.project.js", () => {
		const content = generateMagicProjectJsContent(
			{
				version: "1.0.0",
				canvas: {
					elements: [
						{
							id: "image-1",
							type: "image",
							src: `${DESIGN_B}/images/cat.png`,
						},
					],
				},
			} as never,
			{ projectBasePath: DESIGN_A },
		)

		expect(content).toContain(`"src": "/${DESIGN_B}/images/cat.png"`)
	})
})
