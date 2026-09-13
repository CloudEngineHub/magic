import { BookOpen, X } from "lucide-react"
import { Suspense } from "react"
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
import type { HelpDefinition } from "./types"

interface HelpDialogProps {
	id: string
	help: HelpDefinition
	onCloseAutoFocus: (event: Event) => void
}

/** 在局部错误边界内部求值正文，正文加载失败时仍能关闭说明。 */
function HelpBody({ help }: { help: HelpDefinition }) {
	return <>{help.renderBody()}</>
}

export function HelpDialog({ id, help, onCloseAutoFocus }: HelpDialogProps) {
	const { t } = useTranslation("interface")
	return (
		<DialogContent
			id={id}
			showCloseButton={false}
			className="flex h-[82dvh] max-h-[900px] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(960px,calc(100%-3rem))]"
			onCloseAutoFocus={onCloseAutoFocus}
			onPointerDown={(event) => event.stopPropagation()}
			onClick={(event) => event.stopPropagation()}
			onDoubleClick={(event) => event.stopPropagation()}
			onKeyDown={(event) => event.stopPropagation()}
		>
			<DialogHeader className="flex h-16 shrink-0 flex-row items-center gap-3 space-y-0 border-b px-5 text-left sm:h-[68px] sm:px-6">
				<span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/5 text-primary">
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
			<div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
				{/* 外框提供留白，正文保持适中行长；窄屏按可用宽度排版。 */}
				<div className="mx-auto max-w-[720px] space-y-8 break-words px-5 py-8 text-sm leading-7 sm:px-8 sm:py-10">
					<ErrorBoundary fallback={<p role="alert">{t("contextHelp.loadFailed")}</p>}>
						<Suspense fallback={<p role="status">{t("contextHelp.loading")}</p>}>
							{help.identity ? (
								<div className="mb-7 flex items-center gap-4">
									<span className="inline-flex size-10 shrink-0 items-center justify-center">
										{help.identity.renderIcon(40)}
									</span>
									<div className="min-w-0">
										<div className="flex flex-wrap items-center gap-x-3 gap-y-1">
											<h2 className="break-all text-2xl font-semibold leading-8">
												{help.identity.name}
											</h2>
											<span className="rounded-md border px-2 py-0.5 text-xs text-muted-foreground">
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
								<h2 className="mb-6 text-xl font-semibold">{help.title}</h2>
							)}
							<HelpBody help={help} />
						</Suspense>
					</ErrorBoundary>
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
