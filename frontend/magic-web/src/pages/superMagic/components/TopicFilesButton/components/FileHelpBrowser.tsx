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
interface ReadingEntry {
	id: FileHelpArticleId
	scrollTop: number
}
interface ReadingState {
	id: FileHelpArticleId
	history: ReadingEntry[]
}

function ancestorGroups(id: FileHelpArticleId): string[] {
	const group = getFileHelpMetadata(id).group
	return group === "assistant" || group === "crew" ? ["assistants", group] : [group]
}

/** 一个打开会话拥有一份阅读历史；文件、空间和应用路由都不参与文章跳转。 */
export default function FileHelpBrowser({
	initialArticleId,
	help: initialHelp,
	...dialogProps
}: FileHelpBrowserProps) {
	const { t, i18n } = useTranslation("interface")
	const [reading, setReading] = useState<ReadingState>({ id: initialArticleId, history: [] })
	const [expanded, setExpanded] = useState<ReadonlySet<string>>(
		() => new Set(ancestorGroups(initialArticleId)),
	)
	const contentRef = useRef<HTMLDivElement>(null)
	const positions = useRef(new Map<FileHelpArticleId, number>())
	const previousReading = useRef(reading)
	const article = useFileHelpArticle(reading.id)
	const catalog = useFileHelpCatalog()
	const help: HelpDefinition =
		reading.id === initialArticleId
			? { ...initialHelp, tone: getFileHelpMetadata(reading.id).tone }
			: (article ?? {
					title: catalog.labels[reading.id],
					summary: t("contextHelp.loadFailed"),
					renderBody: () => <p role="alert">{t("contextHelp.loadFailed")}</p>,
				})
	useLayoutEffect(() => {
		const element = contentRef.current
		if (element) element.scrollTop = positions.current.get(reading.id) ?? 0
		const changed = previousReading.current !== reading
		previousReading.current = reading
		// 目录选项或相关阅读会被隐藏／替换；把键盘阅读位置移到新文章，且不改滚动位置。
		if (changed) {
			const frame = requestAnimationFrame(() =>
				contentRef.current
					?.querySelector<HTMLElement>("[data-help-heading]")
					?.focus({ preventScroll: true }),
			)
			return () => cancelAnimationFrame(frame)
		}
	}, [reading, i18n.resolvedLanguage])

	function select(id: string) {
		if (!isFileHelpArticleId(id) || id === reading.id) return
		const element = contentRef.current
		const scrollTop = element?.clientHeight
			? element.scrollTop
			: (positions.current.get(reading.id) ?? 0)
		positions.current.set(reading.id, scrollTop)
		positions.current.set(id, 0)
		setReading({ id, history: [...reading.history, { id: reading.id, scrollTop }] })
		setExpanded((previous) => new Set([...previous, ...ancestorGroups(id)]))
	}
	function back() {
		const previous = reading.history.at(-1)
		if (!previous) return
		// 同一文章可能被多次访问；每次访问保存自己的位置，返回不能误用较新的位置。
		positions.current.set(previous.id, previous.scrollTop)
		setReading({ id: previous.id, history: reading.history.slice(0, -1) })
		setExpanded((value) => new Set([...value, ...ancestorGroups(previous.id)]))
	}
	const seen = new Set<FileHelpArticleId>([reading.id])
	function unique(links: FileHelpReadingLink[] = []) {
		return links.filter((link) => {
			if (!isFileHelpArticleId(link.id) || seen.has(link.id)) return false
			seen.add(link.id)
			return true
		})
	}
	const relations = getFileHelpRelations(reading.id)
	const further = unique(relations.further)
	const recommended = unique(relations.recommended)
	return (
		<HelpDialog
			{...dialogProps}
			help={help}
			articleKey={reading.id}
			contentRef={contentRef}
			onContentScroll={(event) => {
				if (event.currentTarget.clientHeight)
					positions.current.set(reading.id, event.currentTarget.scrollTop)
			}}
			onBack={reading.history.length ? back : undefined}
			navigation={
				<HelpNavigation
					groups={catalog.groups}
					activeId={reading.id}
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
