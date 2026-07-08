import { useEffect, useMemo, useRef } from "react"
import { useTranslation } from "react-i18next"
import {
	Headphones,
	Heart,
	MessageSquarePlus,
	MoreHorizontal,
	Share2,
	Star,
	ThumbsUp,
	X,
} from "lucide-react"
import type { SelfMediaPost } from "../../types"
import PhoneShell from "../../components/PhoneShell"
import { usePhoneScaling } from "../../hooks/usePhoneScaling"
import { WECHAT_PHONE_HEIGHT, WECHAT_PHONE_WIDTH } from "./wechatShellConstants"

const WECHAT_ARTICLE_PHONE_PREVIEW_MAX_SCALE = 1.2
const WECHAT_ARTICLE_PHONE_PREVIEW_RESET = `
<style data-wechat-phone-preview-reset="true">
	:host {
		display: block;
		max-width: 100%;
		overflow-x: hidden;
		color: #1f1f1f;
		font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, "PingFang SC", "Microsoft YaHei", Arial, sans-serif;
	}
	:host *, :host *::before, :host *::after {
		box-sizing: border-box;
		max-width: 100%;
	}
	:host img, :host svg, :host video, :host canvas {
		height: auto;
		max-width: 100%;
	}
	:host table {
		display: block;
		width: 100%;
		overflow-x: auto;
	}
</style>`

interface WechatArticlePhonePreviewProps {
	post: SelfMediaPost
	renderedContent: string
}

function getMetaText(value: unknown, fallback: string) {
	if (typeof value === "string" && value.trim()) return value.trim()
	if (typeof value === "number") return String(value)
	return fallback
}

function getShadowArticleHtml(html: string) {
	if (typeof DOMParser === "undefined") return html

	const document = new DOMParser().parseFromString(html, "text/html")
	document.querySelectorAll("script").forEach((node) => node.remove())

	const headStyles = Array.from(document.head.querySelectorAll("style, link[rel='stylesheet']"))
		.map((node) => node.outerHTML)
		.join("")
	const body = document.body.innerHTML || html

	return `${WECHAT_ARTICLE_PHONE_PREVIEW_RESET}${headStyles}${body}`
}

function ShadowArticleHtml({ html }: { html: string }) {
	const hostRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		const host = hostRef.current
		if (!host) return
		const shadowRoot = host.shadowRoot ?? host.attachShadow({ mode: "open" })
		shadowRoot.innerHTML = html
	}, [html])

	return <div ref={hostRef} className="w-full" data-testid="wechat-article-phone-inline-html" />
}

