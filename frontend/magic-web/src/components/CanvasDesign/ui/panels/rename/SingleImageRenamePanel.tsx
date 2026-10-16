import { useCallback, useEffect, useLayoutEffect, useRef, type KeyboardEvent } from "react"
import { Loader2, Pencil, X } from "lucide-react"
import { Button } from "@/components/shadcn-ui/button"
import { Input } from "@/components/shadcn-ui/input"
import { Checkbox } from "@/components/shadcn-ui/checkbox"
import { ScrollArea } from "@/components/shadcn-ui/scroll-area"
import { useCanvasDesignI18n } from "../../../app/providers/I18nProvider"
import { useCanvasEvent } from "../../../app/hooks/canvas"
import type { ImageElement } from "../../../runtime/document/types"
import { useFloatingComponent } from "../../../app/hooks/layout/useFloatingComponent"
import useElementPositionEffect from "../../../app/hooks/layout/useElementPositionEffect"
import styles from "./index.module.css"
import RenameNameField from "./RenameNameField"
import { useSingleImageRename } from "./useSingleImageRename"

export default function SingleImageRenamePanel({ element }: { element: ImageElement }) {
	const { t } = useCanvasDesignI18n()
	const form = useSingleImageRename(element)
	const { close } = form
	const inputRef = useRef<HTMLInputElement>(null)
	const { containerRef: positionRef } = useElementPositionEffect({
		position: "right",
		offset: 8,
		verticalAlign: "top",
		trackedElementId: element.id,
		shouldShow: () => true,
		stickyTopRight: {
			gap: 8,
			headerSelector: "[data-canvas-design-header-actions]",
		},
	})
	const { containerRef: floatingRef } = useFloatingComponent({
		id: "element-rename-overlay",
		interactive: true,
		enableWheelForwarding: true,
	})
	const setRefs = useCallback(
		(node: HTMLDivElement | null) => {
			floatingRef.current = node
			positionRef.current = node
		},
		[floatingRef, positionRef],
	)
	useCanvasEvent(
		"element:deleted",
		({ data }) => {
			if (data.elementId === element.id) close()
		},
		[element.id, close],
	)
	useLayoutEffect(() => {
		const frame = requestAnimationFrame(() => {
			inputRef.current?.focus()
			inputRef.current?.select()
		})
		return () => cancelAnimationFrame(frame)
	}, [])
	useEffect(() => {
		// Clicks inside the floating surface stay in the editor; outside clicks cancel the draft.
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
			className={styles.renamePanel}
		>
			<div className={styles.renameHeader}>
				<Pencil size={16} className={styles.renameTitleIcon} />
				<h2 className={styles.renameTitle}>{t("rename.title", "重命名图片")}</h2>
				<Button
					type="button"
					size="icon"
					variant="ghost"
					className={styles.renameCloseButton}
					disabled={form.saving}
					aria-label={t("rename.close", "关闭")}
					onClick={form.close}
				>
					<X size={16} />
				</Button>
			</div>
			<ScrollArea
				className={`${styles.renameScrollable} min-h-0`}
				viewportClassName="[&>div]:!block"
			>
				<div className={styles.renameBody}>
					<div className={styles.renameSection}>
						<div className={styles.renameSectionHeader}>
							<label
								htmlFor="single-image-title"
								className={styles.renameSectionLabel}
							>
								{titleLabel}
							</label>
							<span className={styles.renameSectionHint}>
								{t("rename.titleUsage", "画布中显示")}
							</span>
						</div>
						<Input
							ref={inputRef}
							id="single-image-title"
							value={form.title}
							disabled={form.saving}
							onChange={(event) => form.setTitle(event.target.value)}
							className="h-9 text-sm"
						/>
						{form.file && (
							<div className="my-1 flex min-h-8 items-center gap-2">
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
					</div>
					<div className={styles.renameSection}>
						<div className={styles.renameSectionHeader}>
							<span className={styles.renameSectionLabel}>{fileLabel}</span>
							<span className={styles.renameSectionHint}>
								{form.processing
									? t("rename.pendingEditableLater", "生成后可修改")
									: t("rename.fileUsage", "文件列表与下载")}
							</span>
						</div>
						<div className={styles.renameField}>
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
							<p className="m-0 text-xs text-muted-foreground">
								{t("rename.fileUnavailable", "当前文件不可重命名")}
							</p>
						)}
						{form.error && (
							<p role="alert" className="m-0 text-xs text-destructive">
								{form.error}
							</p>
						)}
					</div>
				</div>
			</ScrollArea>
			<div className={`${styles.renameActions} border-t pt-2`}>
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
