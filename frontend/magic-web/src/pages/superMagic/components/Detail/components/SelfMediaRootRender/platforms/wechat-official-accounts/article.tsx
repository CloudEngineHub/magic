import {
	forwardRef,
	memo,
	useCallback,
	useEffect,
	useImperativeHandle,
	useRef,
	useState,
} from "react"
import { useTranslation } from "react-i18next"
import { Edit, MessageSquarePlus, RefreshCcw } from "lucide-react"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/shadcn-ui/tooltip"
import { getTemporaryDownloadUrl } from "@/pages/superMagic/utils/api"
import IsolatedHTMLRenderer, {
	type IsolatedHTMLRendererRef,
} from "../../../../contents/HTML/IsolatedHTMLRenderer"
import { processHtmlContent } from "../../../../contents/HTML/htmlProcessor"
import { flattenAttachments } from "../../../../contents/HTML/utils"
import type { FileItem } from "../../../../contents/HTML/utils/fetchInterceptor"
import type { PlatformComponentProps, SelfMediaPost } from "../../types"

interface WechatArticleViewProps {
	post: SelfMediaPost
	attachmentList?: PlatformComponentProps["attachmentList"]
	selectedProject?: unknown
	/** Add article file to the current chat input */
	onAddToCurrentChat?: () => void
	/** Navigate to the edit view */
	onGoToEdit?: () => void
	/** Refresh the article content */
	onRefresh?: () => void
	/** Whether the user has permission to edit */
	allowEdit?: boolean
}

export interface WechatArticleViewRef {
	getIframeElement: () => HTMLIFrameElement | null
}

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

