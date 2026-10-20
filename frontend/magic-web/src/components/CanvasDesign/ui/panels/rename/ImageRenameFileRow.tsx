import { CircleCheck, CircleX, Image, Loader2 } from "lucide-react"
import { cn } from "@/utils/cn"
import { useCanvasDesignI18n } from "../../../app/providers/I18nProvider"
import { useReferenceImageUrls } from "../../../app/hooks/resources/useReferenceImageUrls"
import type { ImageElement } from "../../../runtime/document/types"
import { splitRenameFileName, type ImageRenameRow } from "./useImageRename"
import RenameNameField from "./RenameNameField"

const nameRowClass =
	"grid grid-cols-[64px_minmax(0,1fr)] items-start gap-2 px-3 py-2 text-sm leading-5"
const fileInputRowClass = "flex min-w-0 flex-col gap-1 px-3 py-2 text-sm leading-5"
const labelClass = "whitespace-nowrap text-muted-foreground"

function RenameThumbnail({ path, processing }: { path: string; processing: boolean }) {
	const { lowUrl, isLoading } = useReferenceImageUrls(path, {
		enabled: Boolean(path) && !processing,
	})
	return (
		<div
			className={cn(
				"mt-0.5 flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/30",
				processing &&
					"bg-gradient-to-br from-violet-100 via-rose-50 to-blue-100 dark:from-violet-950 dark:via-rose-950 dark:to-blue-950",
			)}
		>
			{processing || isLoading ? (
				<Loader2 size={16} className="animate-spin text-muted-foreground" />
			) : lowUrl ? (
				<img src={lowUrl} alt="" className="size-full object-cover" />
			) : (
				<Image size={16} className="text-muted-foreground" />
			)}
		</div>
	)
}

export default function ImageRenameFileRow({
	row,
	element,
	saving,
	onChange,
}: {
	row: ImageRenameRow
	element: ImageElement
	saving: boolean
	onChange: (fileId: string, name: string) => void
}) {
	const { t } = useCanvasDesignI18n()
	const file = row.file
	const edited = Boolean(file && row.name !== file.fileName)
	const parts = splitRenameFileName(row.name)
	const status = row.processing ? (
		<span className="flex items-center gap-1">
			<Loader2 size={16} className="animate-spin" />
			{t("rename.generating", "生成中")}
		</span>
	) : row.status === "saving" ? (
		<span className="flex items-center gap-1">
			<Loader2 size={16} className="animate-spin" />
			{t("rename.saving", "正在保存")}
		</span>
	) : row.status === "success" ? (
		<span className="flex items-center gap-1 text-success">
			<CircleCheck size={16} />
			{t("rename.renamed", "文件已改名")}
		</span>
	) : row.status === "error" ? (
		<span className="flex items-center gap-1 text-destructive">
			<CircleX size={16} />
			{t("rename.failed", "重命名失败")}
		</span>
	) : edited ? (
		<span>{t("rename.awaitingConfirmation", "待确认")}</span>
	) : null
	return (
		<li className="grid min-w-0 grid-cols-[80px_minmax(0,1fr)] items-start gap-3 px-3 py-2.5">
			<RenameThumbnail path={row.content.src || ""} processing={row.processing} />
			<div className="min-w-0">
				<div className="mb-1 flex min-h-5 min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
					<span className="font-medium text-foreground">
						{t("rename.version", { defaultValue: "V{{number}}", number: row.version })}
					</span>
					{element.mainContentId === row.content.contentId && (
						<span className="rounded bg-muted px-1.5 py-0.5">
							{t("rename.main", "主版本")}
						</span>
					)}
					{element.activeContentId === row.content.contentId && (
						<span className="rounded bg-muted px-1.5 py-0.5">
							{t("rename.current", "当前")}
						</span>
					)}
					{row.shared && <span>{t("rename.sharedFile", "共用同一文件")}</span>}
				</div>
				{status && (
					<div className="mb-1 flex min-h-5 items-center text-xs text-muted-foreground">
						{status}
					</div>
				)}
				{file ? (
					<div
						className={cn(
							"rounded-lg border focus-within:border-ring focus-within:ring-1 focus-within:ring-ring",
							row.error && "border-destructive/50",
						)}
					>
						<div className="overflow-hidden rounded-[inherit]">
							{edited && (
								<div className={cn(nameRowClass, "bg-muted/35")}>
									<span className={labelClass}>
										{t("rename.originalFileName", "原文件名")}
									</span>
									<span className="min-w-0 text-muted-foreground [overflow-wrap:anywhere]">
										{file.fileName}
									</span>
								</div>
							)}
							{/* 固定 key 保留输入 DOM：首次改动插入原名行时，光标仍在同一字段。 */}
							<div
								key="file-input"
								className={cn(
									fileInputRowClass,
									"bg-background",
									edited && "border-t",
								)}
							>
								<span className={`${labelClass} text-xs leading-4`}>
									{row.status === "success"
										? t("rename.savedFileName", "现文件名")
										: edited
											? t("rename.newFileName", "新文件名")
											: t("rename.fileNameLabel", "文件名")}
								</span>
								{/* 窄版本行内限制输入高度，避免长文件名撑满整个重命名面板。 */}
								<RenameNameField
									value={parts.base}
									extension={splitRenameFileName(file.fileName).extension}
									label={t("rename.fileName", {
										defaultValue: "第 {{number}} 版文件名",
										number: row.version,
									})}
									disabled={saving}
									maxRows={4}
									invalid={Boolean(row.error)}
									onChange={(name) =>
										onChange(
											file.fileId,
											`${name}${splitRenameFileName(file.fileName).extension}`,
										)
									}
								/>
							</div>
						</div>
					</div>
				) : row.processing ? (
					<div className="rounded-lg border border-dashed">
						<div className={nameRowClass}>
							<span className={labelClass}>
								{t("rename.expectedName", "预计名称")}
							</span>
							<span className="min-w-0 [overflow-wrap:anywhere]">
								{row.expectedName || t("rename.nameUndetermined", "名称尚未确定")}
							</span>
						</div>
						<p className="m-0 pb-2 pl-[84px] pr-3 text-xs leading-5 text-muted-foreground">
							{t("rename.notGenerated", "生成后可修改文件名")}
						</p>
					</div>
				) : (
					<p className="m-0 text-xs leading-5 text-muted-foreground">
						{t("rename.fileUnavailable", "当前文件不可重命名")}
					</p>
				)}
				{row.error && (
					<p role="alert" className="mb-0 mt-1.5 text-xs leading-5 text-destructive">
						{row.error}
					</p>
				)}
			</div>
		</li>
	)
}
