import { getTemporaryDownloadUrl } from "@/pages/superMagic/utils/api"
import { processHtmlContent } from "../../../../contents/HTML/htmlProcessor"
import { flattenAttachments } from "../../../../contents/HTML/utils"
import type { FileItem } from "../../../../contents/HTML/utils/fetchInterceptor"
import type { PlatformComponentProps } from "../../types"

function getFileFolderPath(
	file: Pick<FileItem, "file_name" | "relative_file_path"> | null,
): string {
	const path = file?.relative_file_path || ""
	if (!path) return "/"
	if (file?.file_name && path.endsWith(file.file_name)) {
		return path.slice(0, -file.file_name.length)
	}
	const slashIndex = path.lastIndexOf("/")
	return slashIndex >= 0 ? path.slice(0, slashIndex + 1) : "/"
}

export interface LoadWechatArticleHtmlResult {
	content: string
	filePathMapping: Map<string, string>
}

export async function loadWechatArticleHtml({
	fileId,
	attachmentList,
}: {
	fileId: string
	attachmentList?: PlatformComponentProps["attachmentList"]
}): Promise<LoadWechatArticleHtmlResult> {
	const urls = await getTemporaryDownloadUrl({ file_ids: [fileId] })
	const url = urls?.[0]?.url
	if (!url) throw new Error("noArticleUrl")

	const resp = await fetch(url, { credentials: "omit" })
	if (!resp.ok) throw new Error("loadArticleError")
	const html = await resp.text()

	if (!attachmentList?.length) {
		return { content: html, filePathMapping: new Map() }
	}

	const flattened = flattenAttachments(attachmentList)
	const currentFile =
		flattened.find((item): item is FileItem => Boolean(item?.file_id === fileId)) || null
	const result = await processHtmlContent({
		content: html,
		attachments: attachmentList,
		attachmentList,
		fileId,
		fileName: currentFile?.file_name,
		html_relative_path: getFileFolderPath(currentFile),
	})

	return {
		content: result.processedContent || html,
		filePathMapping: result.filePathMapping || new Map(),
	}
}
