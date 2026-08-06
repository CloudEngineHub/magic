import { act, renderHook, waitFor } from "@testing-library/react"
import { useState } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useSingleDocumentStaticDependencies } from "@/pages/superMagic/hooks/useSingleDocumentStaticDependencies"
import { useFileShareDocumentDependencies } from "../useFileShareDocumentDependencies"

vi.mock("@/pages/superMagic/hooks/useSingleDocumentStaticDependencies", () => ({
	useSingleDocumentStaticDependencies: vi.fn(),
}))

const attachments = [
	{
		file_id: "index-html",
		file_name: "index.html",
		file_extension: "html",
	},
]

function renderDocumentDependencyHook(initialFileIds: string[]) {
	return renderHook(() => {
		const [selectedFileIds, setSelectedFileIds] = useState(initialFileIds)
		const documentDependencies = useFileShareDocumentDependencies({
			selectedFileIds,
			setSelectedFileIds,
			attachments,
			shareProject: false,
		})

		return {
			selectedFileIds,
			...documentDependencies,
		}
	})
}

describe("useFileShareDocumentDependencies", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		vi.mocked(useSingleDocumentStaticDependencies).mockReturnValue({
			fileId: "index-html",
			isLoading: false,
			fileType: "html",
			dependencyFileIds: ["image-1"],
			dependencyTransferFileIds: ["image-1"],
			missingResourcePaths: [],
			error: null,
		})
	})

	it("automatically checks resolved resources so the tree and submit payload stay aligned", async () => {
		const { result } = renderDocumentDependencyHook(["index-html"])

		await waitFor(() => {
			expect(result.current.selectedFileIds).toEqual(["index-html", "image-1"])
		})
		expect(result.current.fileIdsForSubmission).toEqual(["index-html", "image-1"])
	})

	it("unchecks automatically selected resources from both the tree and the submit payload", async () => {
		const { result } = renderDocumentDependencyHook(["index-html"])

		await waitFor(() => {
			expect(result.current.selectedFileIds).toEqual(["index-html", "image-1"])
		})

		act(() => {
			result.current.setIncludeDocumentDependencies(false)
		})

		await waitFor(() => {
			expect(result.current.selectedFileIds).toEqual(["index-html"])
		})
		expect(result.current.fileIdsForSubmission).toEqual(["index-html"])
	})

	it("keeps resources the user selected themselves when dependency carrying is turned off", async () => {
		const { result } = renderDocumentDependencyHook(["index-html", "image-1"])

		act(() => {
			result.current.setIncludeDocumentDependencies(false)
		})

		expect(result.current.selectedFileIds).toEqual(["index-html", "image-1"])
		expect(result.current.fileIdsForSubmission).toEqual(["index-html", "image-1"])
	})

	it("treats a tree-level resource deselect as opting out of carrying dependencies", async () => {
		const { result } = renderDocumentDependencyHook(["index-html"])

		await waitFor(() => {
			expect(result.current.selectedFileIds).toEqual(["index-html", "image-1"])
		})

		act(() => {
			result.current.handleFileIdsChange(["index-html"])
		})

		await waitFor(() => {
			expect(result.current.includeDocumentDependencies).toBe(false)
		})
		expect(result.current.selectedFileIds).toEqual(["index-html"])
		expect(result.current.fileIdsForSubmission).toEqual(["index-html"])
	})

	it("keeps HTML dependencies when unrelated files are selected or deselected", async () => {
		const { result } = renderDocumentDependencyHook(["index-html"])

		await waitFor(() => {
			expect(result.current.selectedFileIds).toEqual(["index-html", "image-1"])
		})

		act(() => {
			result.current.handleFileIdsChange(["index-html", "image-1", "notes-pdf"])
		})

		expect(result.current.includeDocumentDependencies).toBe(true)
		expect(result.current.selectedFileIds).toEqual(["index-html", "image-1", "notes-pdf"])
		expect(result.current.fileIdsForSubmission).toEqual(["index-html", "image-1", "notes-pdf"])

		act(() => {
			result.current.handleFileIdsChange(["index-html", "image-1"])
		})

		expect(result.current.includeDocumentDependencies).toBe(true)
		expect(result.current.selectedFileIds).toEqual(["index-html", "image-1"])
	})

	it("does not apply automatic resources to a multi-file selection", () => {
		const { result } = renderDocumentDependencyHook(["index-html", "another-file"])

		expect(result.current.selectedFileIds).toEqual(["index-html", "another-file"])
		expect(result.current.fileIdsForSubmission).toEqual(["index-html", "another-file"])
	})

	it("applies the same automatic selection flow to Markdown dependencies", async () => {
		vi.mocked(useSingleDocumentStaticDependencies).mockReturnValue({
			fileId: "readme-md",
			isLoading: false,
			fileType: "markdown",
			dependencyFileIds: ["cover-image"],
			dependencyTransferFileIds: ["assets-folder"],
			missingResourcePaths: [],
			error: null,
		})

		const { result } = renderDocumentDependencyHook(["readme-md"])

		await waitFor(() => {
			expect(result.current.selectedFileIds).toEqual(["readme-md", "cover-image"])
		})
		expect(result.current.dependencyFileType).toBe("markdown")
	})
})
