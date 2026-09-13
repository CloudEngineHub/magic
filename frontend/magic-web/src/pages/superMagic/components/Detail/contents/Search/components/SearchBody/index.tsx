import { memo, useCallback } from "react"
import { Typography } from "antd"
import { Globe } from "lucide-react"
import { useTranslation } from "react-i18next"
import MagicImage from "@/components/base/MagicImage"

export interface SearchResult {
	title: string
	snippet: string
	url: string
	icon_url?: string
}

export interface SearchGroup {
	keyword: string
	query?: string | null
	results: SearchResult[]
}

interface SearchBodyProps {
	currentGroup?: SearchGroup
}

export default memo(function SearchBody({ currentGroup }: SearchBodyProps) {
	const { t } = useTranslation("super")

	// Parse HTML to extract text content only
	const parseHTML = useCallback((html: string) => {
		return html.replace(/<[^>]*>?/g, "")
	}, [])

	// Highlight keywords in text
	const highlightKeywords = useCallback((text: string, kw: string | string[]) => {
		if (!kw || !text) return text

		const normalizedKeywords = Array.isArray(kw) ? kw : kw.split(/\s+/)
		const keywords = normalizedKeywords
			.filter((word) => word && typeof word === "string" && word.trim().length > 0)
			.map((word) => word.trim())

		if (keywords.length === 0) return text

		try {
			const pattern = keywords
				.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
				.join("|")
			const regex = new RegExp(`(${pattern})`, "gi")
			const parts = text.split(regex)

			// split 的捕获组位于奇数位置；直接使用命中片段，避免全局正则的 lastIndex 干扰下一段。
			return parts.map((part, index) =>
				index % 2 === 1 ? (
					<strong key={index} className="font-semibold text-foreground">
						{part}
					</strong>
				) : (
					part
				),
			)
		} catch (error) {
			console.warn("Regex error in highlightKeywords:", error)
			return text
		}
	}, [])

	const results = currentGroup?.results || []
	const query = currentGroup?.query || currentGroup?.keyword || ""

	if (!results.length) {
		return (
			<div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 overflow-y-auto p-7 text-center">
				<p className="text-sm text-foreground">
					{currentGroup ? t("search.emptyGroupTitle") : t("search.emptyResults")}
				</p>
				{currentGroup && (
					<p className="text-xs text-muted-foreground">
						{t("search.emptyGroupDescription")}
					</p>
				)}
			</div>
		)
	}

	return (
		<div className="min-h-0 flex-1 overflow-y-auto px-7 pb-6 pt-5 max-md:px-4">
			<div className="flex max-w-[800px] flex-col gap-7">
				{results.map((item, index) => {
					const title = parseHTML(item.title)
					const info = parseHTML(item.snippet)
					let source = item.url
					let visibleUrl = item.url
					try {
						const url = new URL(item.url)
						source = url.hostname
						visibleUrl = `${url.hostname}${url.pathname}`
					} catch {
						// 外部结果的 URL 不可解析时仍显示原文，不让单条来源异常打断整组结果。
					}

					return (
						<article key={`${item.url}-${index}`} className="min-w-0">
							<a
								href={item.url}
								target="_blank"
								rel="noopener noreferrer"
								className="mb-1.5 flex w-fit max-w-full items-center gap-2.5 text-foreground no-underline hover:no-underline"
								title={item.url}
								data-testid="search-body-link-2"
							>
								<span className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted">
									<MagicImage
										src={item.icon_url}
										width={16}
										height={16}
										className="rounded-sm"
										fallback={
											<Globe
												size={16}
												className="text-muted-foreground"
												aria-hidden
											/>
										}
									/>
								</span>
								<span className="min-w-0">
									<span className="block truncate text-[13px] leading-5">
										{source}
									</span>
									<span className="block truncate text-[11px] leading-4 text-muted-foreground">
										{visibleUrl}
									</span>
								</span>
							</a>
							<a
								href={item.url}
								target="_blank"
								rel="noopener noreferrer"
								className="mb-1.5 block break-words text-xl font-normal leading-[1.45] text-blue-700 no-underline hover:underline dark:text-blue-300 max-md:text-lg"
								title={title}
								data-testid="search-body-link"
							>
								{title}
							</a>
							{/* 只折叠已返回的摘要，不截短数据或重新抓取网页；溢出测量与展开状态交给排版组件。 */}
							<Typography.Paragraph
								className="!mb-0 !text-sm !leading-relaxed !text-muted-foreground"
								title={info}
								ellipsis={{
									rows: 3,
									expandable: "collapsible",
									symbol: (expanded) => (
										<span className="text-xs text-muted-foreground underline decoration-dotted underline-offset-4">
											{expanded
												? t("search.collapseSnippet")
												: t("search.expandSnippet")}
										</span>
									),
								}}
							>
								{highlightKeywords(info, query)}
							</Typography.Paragraph>
						</article>
					)
				})}
			</div>
		</div>
	)
})
