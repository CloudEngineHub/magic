import { useLayoutEffect, useRef, useState } from "react"
import type { OptionItem } from "@/pages/superMagic/components/MainInputContainer/panels/types"

interface UseSlidesTemplateCanvasActiveTemplatesInput {
	isDragging: boolean
	resetKey: string
	templates: OptionItem[]
}

/**
 * 分页结果到达时，重建循环布局会替换可见卡片。拖拽进行中延后这次替换，
 * 避免网络响应与 pointermove 同一帧争用主线程。
 */
export function useSlidesTemplateCanvasActiveTemplates({
	isDragging,
	resetKey,
	templates,
}: UseSlidesTemplateCanvasActiveTemplatesInput) {
	const [activeTemplates, setActiveTemplates] = useState(templates)
	const previousResetKeyRef = useRef(resetKey)

	useLayoutEffect(() => {
		const hasReset = previousResetKeyRef.current !== resetKey
		previousResetKeyRef.current = resetKey
		if (isDragging && !hasReset) return
		setActiveTemplates((currentTemplates) =>
			currentTemplates === templates ? currentTemplates : templates,
		)
	}, [isDragging, resetKey, templates])

	return activeTemplates
}
