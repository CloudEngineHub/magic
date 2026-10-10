import { useRef, useState } from "react"
import { ListOrdered, Loader2, Pencil } from "lucide-react"
import { Button } from "@/components/shadcn-ui/button"
import { Input } from "@/components/shadcn-ui/input"
import { ScrollArea } from "@/components/shadcn-ui/scroll-area"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@/components/shadcn-ui/dialog"
import { useCanvas } from "../../../app/providers/CanvasProvider"
import { useCanvasDesignI18n } from "../../../app/providers/I18nProvider"
import type { ImageElement } from "../../../runtime/document/types"
import { usePortalContainer } from "../../primitives/custom/PortalContainerContext"
import { useImageRename } from "./useImageRename"
import RenameNameField from "./RenameNameField"
import ImageRenameFileRow from "./ImageRenameFileRow"

export default function ImageRenamePanel({ element }: { element: ImageElement }) {
	const { canvas } = useCanvas()
	const { t } = useCanvasDesignI18n()
	const container = usePortalContainer()
	const form = useImageRename(element)
	const [batchOpen, setBatchOpen] = useState(false)
	const baseBeforeFocus = useRef(form.baseName)
	const readyCount = new Set(form.rows.flatMap((row) => (row.file ? [row.file.fileId] : []))).size
	const pendingCount = form.rows.filter((row) => row.processing).length
	const titleChanged = form.elementName.trim() !== (element.name || "")
	const close = () => {
		if (!form.saving) canvas?.elementRenameManager.cancelRename()
	}
	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open) close()
			}}
		>
			<DialogContent
				container={container || undefined}
				className="grid max-h-[90dvh] w-[calc(100%-32px)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-[560px]"
				showCloseButton={!form.saving}
				onEscapeKeyDown={(event) => {
					// Radix 在字段的 keydown 之前处理 Esc；输入框的取消只作用于该字段。
					if (
						form.saving ||
						event.target instanceof HTMLInputElement ||
						event.target instanceof HTMLTextAreaElement
					)
						event.preventDefault()
				}}
			>
				<div className="px-5 pb-3 pt-4">
					<div className="mb-3 flex items-center gap-2.5">
						<Pencil size={16} className="text-muted-foreground" />
						<DialogTitle className="text-base">
							{t("rename.title", "重命名图片")}
						</DialogTitle>
					</div>
					<DialogDescription className="sr-only">
						{t("rename.description", "修改图片标题和各版本文件名，确认后生效。")}
					</DialogDescription>
					<div className="mb-1.5 flex flex-wrap items-center justify-between gap-1 text-xs text-muted-foreground">
						<span className="font-medium">
							{t("rename.imageTitle", "图片标题（元素名称）")}
						</span>
						<span>{t("rename.sharedTitle", "各版本共用，文件名独立")}</span>
					</div>
					<div className="rounded-lg border bg-background px-3 py-2 focus-within:border-ring focus-within:ring-1 focus-within:ring-ring">
						<RenameNameField
							value={form.elementName}
							onChange={form.setElementName}
							label={t("rename.imageTitle", "图片标题（元素名称）")}
							disabled={form.saving}
						/>
					</div>
					<div className="mt-3 flex items-center justify-between gap-2">
						<span className="text-xs font-medium text-muted-foreground">
							{t("rename.versionFiles", "版本文件名")}
						</span>
						<Button
							type="button"
							size="sm"
							variant="outline"
							className="h-8 gap-1.5 px-2.5 text-xs"
							disabled={form.saving}
							aria-expanded={batchOpen}
							onClick={() => setBatchOpen(!batchOpen)}
						>
							<ListOrdered size={16} />
							{batchOpen
								? t("rename.collapseBatch", "收起批量命名")
								: t("rename.batch", "批量命名")}
						</Button>
					</div>
					{!batchOpen && form.appliedBaseName && (
						<div className="mt-2 flex items-center justify-between gap-3 rounded-md border bg-muted/20 px-3 py-2 text-xs">
							<span className="shrink-0">
								{t("rename.filledCount", {
									defaultValue: "已填写 {{count}} 个文件",
									count: form.appliedFileCount,
								})}
							</span>
							<span className="min-w-0 truncate text-muted-foreground">
								{form.appliedBaseName}_v1、_v2…
							</span>
						</div>
					)}
					{batchOpen && (
						<div className="mt-2 rounded-lg bg-muted/30 px-3 py-2.5">
							<div className="mb-2 flex flex-wrap items-center justify-between gap-1 text-xs">
								<span className="font-medium">
									{t("rename.batchSetting", "批量设置名称")}
								</span>
								<span className="text-muted-foreground">
									{t("rename.fileCount", {
										defaultValue: "{{count}} 个文件",
										count: readyCount,
									})}{" "}
									·{" "}
									{form.appliedBaseName === form.baseName.trim() &&
									form.appliedFileCount === readyCount
										? t("rename.filled", "已填写")
										: t("rename.unapplied", "待应用")}
								</span>
							</div>
							<div className="flex flex-wrap items-center gap-2">
								<div className="flex min-w-0 flex-1 items-center overflow-hidden rounded-md border bg-background focus-within:border-ring focus-within:ring-1 focus-within:ring-ring">
									<Input
										aria-label={t("rename.baseName", "批量命名基础名称")}
										className="h-9 min-w-0 border-0 text-sm shadow-none focus-visible:ring-0"
										value={form.baseName}
										disabled={form.saving}
										onFocus={() => {
											baseBeforeFocus.current = form.baseName
										}}
										onKeyDown={(event) => {
											if (
												event.nativeEvent.isComposing ||
												event.nativeEvent.keyCode === 229
											)
												return
											if (event.key === "Enter") {
												event.preventDefault()
												event.currentTarget.blur()
											}
											if (event.key === "Escape") {
												event.preventDefault()
												event.stopPropagation()
												form.setBaseName(baseBeforeFocus.current)
												event.currentTarget.blur()
											}
										}}
										onChange={(event) => form.setBaseName(event.target.value)}
									/>
									<span className="shrink-0 border-l bg-muted/30 px-2.5 py-2 text-xs text-muted-foreground">
										_v1、_v2…
									</span>
								</div>
								<Button
									type="button"
									size="sm"
									variant="outline"
									className="h-9 shrink-0 text-xs"
									disabled={form.saving || !form.baseName.trim() || !readyCount}
									onClick={form.applyUniformNames}
								>
									{t("rename.uniform", "批量应用到下方")}
								</Button>
							</div>
							<p className="mb-0 mt-2 text-xs leading-5 text-muted-foreground">
								{t(
									"rename.uniformHint",
									"点击「批量应用到下方」填写各版本名称，确认后才改文件。",
								)}
								{pendingCount > 0 && (
									<>
										{" "}
										{t("rename.pendingExcluded", {
											defaultValue: "{{count}} 个生成中版本暂不参与。",
											count: pendingCount,
										})}
									</>
								)}
							</p>
						</div>
					)}
				</div>
				{/* 少量版本按内容决定高度；达到窗口上限时只有文件列表滚动。 */}
				<div className="grid min-h-0 grid-rows-[minmax(0,1fr)] overflow-hidden border-y">
					<ScrollArea
						className="min-h-0"
						viewportClassName="[&>div]:!block"
						viewportStyle={{ maxHeight: "min(60dvh, 440px)" }}
					>
						<ul className="m-0 list-none divide-y divide-border p-0">
							{form.rows.map((row) => (
								<ImageRenameFileRow
									key={row.content.contentId}
									row={row}
									element={element}
									saving={form.saving}
									onChange={form.setFileName}
								/>
							))}
						</ul>
					</ScrollArea>
				</div>
				<div className="px-5 py-4">
					{form.error && (
						<p role="alert" className="mb-3 mt-0 text-xs text-destructive">
							{form.error}
						</p>
					)}
					<div className="flex flex-wrap items-center justify-between gap-3">
						<div
							className="flex flex-wrap gap-2 text-xs text-muted-foreground"
							aria-live="polite"
						>
							{form.titleSaved && (
								<span className="text-success">
									{t("rename.titleSaved", "元素名称已保存")}
								</span>
							)}
							{form.successCount > 0 && (
								<span className="text-success">
									{t("rename.succeeded", {
										defaultValue: "{{count}} 个文件已改名",
										count: form.successCount,
									})}
								</span>
							)}
							{form.failedCount > 0 && (
								<span className="text-destructive">
									{t("rename.failedCount", {
										defaultValue: "{{count}} 个文件未改名",
										count: form.failedCount,
									})}
								</span>
							)}
							{!form.successCount &&
								!form.failedCount &&
								!form.titleSaved &&
								(form.changes.length > 0 ? (
									<span>
										{t("rename.changesCount", {
											defaultValue: "{{count}} 个文件待重命名",
											count: form.changes.length,
										})}
										{titleChanged && (
											<> · {t("rename.titleChanged", "标题待修改")}</>
										)}
									</span>
								) : (
									<span>
										{titleChanged
											? t("rename.titleChanged", "标题待修改")
											: t("rename.unchanged", "名称尚未修改")}
									</span>
								))}
						</div>
						<div className="ml-auto flex items-center gap-2">
							<Button
								type="button"
								variant="ghost"
								size="sm"
								onClick={form.saving ? form.requestStop : close}
							>
								{form.saving
									? t("rename.stop", "停止后续操作")
									: form.titleSaved || form.successCount > 0
										? t("rename.close", "关闭")
										: t("rename.cancel", "取消")}
							</Button>
							<Button
								type="button"
								size="sm"
								disabled={form.saving || !form.dirty || !form.elementName.trim()}
								onClick={() => void form.save()}
							>
								{form.saving && <Loader2 size={16} className="animate-spin" />}
								{form.failedCount
									? t("rename.retry", "重试未完成项")
									: t("rename.save", "确认重命名")}
							</Button>
						</div>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	)
}
