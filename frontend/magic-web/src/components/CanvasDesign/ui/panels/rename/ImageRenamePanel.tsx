import { CircleCheck, CircleX, Image, Loader2 } from "lucide-react"
import { Button } from "@/components/shadcn-ui/button"
import { Input } from "@/components/shadcn-ui/input"
import { ScrollArea } from "@/components/shadcn-ui/scroll-area"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/shadcn-ui/dialog"
import { useCanvas } from "../../../app/providers/CanvasProvider"
import { useCanvasDesignI18n } from "../../../app/providers/I18nProvider"
import type { ImageElement } from "../../../runtime/document/types"
import { usePortalContainer } from "../../primitives/custom/PortalContainerContext"
import { useReferenceImageUrls } from "../../../app/hooks/resources/useReferenceImageUrls"
import { useImageRename, splitRenameFileName } from "./useImageRename"
import { GenerationStatus } from "../../../public/magic-types"

function RenameThumbnail({ path }: { path: string }) {
	const { lowUrl, isLoading } = useReferenceImageUrls(path, { enabled: Boolean(path) })
	return isLoading ? (
		<Loader2 size={16} className="animate-spin text-muted-foreground" />
	) : lowUrl ? (
		<img src={lowUrl} alt="" className="size-full object-cover" />
	) : (
		<Image size={16} className="text-muted-foreground" />
	)
}

export default function ImageRenamePanel({ element }: { element: ImageElement }) {
	const { canvas } = useCanvas()
	const { t } = useCanvasDesignI18n()
	const container = usePortalContainer()
	const form = useImageRename(element)
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
				className="flex max-h-[85dvh] flex-col gap-4 overflow-hidden sm:max-w-xl"
				showCloseButton={!form.saving}
				onEscapeKeyDown={(event) => {
					if (form.saving) event.preventDefault()
				}}
			>
				<DialogHeader>
					<DialogTitle>{t("rename.title", "编辑名称")}</DialogTitle>
					<DialogDescription>
						{t(
							"rename.description",
							"修改画布标题和各版本文件名，保存前可预览批量命名。",
						)}
					</DialogDescription>
				</DialogHeader>
				<label className="grid gap-2 text-sm">
					{t("rename.elementName", "元素名称")}
					<Input
						value={form.elementName}
						disabled={form.saving}
						onChange={(event) => form.setElementName(event.target.value)}
					/>
					<span className="text-xs text-muted-foreground">
						{t(
							"rename.sharedTitle",
							"所有版本共用此名称，修改这里不会自动更改文件名。",
						)}
					</span>
				</label>
				<div className="grid min-w-0 gap-3">
					<div className="text-sm font-medium">
						{t("rename.versionFiles", "版本文件名")}
					</div>
					<div className="flex min-w-0 gap-2">
						<Input
							aria-label={t("rename.baseName", "统一命名的基础名称")}
							placeholder={t("rename.baseName", "统一命名的基础名称")}
							value={form.baseName}
							disabled={form.saving}
							onChange={(event) => form.setBaseName(event.target.value)}
						/>
						<Button
							type="button"
							variant="outline"
							className="shrink-0"
							disabled={form.saving || !form.baseName.trim()}
							onClick={form.applyUniformNames}
						>
							{t("rename.uniform", "统一命名")}
						</Button>
					</div>
					<p className="m-0 text-xs text-muted-foreground">
						{t(
							"rename.uniformHint",
							"先预填“名称_v1、名称_v2…”；保留扩展名，保存时才真正改名。",
						)}
					</p>
				</div>
				{/* 控件固定，文件列表独立滚动，长名称不能把面板或横向布局撑开。 */}
				<ScrollArea
					className="h-[40dvh] min-h-0 shrink overflow-hidden"
					viewportClassName="[&>div]:!block"
				>
					<ul className="m-0 list-none divide-y divide-border p-0">
						{form.rows.map((row) => {
							const parts = splitRenameFileName(row.name)
							const file = row.file
							const processing =
								row.content.status === GenerationStatus.Pending ||
								row.content.status === GenerationStatus.Processing
							return (
								<li key={row.content.contentId} className="flex min-w-0 gap-3 py-3">
									<div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted/30 [&>div]:!size-12">
										{row.content.src ? (
											<RenameThumbnail path={row.content.src} />
										) : (
											<Image size={16} className="text-muted-foreground" />
										)}
									</div>
									<div className="grid min-w-0 flex-1 gap-1.5">
										<div className="flex flex-wrap items-center gap-2 text-xs">
											<span className="font-medium">
												{t("rename.version", {
													defaultValue: "V{{number}}",
													number: row.version,
												})}
											</span>
											{element.activeContentId === row.content.contentId && (
												<span className="rounded bg-primary/10 px-1.5 text-primary">
													{t("rename.current", "当前")}
												</span>
											)}
											{element.mainContentId === row.content.contentId && (
												<span className="rounded bg-muted px-1.5 text-muted-foreground">
													{t("rename.main", "主版本")}
												</span>
											)}
											{row.shared && (
												<span className="text-muted-foreground">
													{t("rename.sharedFile", "共用同一文件")}
												</span>
											)}
										</div>
										{file ? (
											<>
												<span className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
													{file.fileName}
												</span>
												<div className="flex min-w-0 items-center gap-1.5">
													<Input
														aria-label={t("rename.fileName", {
															defaultValue: "第 {{number}} 版文件名",
															number: row.version,
														})}
														value={parts.base}
														disabled={form.saving}
														aria-invalid={Boolean(row.error)}
														onChange={(event) =>
															form.setFileName(
																file.fileId,
																`${event.target.value}${splitRenameFileName(file.fileName).extension}`,
															)
														}
													/>
													<span className="shrink-0 text-xs text-muted-foreground">
														{
															splitRenameFileName(file.fileName)
																.extension
														}
													</span>
												</div>
											</>
										) : (
											<span className="text-xs text-muted-foreground">
												{processing
													? t(
															"rename.notGenerated",
															"图片尚未生成，文件名生成后可修改。",
														)
													: t(
															"rename.fileUnavailable",
															"当前文件不可重命名",
														)}
											</span>
										)}
										{row.status === "saving" && (
											<span className="flex items-center gap-1 text-xs text-muted-foreground">
												<Loader2 size={16} className="animate-spin" />
												{t("rename.saving", "正在保存")}
											</span>
										)}
										{row.status === "success" && (
											<span className="flex items-center gap-1 text-xs text-success">
												<CircleCheck size={16} />
												{t("rename.renamed", "文件已改名")}
											</span>
										)}
										{row.error && (
											<span
												className="flex items-start gap-1 text-xs text-destructive"
												role="alert"
											>
												<CircleX size={16} className="shrink-0" />
												{row.error}
											</span>
										)}
									</div>
								</li>
							)
						})}
					</ul>
				</ScrollArea>
				<div className="flex flex-wrap gap-3 text-xs" aria-live="polite">
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
					{form.error && <span className="text-destructive">{form.error}</span>}
				</div>
				<DialogFooter>
					<Button
						type="button"
						variant="outline"
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
						disabled={form.saving || !form.dirty || !form.elementName.trim()}
						onClick={() => void form.save()}
					>
						{form.saving && <Loader2 size={16} className="animate-spin" />}
						{form.failedCount
							? t("rename.retry", "重试未完成项")
							: t("rename.save", "保存修改")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
