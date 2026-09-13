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
			className="flex h-[82dvh] max-h-[900px] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(960px,calc(100%-3rem))]"
			onCloseAutoFocus={onCloseAutoFocus}
			onPointerDown={(event) => event.stopPropagation()}
			onClick={(event) => event.stopPropagation()}
			onDoubleClick={(event) => event.stopPropagation()}
			onKeyDown={(event) => event.stopPropagation()}
		>
			<DialogHeader className="shrink-0 border-b px-6 py-5 text-left sm:px-8">
				<DialogTitle className="pr-7 leading-6">{help.title}</DialogTitle>
				<DialogDescription>{help.subtitle ?? help.summary}</DialogDescription>
			</DialogHeader>
			{/* 标题和关闭操作始终可见，长说明只在正文区域滚动。 */}
			<div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
				{/* 外框提供留白，正文保持适中行长；窄屏按可用宽度排版。 */}
				<div className="mx-auto max-w-[720px] space-y-8 break-words px-5 py-8 text-sm leading-7 sm:px-8 sm:py-10">
					<ErrorBoundary fallback={<p role="alert">{t("contextHelp.loadFailed")}</p>}>
						<Suspense fallback={<p role="status">{t("contextHelp.loading")}</p>}>
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