function WechatArticleViewInner(
	{
		post,
		attachmentList,
		selectedProject,
		onAddToCurrentChat,
		onGoToEdit,
		onRefresh,
		allowEdit,
	}: WechatArticleViewProps,
	ref: React.ForwardedRef<WechatArticleViewRef>,
) {
	const { t } = useTranslation("super")
	const article = post.article
	const fileId = article?.fileId
	const [content, setContent] = useState<string | null>(null)
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [filePathMapping, setFilePathMapping] = useState<Map<string, string>>(new Map())
	const rendererRef = useRef<IsolatedHTMLRendererRef>(null)

	useImperativeHandle(ref, () => ({
		getIframeElement: () => rendererRef.current?.getIframeElement() ?? null,
	}))

	// Keep a ref so the effect can read the latest attachmentList without
	// treating reference changes as a reason to re-fetch the HTML content.
	const attachmentListRef = useRef(attachmentList)
	attachmentListRef.current = attachmentList

	// Derive a stable version key from the target file's updated_at so that
	// the effect re-runs when the file content actually changes (same fileId
	// but new content) without triggering on every attachmentList reference swap.
	const fileUpdatedAt = fileId
		? flattenAttachments(attachmentList ?? []).find(
				(item): item is FileItem => item?.file_id === fileId,
			)?.updated_at
		: undefined

	useEffect(() => {
		let cancelled = false
		if (!fileId) {
			setContent(null)
			setError(null)
			return
		}
		setLoading(true)
		setError(null)
		setContent(null)
		;(async () => {
			try {
				const urls = await getTemporaryDownloadUrl({ file_ids: [fileId] })
				const url = urls?.[0]?.url
				if (!url) throw new Error("noArticleUrl")
				if (cancelled) return

				const resp = await fetch(url, { credentials: "omit" })
				if (!resp.ok) throw new Error("loadArticleError")
				const html = await resp.text()
				if (cancelled) return

				let processedContent = html
				let mapping = new Map<string, string>()
				const currentAttachmentList = attachmentListRef.current
				if (currentAttachmentList?.length) {
					const flattened = flattenAttachments(currentAttachmentList)
					const currentFile =
						flattened.find((item): item is FileItem =>
							Boolean(item?.file_id === fileId),
						) || null
					const result = await processHtmlContent({
						content: html,
						attachments: currentAttachmentList,
						attachmentList: currentAttachmentList,
						fileId,
						fileName: currentFile?.file_name,
						html_relative_path: getFileFolderPath(currentFile),
					})
					processedContent = result.processedContent || html
					mapping = result.filePathMapping || new Map()
				}
				if (cancelled) return

				setContent(processedContent)
				setFilePathMapping(mapping)
			} catch (err) {
				if (cancelled) return
				setError(err instanceof Error ? err.message : "unknownError")
			} finally {
				if (!cancelled) setLoading(false)
			}
		})()

		return () => {
			cancelled = true
		}
	}, [fileId, fileUpdatedAt]) // attachmentList intentionally omitted: reference changes on every file-tree update; fileUpdatedAt tracks actual content changes

	const openNewTab = useCallback(() => {
		// No-op in read-only context
	}, [])

	if (!fileId) {
		return (
			<div
				className="flex h-full items-center justify-center text-sm text-muted-foreground"
				data-testid="wechat-article-empty"
			>
				{t("detail.selfMedia.common.noPosts")}
			</div>
		)
	}
	if (loading) {
		return (
			<div
				className="flex h-full items-center justify-center text-sm text-muted-foreground"
				data-testid="wechat-article-loading"
			>
				{t("detail.selfMedia.common.loading")}
			</div>
		)
	}
	if (error) {
		return (
			<div
				className="flex h-full items-center justify-center px-4 text-center text-sm text-destructive"
				data-testid="wechat-article-error"
			>
				{error}
			</div>
		)
	}
	if (!content) return null

	const readOnly = allowEdit === false
	const hasActions = (!readOnly && onAddToCurrentChat) || (!readOnly && onGoToEdit) || onRefresh

	return (
		<div className="relative h-full w-full bg-white" data-testid="wechat-article-view">
			<IsolatedHTMLRenderer
				ref={rendererRef as React.RefObject<IsolatedHTMLRendererRef>}
				content={content}
				sandboxType="iframe"
				fileId={fileId}
				filePathMapping={filePathMapping}
				openNewTab={openNewTab}
				selectedProject={selectedProject}
				attachmentList={attachmentList}
				isVisible
				className="h-full w-full"
			/>
			{hasActions && (
				<div
					className={cn(
						"absolute right-10 top-6 z-10 flex flex-col gap-1 rounded-md bg-background/80 p-1 shadow-md backdrop-blur-sm",
					)}
					data-testid="wechat-article-floating-actions"
				>
					{!readOnly && onAddToCurrentChat && (
						<Tooltip>
							<TooltipTrigger asChild>
								<button
									type="button"
									onClick={onAddToCurrentChat}
									data-testid="wechat-article-action-add-file"
									className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition hover:bg-accent hover:text-foreground"
								>
									<MessageSquarePlus className="h-4 w-4" />
								</button>
							</TooltipTrigger>
							<TooltipContent side="left">
								{t("detail.selfMedia.edit.addArticleFileToChat")}
							</TooltipContent>
						</Tooltip>
					)}
					{!readOnly && onGoToEdit && (
						<Tooltip>
							<TooltipTrigger asChild>
								<button
									type="button"
									onClick={onGoToEdit}
									data-testid="wechat-article-action-edit"
									className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition hover:bg-accent hover:text-foreground"
								>
									<Edit className="h-4 w-4" />
								</button>
							</TooltipTrigger>
							<TooltipContent side="left">
								{t("detail.selfMedia.edit.goToArticleEdit")}
							</TooltipContent>
						</Tooltip>
					)}
					{onRefresh && (
						<Tooltip>
							<TooltipTrigger asChild>
								<button
									type="button"
									onClick={onRefresh}
									data-testid="wechat-article-action-refresh"
									className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition hover:bg-accent hover:text-foreground"
								>
									<RefreshCcw className="h-4 w-4" />
								</button>
							</TooltipTrigger>
							<TooltipContent side="left">
								{t("detail.selfMedia.edit.refreshArticle")}
							</TooltipContent>
						</Tooltip>
					)}
				</div>
			)}
		</div>
	)
}

const WechatArticleView = memo(
	forwardRef<WechatArticleViewRef, WechatArticleViewProps>(WechatArticleViewInner),
)
export default WechatArticleView
