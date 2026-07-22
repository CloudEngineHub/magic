import { act, renderHook, waitFor } from "@testing-library/react"
import { useState } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useSingleHtmlStaticDependencies } from "@/pages/superMagic/hooks/useSingleHtmlStaticDependencies"
import { useFileShareHtmlDependencies } from "../useFileShareHtmlDependencies"

vi.mock("@/pages/superMagic/hooks/useSingleHtmlStaticDependencies", () => ({
	useSingleHtmlStaticDependencies: vi.fn(),
}))

const attachments = [
	{
		file_id: "index-html",
		file_name: "index.html",
		file_extension: "html",
	},
]

function renderHtmlDependencyHook(initialFileIds: string[]) {
	return renderHook(() => {
		const [selectedFileIds, setSelectedFileIds] = useState(initialFileIds)
		const htmlDependencies = useFileShareHtmlDependencies({
			selectedFileIds,
			setSelectedFileIds,
			attachments,
			shareProject: false,
		})

		return {
			selectedFileIds,
			...htmlDependencies,
		}
	})
}

describe("useFileShareHtmlDependencies", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		vi.mocked(useSingleHtmlStaticDependencies).mockReturnValue({
			fileId: "index-html",
			isLoading: false,
			isHtml: true,
			dependencyFileIds: ["image-1"],
			dependencyTransferFileIds: ["image-1"],
			error: null,
		})
	})

	it("automatically checks resolved resources so the tree and submit payload stay aligned", async () => {
		const { result } = renderHtmlDependencyHook(["index-html"])

		await waitFor(() => {
			expect(result.current.selectedFileIds).toEqual(["index-html", "image-1"])
		})
		expect(result.current.fileIdsForSubmission).toEqual(["index-html", "image-1"])
	})

	it("unchecks automatically selected resources from both the tree and the submit payload", async () => {
		const { result } = renderHtmlDependencyHook(["index-html"])

		await waitFor(() => {
			expect(result.current.selectedFileIds).toEqual(["index-html", "image-1"])
		})

		act(() => {
			result.current.setIncludeHtmlDependencies(false)
		})

		await waitFor(() => {
			expect(result.current.selectedFileIds).toEqual(["index-html"])
		})
		expect(result.current.fileIdsForSubmission).toEqual(["index-html"])
	})

	it("keeps resources the user selected themselves when dependency carrying is turned off", async () => {
		const { result } = renderHtmlDependencyHook(["index-html", "image-1"])

		act(() => {
			result.current.setIncludeHtmlDependencies(false)
		})

		expect(result.current.selectedFileIds).toEqual(["index-html", "image-1"])
		expect(result.current.fileIdsForSubmission).toEqual(["index-html", "image-1"])
	})

	it("treats a tree-level resource deselect as opting out of carrying dependencies", async () => {
		const { result } = renderHtmlDependencyHook(["index-html"])

		await waitFor(() => {
			expect(result.current.selectedFileIds).toEqual(["index-html", "image-1"])
		})

		act(() => {
			result.current.handleFileIdsChange(["index-html"])
		})

		await waitFor(() => {
			expect(result.current.includeHtmlDependencies).toBe(false)
		})
		expect(result.current.selectedFileIds).toEqual(["index-html"])
		expect(result.current.fileIdsForSubmission).toEqual(["index-html"])
	})

	it("keeps HTML dependencies when unrelated files are selected or deselected", async () => {
		const { result } = renderHtmlDependencyHook(["index-html"])

		await waitFor(() => {
			expect(result.current.selectedFileIds).toEqual(["index-html", "image-1"])
		})

		act(() => {
			result.current.handleFileIdsChange(["index-html", "image-1", "notes-pdf"])
		})

		expect(result.current.includeHtmlDependencies).toBe(true)
		expect(result.current.selectedFileIds).toEqual(["index-html", "image-1", "notes-pdf"])
		expect(result.current.fileIdsForSubmission).toEqual(["index-html", "image-1", "notes-pdf"])

		act(() => {
			result.current.handleFileIdsChange(["index-html", "image-1"])
		})

		expect(result.current.includeHtmlDependencies).toBe(true)
		expect(result.current.selectedFileIds).toEqual(["index-html", "image-1"])
	})

	it("does not apply automatic resources to a multi-file selection", () => {
		const { result } = renderHtmlDependencyHook(["index-html", "another-file"])

		expect(result.current.selectedFileIds).toEqual(["index-html", "another-file"])
		expect(result.current.fileIdsForSubmission).toEqual(["index-html", "another-file"])
	})
})