export default function WechatArticlePhonePreview({
	post,
	renderedContent,
}: WechatArticlePhonePreviewProps) {
	const { t } = useTranslation("super")
	const { containerRef, scale } = usePhoneScaling<HTMLDivElement>({
		designWidth: WECHAT_PHONE_WIDTH + 28,
		designHeight: WECHAT_PHONE_HEIGHT + 28,
		padding: 0,
		maxScale: WECHAT_ARTICLE_PHONE_PREVIEW_MAX_SCALE,
	})

	const display = useMemo(() => {
		const meta = post.meta
		const author = getMetaText(meta.author || meta.accountName, "公众号预览")
		return {
			title: getMetaText(meta.title || meta.feedTitle, "未命名文章"),
			author,
			subtitle: getMetaText(meta.subtitle, "线下见面的"),
			publishedAt: getMetaText(meta.publishTime || meta.time, "今天"),
			location: getMetaText(meta.location, "浙江"),
			readCount: getMetaText(meta.readCount || meta.reads, "2人"),
			likes: getMetaText(meta.feedLikes || meta.likes, "28"),
			shares: getMetaText(meta.shareCount, "124"),
			favorites: getMetaText(meta.favoriteCount || meta.stars, "7"),
			avatarChar: author.slice(0, 1).toUpperCase(),
		}
	}, [post.meta])
	const shadowArticleHtml = useMemo(
		() => getShadowArticleHtml(renderedContent),
		[renderedContent],
	)

	return (
		<div
			ref={containerRef}
			className="flex h-full w-full items-start justify-center overflow-hidden bg-[#f5f6f8] px-4 py-8 duration-300 ease-out animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2"
			data-testid="wechat-article-phone-frame"
		>
			<PhoneShell
				scale={scale}
				width={WECHAT_PHONE_WIDTH}
				height={WECHAT_PHONE_HEIGHT}
				theme="dark"
				innerClassName="bg-white"
				style={{ transformOrigin: "top center" }}
			>
				<div
					className="relative flex h-full w-full flex-col bg-white pt-[54px] text-[#1f1f1f]"
					data-testid="wechat-article-phone-browser-content"
				>
					<div className="flex h-16 items-center justify-between px-5">
						<button
							type="button"
							className="flex h-11 w-11 items-center justify-center text-[#1f1f1f]"
							aria-label={t(
								"detail.selfMedia.platform.wechat-official-accounts.phonePreview.close",
								"关闭预览",
							)}
							data-testid="wechat-article-phone-preview-close-button"
						>
							<X size={27} strokeWidth={1.9} />
						</button>
						<button
							type="button"
							className="flex h-11 w-11 items-center justify-center text-[#1f1f1f]"
							aria-label={t(
								"detail.selfMedia.platform.wechat-official-accounts.phonePreview.more",
								"更多",
							)}
							data-testid="wechat-article-phone-preview-more-button"
						>
							<MoreHorizontal size={28} strokeWidth={2.3} />
						</button>
					</div>

					<div className="min-h-0 flex-1 overflow-y-auto pb-[86px]">
						<header className="px-6 pb-7 pt-3" data-testid="wechat-article-phone-meta">
							<h1 className="m-0 text-[28px] font-medium leading-[1.28] tracking-normal text-[#111]">
								{display.title}
							</h1>
							<div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 text-[15px] leading-6 text-[#b1b1b1]">
								<span className="rounded bg-[#f4f4f4] px-1.5 py-0.5 text-[13px] text-[#b8b8b8]">
									{t(
										"detail.selfMedia.platform.wechat-official-accounts.phonePreview.original",
										"原创",
									)}
								</span>
								<span>{display.subtitle}</span>
								<span className="text-[#576b95]">{display.author}</span>
							</div>
							<div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-[15px] leading-6 text-[#b1b1b1]">
								<span>{display.publishedAt}</span>
								<span>{display.location}</span>
								<span className="inline-flex items-center gap-1 text-[#576b95]">
									<Headphones size={15} strokeWidth={2} />
									{display.readCount}
								</span>
								<span className="inline-flex items-center gap-1 text-[#576b95]">
									<Star size={16} strokeWidth={1.9} />
									{t(
										"detail.selfMedia.platform.wechat-official-accounts.phonePreview.star",
										"星标",
									)}
								</span>
							</div>
						</header>

						<div className="px-6 pb-8">
							<ShadowArticleHtml html={shadowArticleHtml} />
						</div>
					</div>

					<div
						className="bg-white/96 absolute bottom-0 left-0 right-0 flex h-[78px] items-center border-t border-[#ededed] px-5 backdrop-blur"
						data-testid="wechat-article-phone-bottom-bar"
					>
						<div className="flex min-w-0 flex-1 items-center gap-2.5">
							<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#111827] text-[16px] font-semibold text-white">
								{display.avatarChar}
							</div>
							<div className="min-w-0 truncate text-[17px] font-semibold text-[#1f1f1f]">
								{display.author}
							</div>
						</div>
						<div className="flex items-center gap-5 text-[#1f1f1f]">
							<div className="flex flex-col items-center gap-1 text-[12px] leading-none">
								<ThumbsUp size={22} strokeWidth={1.9} />
								<span>{display.likes}</span>
							</div>
							<div className="flex flex-col items-center gap-1 text-[12px] leading-none">
								<Share2 size={22} strokeWidth={1.9} />
								<span>{display.shares}</span>
							</div>
							<div className="flex flex-col items-center gap-1 text-[12px] leading-none">
								<Heart size={23} strokeWidth={1.9} />
								<span>{display.favorites}</span>
							</div>
							<div className="flex flex-col items-center gap-1 text-[12px] leading-none">
								<MessageSquarePlus size={22} strokeWidth={1.9} />
								<span>
									{t(
										"detail.selfMedia.platform.wechat-official-accounts.phonePreview.comment",
										"写留言",
									)}
								</span>
							</div>
						</div>
					</div>
				</div>
			</PhoneShell>
		</div>
	)
}
