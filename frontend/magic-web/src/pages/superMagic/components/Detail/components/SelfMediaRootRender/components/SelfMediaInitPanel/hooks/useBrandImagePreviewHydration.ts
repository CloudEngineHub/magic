import { useEffect, useRef } from "react"
import { getFileContentById } from "@/pages/superMagic/utils/api"
import type { BrandImageItem } from "../types"
import type { AttachmentNode } from "../../../services"

interface UseBrandImagePreviewHydrationParams {
	attachmentList?: AttachmentNode[]
	brandImages: BrandImageItem[]
	onBrandImagesChange: (brandImages: BrandImageItem[]) => void
}

interface PreviewResult {
	id: string
	previewUrl: string
}

function normalizeRelativePath(path: string): string {
	return path.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "")
}

function findFileIdByRelativePath(
	attachmentList: AttachmentNode[] | undefined,
	relativePath: string,
): string | null {
	if (!attachmentList?.length || !relativePath) return null
	const normalizedPath = normalizeRelativePath(relativePath)

	const stack = [...attachmentList]
	while (stack.length) {
		const node = stack.pop()
		if (!node) continue
		if (
			!node.is_directory &&
			normalizeRelativePath(node.relative_file_path || "") === normalizedPath
		) {
			return node.file_id || null
		}
		if (node.children?.length) stack.push(...node.children)
	}

	return null
}

async function loadPreviewUrl(
	item: BrandImageItem,
	attachmentList: AttachmentNode[] | undefined,
): Promise<PreviewResult | null> {
	if (!item.isImage || item.previewUrl || !item.uploadedPath) return null

	const fileId = findFileIdByRelativePath(attachmentList, item.uploadedPath)
	if (!fileId) return null

	try {
		const blob = (await getFileContentById(fileId, {
			responseType: "blob",
		})) as Blob

		return {
			id: item.id,
			previewUrl: URL.createObjectURL(blob),
		}
	} catch (error) {
		console.warn("[useBrandImagePreviewHydration] failed to load preview", error)
		return null
	}
}

export function useBrandImagePreviewHydration({
	attachmentList,
	brandImages,
	onBrandImagesChange,
}: UseBrandImagePreviewHydrationParams) {
	const previewUrlsRef = useRef(new Map<string, string>())

	useEffect(() => {
		for (const [id, previewUrl] of previewUrlsRef.current) {
			if (brandImages.some((item) => item.id === id)) continue
			URL.revokeObjectURL(previewUrl)
			previewUrlsRef.current.delete(id)
		}
	}, [brandImages])

	useEffect(() => {
		const pendingItems = brandImages.filter(
			(item) => item.isImage && item.uploadedPath && !item.previewUrl,
		)
		if (!pendingItems.length || !attachmentList?.length) return

		let cancelled = false

		void Promise.all(pendingItems.map((item) => loadPreviewUrl(item, attachmentList))).then(
			(results) => {
				const hydratedItems = results.filter((result): result is PreviewResult =>
					Boolean(result?.previewUrl),
				)
				if (!hydratedItems.length) return

				if (cancelled) {
					hydratedItems.forEach((item) => URL.revokeObjectURL(item.previewUrl))
					return
				}

				const previewUrlMap = new Map(
					hydratedItems.map((item) => [item.id, item.previewUrl]),
				)

				onBrandImagesChange(
					brandImages.map((item) => {
						const previewUrl = previewUrlMap.get(item.id)
						if (!previewUrl || item.previewUrl) return item

						const stalePreviewUrl = previewUrlsRef.current.get(item.id)
						if (stalePreviewUrl && stalePreviewUrl !== previewUrl) {
							URL.revokeObjectURL(stalePreviewUrl)
						}

						previewUrlsRef.current.set(item.id, previewUrl)
						return { ...item, previewUrl }
					}),
				)
			},
		)

		return () => {
			cancelled = true
		}
	}, [attachmentList, brandImages, onBrandImagesChange])

	useEffect(() => {
		return () => {
			for (const previewUrl of previewUrlsRef.current.values()) {
				URL.revokeObjectURL(previewUrl)
			}
			previewUrlsRef.current.clear()
		}
	}, [])
}
