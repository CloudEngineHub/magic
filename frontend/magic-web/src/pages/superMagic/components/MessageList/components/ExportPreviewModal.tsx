import { observer } from "mobx-react-lite"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/shadcn-ui/dialog"
import { Button } from "@/components/shadcn-ui/button"
import { Checkbox } from "@/components/shadcn-ui/checkbox"
import { RadioGroup, RadioGroupItem } from "@/components/shadcn-ui/radio-group"
import { Input } from "@/components/shadcn-ui/input"
import { Label } from "@/components/shadcn-ui/label"
import { IconLoader2 } from "@tabler/icons-react"
import magicToast from "@/components/base/MagicToaster/utils"
import type { ExportSelectionStore } from "../hooks/useExportSelection"
import type { ExportTurn } from "../export/extractMessageContent"
import { ExportContent } from "../export/ExportContent"
import { runExport, type ExportFormat, type RunExportHandle } from "../export/runExport"

export interface ExportPreviewModalProps {
	store: ExportSelectionStore
	turns: ExportTurn[]
	title: string
}

function defaultFileName(title: string): string {
	const now = new Date()
	const pad = (n: number) => String(n).padStart(2, "0")
	const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`
	const safe = (title || "conversation").replace(/[\\/:*?"<>|]/g, "_").slice(0, 40)
	return `${safe}_${stamp}`
}

function ExportPreviewModalInner({ store, turns, title }: ExportPreviewModalProps) {
	const { t } = useTranslation("super")
	const open = store.previewOpen

	const [format, setFormat] = useState<ExportFormat>("png")
	const [fileName, setFileName] = useState(() => defaultFileName(title))

	const handleFormatChange = (newFormat: ExportFormat) => {
		const oldExt = format
		const newExt = newFormat
		setFormat(newFormat)
		setFileName((prev) => {
			const re = new RegExp(`\\.${oldExt}$`, "i")
			return re.test(prev) ? prev.replace(re, `.${newExt}`) : prev
		})
	}
	const [busy, setBusy] = useState(false)
	const handleRef = useRef<RunExportHandle | null>(null)
	const contentRef = useRef<HTMLDivElement | null>(null)

	const [exportedAt, setExportedAt] = useState(Date.now)

	useEffect(() => {
		if (open) {
			setExportedAt(Date.now())
		} else {
			setBusy(false)
			handleRef.current?.cancel()
			handleRef.current = null
			setFileName(defaultFileName(title))
			setFormat("png")
		}
	}, [open, title])

	useEffect(() => {
		return () => {
			handleRef.current?.cancel()
			handleRef.current = null
		}
	}, [])

	const handleCancel = () => {
		handleRef.current?.cancel()
		handleRef.current = null
		setBusy(false)
		store.closePreview()
	}

	const handleDownload = async () => {
		if (busy) return
		const element = contentRef.current
		if (!element) return
		setBusy(true)
		try {
			const handle = runExport({
				element,
				format,
				fileName: fileName || defaultFileName(title),
			})
			handleRef.current = handle
			await handle.promise
			magicToast.success(t("export.success", { defaultValue: "导出成功" }) as string)
			store.closePreview()
			store.exit()
		} catch (err) {
			console.error("[message-export] failed:", err)
			magicToast.error(t("export.failed", { defaultValue: "导出失败" }) as string)
		} finally {
			setBusy(false)
			handleRef.current = null
		}
	}

	return (
		<Dialog
			open={open}
			onOpenChange={(v) => {
				if (!v) handleCancel()
			}}
		>
			<DialogContent className="grid max-h-[calc(100vh-24px)] w-[calc(100vw-24px)] max-w-[1080px] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-[1080px]">
				<DialogHeader className="border-b px-5 py-3">
					<DialogTitle>{t("export.title", { defaultValue: "导出对话" })}</DialogTitle>
				</DialogHeader>

				<div className="grid min-h-0 grid-cols-1 overflow-auto lg:grid-cols-[minmax(0,1fr)_320px] lg:overflow-hidden">
					<div className="relative min-h-[280px] min-w-0 overflow-y-auto overflow-x-hidden bg-muted/30">
						<div className="flex justify-center px-4 py-6 sm:px-6">
							<div className="[zoom:0.9]">
								<ExportContent
									ref={contentRef}
									turns={turns}
									title={title}
									exportedAt={exportedAt}
								/>
							</div>
						</div>
					</div>

					<div className="flex min-w-0 flex-col gap-5 border-t p-5 lg:overflow-auto lg:border-l lg:border-t-0">
						<div className="space-y-2">
							<Label className="text-sm">
								{t("export.format", { defaultValue: "格式" })}
							</Label>
							<RadioGroup
								value={format}
								onValueChange={(v) => handleFormatChange(v as ExportFormat)}
								className="flex gap-4"
							>
								<label className="flex items-center gap-2 text-sm">
									<RadioGroupItem value="png" id="export-fmt-png" />
									<span>PNG</span>
								</label>
								<label className="flex items-center gap-2 text-sm">
									<RadioGroupItem value="jpeg" id="export-fmt-jpeg" />
									<span>JPEG</span>
								</label>
								<label className="flex items-center gap-2 text-sm">
									<RadioGroupItem value="pdf" id="export-fmt-pdf" />
									<span>PDF</span>
								</label>
							</RadioGroup>
						</div>

						<div className="space-y-2">
							<Label htmlFor="export-filename" className="text-sm">
								{t("export.fileName", { defaultValue: "文件名" })}
							</Label>
							<Input
								id="export-filename"
								value={fileName}
								onChange={(e) => setFileName(e.target.value)}
							/>
						</div>

						<div className="space-y-2">
							<Label className="text-sm">
								{t("export.options", { defaultValue: "选项" })}
							</Label>
							<label className="flex items-center gap-2 text-sm">
								<Checkbox
									checked={store.includeToolCall}
									onCheckedChange={(v) => store.setIncludeToolCall(Boolean(v))}
								/>
								<span>
									{t("export.includeToolCall", {
										defaultValue: "包含工具调用过程",
									})}
								</span>
							</label>
						</div>
					</div>
				</div>

				<DialogFooter className="border-t px-5 py-3">
					<Button variant="outline" onClick={handleCancel} disabled={busy}>
						{t("export.cancel", { defaultValue: "取消" })}
					</Button>
					<Button onClick={handleDownload} disabled={busy || turns.length === 0}>
						{busy && <IconLoader2 size={16} className="animate-spin" />}
						{busy
							? t("export.exporting", { defaultValue: "导出中…" })
							: t("export.download", { defaultValue: "下载" })}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

export const ExportPreviewModal = observer(ExportPreviewModalInner)
