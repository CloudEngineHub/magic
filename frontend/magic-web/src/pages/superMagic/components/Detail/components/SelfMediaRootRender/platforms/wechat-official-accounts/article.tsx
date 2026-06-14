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
import IsolatedHTMLRenderer, {
	type IsolatedHTMLRendererRef,
} from "../../../../contents/HTML/IsolatedHTMLRenderer"
import { flattenAttachments } from "../../../../contents/HTML/utils"
import type { FileItem } from "../../../../contents/HTML/utils/fetchInterceptor"
import type { PlatformComponentProps, SelfMediaPost } from "../../types"
import { CardActionStrip } from "../../components/CardActionStrip"
import { loadWechatArticleHtml } from "./wechatArticleHtml"

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
	onInspectorActiveChange?: (active: boolean) => void
}

export interface WechatArticleViewRef {
	getIframeElement: () => HTMLIFrameElement | null
	getArticleHtml: () => string | null
	startInspector: () => void
	startInspectorAppend: () => void
	stopInspector: () => void
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
		onInspectorActiveChange,
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

	useImperativeHandle(
		ref,
		() => ({
			getIframeElement: () => rendererRef.current?.getIframeElement() ?? null,
			getArticleHtml: () => content,
			startInspector: () => rendererRef.current?.startInspectorAppend(),
			startInspectorAppend: () => rendererRef.current?.startInspectorAppend(),
			stopInspector: () => rendererRef.current?.stopInspector(),
		}),
		[content],
	)

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
				const result = await loadWechatArticleHtml({
					fileId,
					attachmentList: attachmentListRef.current,
				})
				if (cancelled) return
				setContent(result.content)
				setFilePathMapping(result.filePathMapping)
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
				onInspectorActiveChange={onInspectorActiveChange}
				enableInlineInspectorFallback
			/>
			{hasActions && (
				<CardActionStrip
					className="absolute right-10 top-6 z-10"
					testId="wechat-article-floating-actions"
					testIdPrefix="wechat-article-action"
					tooltipSide="left"
					allowEdit={allowEdit}
					onAddToCurrentChat={onAddToCurrentChat}
					onGoToEdit={onGoToEdit}
					onRefresh={onRefresh}
					labels={{
						addToCurrentChat: t("detail.selfMedia.edit.addArticleFileToChat"),
						goToEdit: t("detail.selfMedia.edit.goToArticleEdit"),
						refresh: t("detail.selfMedia.edit.refreshArticle"),
					}}
				/>
			)}
		</div>
	)
}

const WechatArticleView = memo(
	forwardRef<WechatArticleViewRef, WechatArticleViewProps>(WechatArticleViewInner),
)
export default WechatArticleView
