import { FileText } from "lucide-react"
import CardFrame from "./CardFrame"
import { CARD_THUMBNAIL_IMAGE_PROCESS } from "../constants/imageProcess"
import { useCoverImageUrl } from "../platforms/wechat-official-accounts/useCoverImageUrl"
import type { SelfMediaPlatformPostItem } from "../stores/SelfMediaStore"
import type { SelfMediaAttachmentNode, SelfMediaCard } from "../types"

interface SelfMediaPostArticlePreviewProps {
	item: SelfMediaPlatformPostItem
	attachmentList?: SelfMediaAttachmentNode[]
	postId: string
}

function SelfMediaPostArticlePreview({
	item,
	attachmentList,
	postId,
}: SelfMediaPostArticlePreviewProps) {
	const { platform, post } = item
	const cover =
		platform === "wechat-official-accounts" ? post.thumbnailCover || post.heroCover : undefined
	const card = platform !== "wechat-official-accounts" ? post.cards[0] : undefined

	if (cover?.fileId || cover?.url) return <HomeCoverPreview cover={cover} postId={postId} />

	if (card?.fileId)
		return (
			<div
				className="pointer-events-none h-full w-full bg-white"
				data-testid={`self-media-home-card-preview-${postId}`}
			>
				<CardFrame
					cardId={`home-${postId}-${card.version ?? ""}`}
					fileId={card.fileId}
					version={card.version}
					attachmentList={attachmentList}
					imageProcessOptions={CARD_THUMBNAIL_IMAGE_PROCESS}
					className="h-full w-full"
					title={post.meta.title || post.meta.feedTitle || postId}
				/>
			</div>
		)

	return <FileText size={17} data-testid={`self-media-home-icon-fallback-${postId}`} />
}

function HomeCoverPreview({ cover, postId }: { cover: SelfMediaCard; postId: string }) {
	const { url } = useCoverImageUrl(
		cover.url ? undefined : cover.fileId,
		Boolean(cover.fileId && !cover.url),
		CARD_THUMBNAIL_IMAGE_PROCESS,
	)
	const coverUrl = cover.url || url

	if (!coverUrl)
		return <FileText size={17} data-testid={`self-media-home-icon-fallback-${postId}`} />

	return (
		<img
			src={coverUrl}
			alt=""
			className="h-full w-full object-cover"
			data-testid={`self-media-home-cover-preview-${postId}`}
		/>
	)
}

export default SelfMediaPostArticlePreview
