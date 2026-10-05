import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { useCanvas } from "../../../app/providers/CanvasProvider"
import { useCanvasRenameUI } from "../../../app/providers/CanvasUIProvider"
import { useCanvasElement } from "../../../app/hooks/canvas"
import { useFloatingComponent } from "../../../app/hooks/layout/useFloatingComponent"
import useRenameLabelPositionEffect from "../../../app/hooks/layout/useRenameLabelPositionEffect"
import { cn } from "../../../runtime/shared/lib/utils"
import { Input } from "../../primitives/shadcn/input"
import styles from "./index.module.css"
import { useCanvasDesignI18n } from "../../../app/providers/I18nProvider"
import { Loader2 } from "lucide-react"
import { useMagic } from "../../../app/providers/MagicProvider"
import { GenerationStatus } from "../../../public/magic-types"
import {
	getActiveImageContent,
	isImageElementContent,
} from "../../../runtime/document/elementContent"

export interface ElementRenameOverlayRenderProps {
	elementId: string
}

export default function ElementRenameOverlayRender({ elementId }: ElementRenameOverlayRenderProps) {
	const { canvas } = useCanvas()
	const { setCanvasRenamingElementId } = useCanvasRenameUI()
	const element = useCanvasElement(elementId)
	const inputRef = useRef<HTMLInputElement | null>(null)
	const [value, setValue] = useState("")
	const [isComposing, setIsComposing] = useState(false)
	const { t } = useCanvasDesignI18n()
	const { methods } = useMagic()
	const [saving, setSaving] = useState(false)
	const savingRef = useRef(false)
	const [error, setError] = useState("")

	const closeRename = useCallback(() => {
		if (savingRef.current) return
		canvas?.elementRenameManager.cancelRename()
		setCanvasRenamingElementId(null)
	}, [canvas, setCanvasRenamingElementId])

	const commitRename = useCallback(async () => {
		if (savingRef.current) return
		if (canvas?.elementRenameManager.getRenamingElementId() !== elementId) return
		if (!elementId || !canvas) {
			closeRename()
			return
		}

		if (!value.trim()) {
			closeRename()
			return
		}
		savingRef.current = true
		setSaving(true)
		setError("")
		try {
			await canvas.elementRenameManager.commitRename(value)
			setCanvasRenamingElementId(null)
		} catch (failure) {
			setError(failure instanceof Error ? failure.message : t("rename.failed", "重命名失败"))
		} finally {
			savingRef.current = false
			setSaving(false)
		}
	}, [canvas, elementId, closeRename, setCanvasRenamingElementId, value, t])

	useEffect(() => {
		if (error && !saving) inputRef.current?.focus()
	}, [error, saving])

	const { containerRef: positionRef } = useRenameLabelPositionEffect({
		elementId,
		inputRef,
		value,
		onTargetDeleted: closeRename,
	})

	const { containerRef: floatingRef } = useFloatingComponent({
		id: "element-rename-overlay",
		enableWheelForwarding: true,
	})

	const setRefs = useCallback(
		(node: HTMLDivElement | null) => {
			positionRef.current = node
			floatingRef.current = node
		},
		[positionRef, floatingRef],
	)

	useEffect(() => {
		if (!elementId) {
			setValue("")
			return
		}

		const currentElement = canvas?.elementManager.getElementData(elementId)
		const labelText =
			currentElement?.name ||
			canvas?.elementManager.getElementInstance(elementId)?.getRenderName() ||
			""
		setValue(labelText)
		setIsComposing(false)
	}, [canvas, elementId])

	useEffect(() => {
		if (elementId && !element) {
			closeRename()
		}
	}, [elementId, closeRename, element])

	useLayoutEffect(() => {
		if (!elementId || !inputRef.current) {
			return
		}

		requestAnimationFrame(() => {
			if (!inputRef.current) return
			inputRef.current.focus()
			inputRef.current.select()
		})
	}, [elementId])

	if (!elementId || !element) {
		return null
	}
	const content = isImageElementContent(element) ? getActiveImageContent(element) : undefined
	const file =
		content &&
		content.status !== GenerationStatus.Pending &&
		content.status !== GenerationStatus.Processing &&
		content.src
			? methods?.imageRename?.resolveImageRenameFile(content.src)
			: undefined

	return (
		<div ref={setRefs} className={styles.renameOverlayRoot} data-canvas-ui-component>
			<Input
				ref={inputRef}
				className={cn(
					"box-border min-h-0 w-auto min-w-[72px] px-1.5 py-0 leading-[1.2]",
					"rounded border border-input bg-background shadow-none",
					"text-base focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0 md:text-base",
				)}
				value={value}
				disabled={saving}
				aria-label={t("rename.elementName", "元素名称")}
				aria-invalid={Boolean(error)}
				onChange={(e) => {
					setValue(e.target.value)
					setError("")
				}}
				onBlur={commitRename}
				onKeyDown={(e) => {
					if (e.key === "Enter") {
						if (
							isComposing ||
							e.nativeEvent.isComposing ||
							e.nativeEvent.keyCode === 229
						) {
							return
						}
						e.preventDefault()
						commitRename()
						return
					}

					if (e.key === "Escape") {
						e.preventDefault()
						closeRename()
					}
				}}
				onCompositionStart={() => {
					setIsComposing(true)
				}}
				onCompositionEnd={() => {
					setIsComposing(false)
				}}
			/>
			<div
				className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"
				role="status"
			>
				{saving ? (
					<>
						<Loader2 size={16} className="animate-spin" />
						{t("rename.saving", "正在保存")}
					</>
				) : error ? (
					<span className="text-destructive">{error}</span>
				) : file ? (
					t("rename.alsoRenameFile", "同时修改真实文件名")
				) : (
					t("rename.titleOnly", "仅修改元素名称")
				)}
			</div>
		</div>
	)
}
