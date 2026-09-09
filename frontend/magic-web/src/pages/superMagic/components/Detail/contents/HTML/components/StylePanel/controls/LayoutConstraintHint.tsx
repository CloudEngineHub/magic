import { useRef } from "react"
import { useTranslation } from "react-i18next"
import type { HTMLEditorV2Ref } from "../../../iframe-bridge/types/props"
import type { LayoutConstraintHint } from "../utils/layoutConstraintHint"

interface LayoutConstraintHintCardProps {
	hint: LayoutConstraintHint
	selector?: string
	editorRef?: React.RefObject<HTMLEditorV2Ref>
	onApply?: (styles: Record<string, string>) => void
}

export function LayoutConstraintHintCard({
	hint,
	selector,
	editorRef,
	onApply,
}: LayoutConstraintHintCardProps) {
	const { t } = useTranslation("super")
	const previewSessionRef = useRef(false)
	const message =
		hint.kind === "distributed-alignment"
			? t("stylePanel.layoutHintDistributed")
			: hint.axis === "width"
				? t("stylePanel.layoutHintParentWidth")
				: t("stylePanel.layoutHintParentHeight")
	const action =
		hint.kind === "distributed-alignment"
			? t("stylePanel.layoutHintFixGap")
			: hint.axis === "width"
				? t("stylePanel.layoutHintFixWidth")
				: t("stylePanel.layoutHintFixHeight")

	async function preview() {
		if (!selector || !editorRef?.current) return
		try {
			await editorRef.current.beginBatchOperation(selector, hint.fix)
			await editorRef.current.applyStylesTemporary(selector, hint.fix)
			previewSessionRef.current = true
		} catch (error) {
			console.error("[LayoutConstraintHint] Preview failed:", error)
		}
	}

	async function restore() {
		if (!selector || !editorRef?.current || !previewSessionRef.current) return
		previewSessionRef.current = false
		try {
			await editorRef.current.cancelBatchOperation()
			await editorRef.current.refreshSelectedElement(selector)
		} catch (error) {
			console.error("[LayoutConstraintHint] Restore failed:", error)
		}
	}

	async function apply() {
		if (selector && editorRef?.current && previewSessionRef.current) {
			previewSessionRef.current = false
			try {
				await editorRef.current.endBatchOperation(selector, hint.fix)
				await editorRef.current.refreshSelectedElement(selector)
			} catch (error) {
				console.error("[LayoutConstraintHint] Apply failed:", error)
			}
			return
		}
		onApply?.(hint.fix)
	}

	return (
		<div
			data-testid={`layout-constraint-hint-${hint.kind}`}
			className="rounded-md border border-border bg-muted/40 px-2 py-1.5 text-[10px] leading-snug text-muted-foreground"
		>
			<p>{message}</p>
			<button
				type="button"
				data-testid={`layout-constraint-hint-apply-${hint.kind}`}
				className="mt-1 text-[10px] font-medium text-foreground underline-offset-2 hover:underline"
				onMouseEnter={() => void preview()}
				onMouseLeave={() => void restore()}
				onClick={() => void apply()}
			>
				{action}
			</button>
		</div>
	)
}
