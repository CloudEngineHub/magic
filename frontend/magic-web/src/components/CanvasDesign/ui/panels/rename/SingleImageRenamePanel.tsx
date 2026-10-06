import { useCallback, useEffect, useLayoutEffect, useRef, type KeyboardEvent } from "react"
import { Loader2, Pencil, X } from "lucide-react"
import { Button } from "@/components/shadcn-ui/button"
import { Input } from "@/components/shadcn-ui/input"
import { Checkbox } from "@/components/shadcn-ui/checkbox"
import { ScrollArea } from "@/components/shadcn-ui/scroll-area"
import { useCanvasDesignI18n } from "../../../app/providers/I18nProvider"
import type { ImageElement } from "../../../runtime/document/types"
import { useFloatingComponent } from "../../../app/hooks/layout/useFloatingComponent"
import useRenameLabelPositionEffect from "../../../app/hooks/layout/useRenameLabelPositionEffect"
import RenameNameField from "./RenameNameField"
import { useSingleImageRename } from "./useSingleImageRename"

export default function SingleImageRenamePanel({ element }: { element: ImageElement }) {
	const { t } = useCanvasDesignI18n()
	const form = useSingleImageRename(element)
	const { close } = form
	const inputRef = useRef<HTMLInputElement>(null)
	const { containerRef: floatingRef } = useFloatingComponent({ id: "element-rename-overlay" })
	const { containerRef: positionRef } = useRenameLabelPositionEffect({
		elementId: element.id,
		inputRef,
		value: `${form.title}\n${form.fileValue}`,
		onTargetDeleted: close,
		panel: true,
	})
	const setRefs = useCallback(
		(node: HTMLDivElement | null) => {
			floatingRef.current = node
			positionRef.current = node
		},
		[floatingRef, positionRef],
	)
	useLayoutEffect(() => {
		const frame = requestAnimationFrame(() => {
			inputRef.current?.focus()
			inputRef.current?.select()
		})
		return () => cancelAnimationFrame(frame)
	}, [])
	useEffect(() => {
		// 点击内部控件不提交；外部点击仅取消尚未保存的草稿。
		const dismiss = (event: PointerEvent) => {
			if (event.target instanceof Node && !floatingRef.current?.contains(event.target))
				close()
		}
		document.addEventListener("pointerdown", dismiss, true)
		return () => document.removeEventListener("pointerdown", dismiss, true)
	}, [floatingRef, close])
	const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
		event.stopPropagation()
		if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return
		if (event.key === "Escape") {
			event.preventDefault()
			form.close()
		} else if (
			event.key === "Enter" &&
			(event.target instanceof HTMLInputElement ||
				event.target instanceof HTMLTextAreaElement)
		) {
			event.preventDefault()
			void form.save()
		}
	}
	const titleLabel = t("rename.singleTitle", "图片标题")
	const fileLabel = form.processing
		? t("rename.expectedFile", "预计文件名")
		: t("rename.fileNameLabel", "文件名")
	return (
		<div
			ref={setRefs}
			data-canvas-ui-component
			role="dialog"
			aria-label={t("rename.title", "重命名图片")}
			onKeyDown={handleKeyDown}
			className="absolute left-0 top-0 z-20 grid grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-lg"
		>
			<div className="flex items-center gap-2 px-4 py-3">
				<Pencil size={16} className="text-muted-foreground" />
				<h2 className="m-0 text-base font-semibold">{t("rename.title", "重命名图片")}</h2>
				<Button
					type="button"
					size="icon"
					variant="ghost"
					className="ml-auto size-8"
					disabled={form.saving}
					aria-label={t("rename.close", "关闭")}
					onClick={form.close}
				>
					<X size={16} />
				</Button>
			</div>
			<ScrollArea className="min-h-0" viewportClassName="[&>div]:!block">
				<div className="px-4 pb-4">
					<div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
						<label htmlFor="single-image-title">{titleLabel}</label>
						<span className="text-xs text-muted-foreground">
							{t("rename.titleUsage", "画布中显示")}
						</span>
					</div>
					<Input
						ref={inputRef}
						id="single-image-title"
						value={form.title}
						disabled={form.saving}
						onChange={(event) => form.setTitle(event.target.value)}
						className="h-11 text-sm"
					/>
					{form.file && (
						<div className="my-2 flex min-h-8 items-center gap-2">
							<Checkbox
								id="single-image-name-sync"
								checked={form.linked}
								disabled={form.saving}
								onCheckedChange={(value) => form.setLinked(value === true)}
							/>
							<label
								htmlFor="single-image-name-sync"
								className="cursor-pointer text-xs text-muted-foreground"
							>
								{t("rename.syncFileName", "修改标题时同步修改文件名")}
							</label>
						</div>
					)}
					<div
						className={`${form.file ? "" : "mt-4 "}mb-1.5 flex items-baseline justify-between gap-2 text-sm`}
					>
						<span>{fileLabel}</span>
						<span className="text-xs text-muted-foreground">
							{form.processing
								? t("rename.pendingEditableLater", "生成后可修改")
								: t("rename.fileUsage", "文件列表与下载")}
						</span>
					</div>
					<div className="rounded-lg border bg-background px-3 py-3 focus-within:border-ring focus-within:ring-1 focus-within:ring-ring">
						<RenameNameField
							value={form.fileValue}
							onChange={form.setFileValue}
							label={fileLabel}
							extension={form.extension}
							disabled={form.saving || !form.file}
							invalid={Boolean(form.error)}
							onKeyDown={handleKeyDown}
						/>
					</div>
					{!form.file && !form.processing && (
						<p className="mb-0 mt-2 text-xs text-muted-foreground">
							{t("rename.fileUnavailable", "当前文件不可重命名")}
						</p>
					)}
					{form.error && (
						<p role="alert" className="mb-0 mt-2 text-xs text-destructive">
							{form.error}
						</p>
					)}
				</div>
			</ScrollArea>
			<div className="flex justify-end gap-2 border-t px-4 py-3">
				<Button
					type="button"
					variant="ghost"
					size="sm"
					disabled={form.saving}
					onClick={form.close}
				>
					{t("rename.cancel", "取消")}
				</Button>
				<Button
					type="button"
					size="sm"
					disabled={
						form.saving ||
						!form.dirty ||
						!form.title.trim() ||
						(Boolean(form.file) && !form.fileValue.trim())
					}
					onClick={() => void form.save()}
				>
					{form.saving && <Loader2 size={16} className="animate-spin" />}
					{t("rename.singleSave", "保存")}
				</Button>
			</div>
		</div>
	)
}
