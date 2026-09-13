import { useLayoutEffect, useRef, useState } from "react"
import { ArrowRight } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/shadcn-ui/button"
import { HelpDialog } from "@/components/shadcn-composed/context-help/HelpDialog"
import { HelpNavigation } from "@/components/shadcn-composed/context-help/HelpNavigation"
import type {
	HelpDefinition,
	HelpDialogProps,
} from "@/components/shadcn-composed/context-help/types"
import { useFileHelpArticle, useFileHelpCatalog } from "../hooks/useFileHelpArticle"
import {
	getFileHelpMetadata,
	getFileHelpRelations,
	isFileHelpArticleId,
	type FileHelpArticleId,
	type FileHelpReadingLink,
} from "../utils/file-help-catalog"

interface FileHelpBrowserProps extends HelpDialogProps {
	initialArticleId: FileHelpArticleId
}

function ancestorGroups(id: FileHelpArticleId): string[] {
	const group = getFileHelpMetadata(id).group
	return group === "assistant" || group === "crew" ? ["assistants", group] : [group]
}

/** 一个打开会话只管理当前文章；文件、空间和应用路由都不参与文章跳转。 */
export default function FileHelpBrowser({
	initialArticleId,
	help: initialHelp,
	...dialogProps
}: FileHelpBrowserProps) {
	const { t } = useTranslation("interface")
	const [articleId, setArticleId] = useState(initialArticleId)
	const [expanded, setExpanded] = useState<ReadonlySet<string>>(
		() => new Set(ancestorGroups(initialArticleId)),
	)
	const contentRef = useRef<HTMLDivElement>(null)
	const previousArticleId = useRef(articleId)
	const article = useFileHelpArticle(articleId)
	const catalog = useFileHelpCatalog()
	const help: HelpDefinition =
		articleId === initialArticleId
			? { ...initialHelp, tone: getFileHelpMetadata(articleId).tone }
			: (article ?? {
					title: catalog.labels[articleId],
					summary: t("contextHelp.loadFailed"),
					renderBody: () => <p role="alert">{t("contextHelp.loadFailed")}</p>,
				})
	useLayoutEffect(() => {
		const changed = previousArticleId.current !== articleId
		previousArticleId.current = articleId
		// 只有选择另一篇文章才回到顶部；语言变化沿用当前文章和浏览器中的阅读位置。
		// 目录选项或相关阅读会被隐藏／替换；把键盘阅读位置移到新文章，且不改滚动位置。
		if (changed) {
			const frame = requestAnimationFrame(() => {
				const element = contentRef.current
				if (!element) return
				element.scrollTop = 0
				element
					.querySelector<HTMLElement>("[data-help-heading]")
					?.focus({ preventScroll: true })
			})
			return () => cancelAnimationFrame(frame)
		}
	}, [articleId])

	function select(id: string) {
		if (!isFileHelpArticleId(id) || id === articleId) return
		setArticleId(id)
		setExpanded((previous) => new Set([...previous, ...ancestorGroups(id)]))
	}
	const seen = new Set<FileHelpArticleId>([articleId])
	function unique(links: FileHelpReadingLink[] = []) {
		return links.filter((link) => {
			if (!isFileHelpArticleId(link.id) || seen.has(link.id)) return false
			seen.add(link.id)
			return true
		})
	}
	const relations = getFileHelpRelations(articleId)
	const further = unique(relations.further)
	const recommended = unique(relations.recommended)
	return (
		<HelpDialog
			{...dialogProps}
			help={help}
			articleKey={articleId}
			contentRef={contentRef}
			navigation={
				<HelpNavigation
					groups={catalog.groups}
					activeId={articleId}
					expanded={expanded}
					onSelect={select}
					onExpandedChange={(id, open) =>
						setExpanded((previous) => {
							const next = new Set(previous)
							if (open) next.add(id)
							else next.delete(id)
							return next
						})
					}
				/>
			}
			reading={{
				further: further.length ? (
					<aside className="space-y-2">
						<h3 className="text-xs font-medium text-muted-foreground">
							{t("contextHelp.furtherReading")}
						</h3>
						{further.map((link) => (
							<Button
								key={link.id}
								variant="link"
								className="h-auto justify-start whitespace-normal p-0 text-left text-sm text-[var(--help-accent)]"
								onClick={() => select(link.id)}
							>
								{catalog.labels[link.id]}
								<ArrowRight size={14} aria-hidden />
							</Button>
						))}
					</aside>
				) : undefined,
				recommended: recommended.length ? (
					<section className="space-y-3">
						<h3 className="text-lg font-semibold">
							{t("contextHelp.recommendedReading")}
						</h3>
						<div className="grid gap-3 [@container_help-article_(min-width:500px)]:grid-cols-2">
							{recommended.map((link) => (
								<Button
									key={link.id}
									variant="outline"
									onClick={() => select(link.id)}
									className="h-auto min-w-0 flex-col items-start gap-2 whitespace-normal rounded-xl p-4 text-left hover:border-[var(--help-accent)] hover:bg-[var(--help-soft)]"
								>
									<span className="flex w-full items-start justify-between gap-2 text-sm font-medium">
										{catalog.labels[link.id]}
										<ArrowRight size={16} className="shrink-0" aria-hidden />
									</span>
									<span className="text-xs font-normal leading-5 text-muted-foreground">
										{catalog.reasons[link.reason]}
									</span>
								</Button>
							))}
						</div>
					</section>
				) : undefined,
			}}
		/>
	)
}
