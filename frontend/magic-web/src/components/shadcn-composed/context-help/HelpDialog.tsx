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
			className="flex max-h-[85dvh] flex-col gap-0 p-0 sm:max-w-[560px]"
			onCloseAutoFocus={onCloseAutoFocus}
			onPointerDown={(event) => event.stopPropagation()}
			onClick={(event) => event.stopPropagation()}
			onDoubleClick={(event) => event.stopPropagation()}
			onKeyDown={(event) => event.stopPropagation()}
		>
			<DialogHeader className="shrink-0 px-5 pb-4 pt-5 text-left">
				<DialogTitle className="pr-7 leading-6">{help.title}</DialogTitle>
				<DialogDescription>{help.subtitle ?? help.summary}</DialogDescription>
			</DialogHeader>
			{/* 标题和关闭操作始终可见，长说明只在正文区域滚动。 */}
			<div className="min-h-0 space-y-5 overflow-y-auto px-5 pb-5 text-sm leading-6">
				<ErrorBoundary fallback={<p role="alert">{t("contextHelp.loadFailed")}</p>}>
					<Suspense fallback={<p role="status">{t("contextHelp.loading")}</p>}>
						<HelpBody help={help} />
					</Suspense>
				</ErrorBoundary>
			</div>
			<DialogFooter className="shrink-0 border-t px-5 py-3">
				<DialogClose asChild>
					<Button>{t("contextHelp.close")}</Button>
				</DialogClose>
			</DialogFooter>
		</DialogContent>
	)
}
