import { BookOpen, PanelLeft, X } from "lucide-react"
import { Suspense, useLayoutEffect, useState } from "react"
import { ErrorBoundary } from "react-error-boundary"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/shadcn-ui/button"
import {
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/shadcn-ui/dialog"
import { cn } from "@/utils/cn"
import type { HelpDefinition, HelpDialogProps, HelpReadingLinks, HelpTone } from "./types"

const TONE_CLASSES: Record<HelpTone, string> = {
	neutral: "[--help-accent:rgb(var(--foreground-rgb))] [--help-soft:rgb(var(--muted-rgb))]",
	indigo: "[--help-accent:#6366f1] [--help-soft:#f3f2ff] dark:[--help-accent:#a5a7ff] dark:[--help-soft:#303044]",
	red: "[--help-accent:#f0443a] [--help-soft:#fff2ef] dark:[--help-accent:#ff9b91] dark:[--help-soft:#412d2e]",
	amber: "[--help-accent:#cb7b1b] [--help-soft:#fff8eb] dark:[--help-accent:#e4b477] dark:[--help-soft:#393126]",
	teal: "[--help-accent:#268d7a] [--help-soft:#edf9f5] dark:[--help-accent:#85d4c1] dark:[--help-soft:#263b35]",
}

/** 在局部错误边界内部求值正文，正文加载失败时仍能关闭说明。 */
function HelpBody({ help, reading }: { help: HelpDefinition; reading?: HelpReadingLinks }) {
	return <>{help.renderBody(reading, help.identity)}</>
}

export function HelpDialog({
	id,
	help,
	onCloseAutoFocus,
	navigation,
	articleKey,
	reading,
	contentRef,
}: HelpDialogProps) {
	const { t, i18n } = useTranslation("interface")
	const [layoutElement, setLayoutElement] = useState<HTMLDivElement | null>(null)
	const [narrow, setNarrow] = useState(true)
	const [desktopNavigation, setDesktopNavigation] = useState(true)
	const [mobileNavigation, setMobileNavigation] = useState(false)
	const hasNavigation = Boolean(navigation)
	const showNavigation = hasNavigation && (narrow ? mobileNavigation : desktopNavigation)
	useLayoutEffect(() => {
		const element = layoutElement
		if (!element || !hasNavigation) return
		// Portal 会晚于父组件挂载内容；由实际节点驱动监听，避免首次 ref 为空后一直按窄屏显示。
		// 224px 目录会挤压窄容器；按弹窗实际宽度切换，避免误用整页桌面状态。
		const resize = new ResizeObserver(([entry]) => setNarrow(entry.contentRect.width < 880))
		setNarrow(element.clientWidth < 880)
		resize.observe(element)
		return () => resize.disconnect()
	}, [hasNavigation, layoutElement])
	// 先让窄屏正文可见，再执行文章切换后的滚动和聚焦。
	useLayoutEffect(() => setMobileNavigation(false), [articleKey])
	return (
		<DialogContent
			id={id}
			showCloseButton={false}
			className={cn(
				"flex h-[82dvh] max-h-[900px] flex-col gap-0 overflow-hidden rounded-[18px] p-0",
				navigation
					? "sm:max-w-[min(1120px,calc(100%-3rem))]"
					: "sm:max-w-[min(960px,calc(100%-3rem))]",
				TONE_CLASSES[help.tone ?? "neutral"],
			)}
			onCloseAutoFocus={onCloseAutoFocus}
			onPointerDown={(event) => event.stopPropagation()}
			onClick={(event) => event.stopPropagation()}
			onDoubleClick={(event) => event.stopPropagation()}
			onKeyDown={(event) => event.stopPropagation()}
		>
			<DialogHeader className="flex h-16 shrink-0 flex-row items-center gap-3 space-y-0 border-b px-5 text-left sm:h-[68px] sm:px-6">
				<span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-[var(--help-soft)] text-[var(--help-accent)]">
					<BookOpen size={18} aria-hidden />
				</span>
				<div className="min-w-0 flex-1 space-y-0.5">
					<DialogTitle className="text-sm leading-5">
						{t("contextHelp.guideTitle")}
					</DialogTitle>
					<DialogDescription className="text-xs">
						{t("contextHelp.guideSubtitle")}
					</DialogDescription>
				</div>
				{navigation && (
					<Button
						variant="ghost"
						size="icon-lg"
						className="size-10 shrink-0 [@media(pointer:coarse)]:size-11"
						aria-label={t("contextHelp.contents")}
						aria-controls={`${id}-contents`}
						aria-expanded={showNavigation}
						onClick={() =>
							narrow
								? setMobileNavigation((value) => !value)
								: setDesktopNavigation((value) => !value)
						}
					>
						<PanelLeft size={20} aria-hidden />
					</Button>
				)}
				<DialogClose asChild>
					<Button
						variant="ghost"
						size="icon-lg"
						aria-label={t("contextHelp.dismiss")}
						className="group size-10 shrink-0 cursor-pointer rounded-lg bg-muted/40 text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring active:bg-accent motion-reduce:transition-none [@media(pointer:coarse)]:size-11"
					>
						<X
							className="size-5 transition-transform duration-150 group-active:scale-90 motion-reduce:transition-none"
							aria-hidden
						/>
					</Button>
				</DialogClose>
			</DialogHeader>
			{/* 标题和关闭操作始终可见，长说明只在正文区域滚动。 */}
			<div ref={setLayoutElement} className="flex min-h-0 flex-1">
				{navigation && (
					<aside
						id={`${id}-contents`}
						className={cn(
							"min-h-0 shrink-0 overflow-y-auto overscroll-contain bg-muted/20",
							narrow ? "w-full" : "w-56 border-r",
							!showNavigation && "hidden",
						)}
					>
						{navigation}
					</aside>
				)}
				<div
					className={cn(
						"flex min-w-0 flex-1 flex-col",
						narrow && showNavigation && "hidden",
					)}
				>
					<div
						ref={contentRef}
						className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]"
					>
						{/* 外框提供留白，正文保持适中行长；窄屏按可用宽度排版。 */}
						<div className="mx-auto max-w-[790px] space-y-8 break-words px-5 py-8 text-[15px] leading-[1.75] [container-name:help-article] [container-type:inline-size] sm:px-[38px] sm:py-9">
							<ErrorBoundary
								resetKeys={[articleKey, i18n.resolvedLanguage]}
								fallback={<p role="alert">{t("contextHelp.loadFailed")}</p>}
							>
								<Suspense
									fallback={<p role="status">{t("contextHelp.loading")}</p>}
								>
									{help.identity ? (
										<div className="mb-7 flex items-center gap-4">
											<span className="inline-flex size-[52px] shrink-0 items-center justify-center rounded-[13px] bg-[var(--help-soft)] sm:size-16 sm:rounded-2xl">
												<span className="inline-flex scale-[.85] sm:scale-100">
													{help.identity.renderIcon(40)}
												</span>
											</span>
											<div className="min-w-0">
												<div className="flex flex-wrap items-center gap-x-3 gap-y-1">
													<h2
														data-help-heading
														tabIndex={-1}
														className="break-all text-[21px] font-semibold leading-8 outline-none sm:text-2xl"
													>
														{help.identity.name}
													</h2>
													<span className="rounded-md bg-[var(--help-soft)] px-2 py-0.5 text-[11px] text-[var(--help-accent)]">
														{help.title}
													</span>
												</div>
												{help.identity.scope && (
													<p className="mt-1 text-xs text-muted-foreground">
														{help.identity.scope}
													</p>
												)}
											</div>
										</div>
									) : (
										<h2
											data-help-heading
											tabIndex={-1}
											className="mb-6 text-xl font-semibold outline-none"
										>
											{help.title}
										</h2>
									)}
									<HelpBody help={help} reading={reading} />
								</Suspense>
							</ErrorBoundary>
						</div>
					</div>
				</div>
			</div>
			<DialogFooter className="shrink-0 border-t px-5 py-3">
				<DialogClose asChild>
					<Button>{t("contextHelp.close")}</Button>
				</DialogClose>
			</DialogFooter>
		</DialogContent>
	)
}
