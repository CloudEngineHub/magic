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
	const hasReset = previousResetKeyRef.current !== resetKey

	useLayoutEffect(() => {
		previousResetKeyRef.current = resetKey
		// 空结果必须立即清空画布。否则筛选状态已经显示「暂无匹配模板」时，
		// 拖拽期间延迟更新仍会把上一批模板卡片留在画布上。
		if (isDragging && !hasReset && templates.length > 0) return
		setActiveTemplates((currentTemplates) =>
			currentTemplates === templates ? currentTemplates : templates,
		)
	}, [hasReset, isDragging, resetKey, templates])

	// 完整查询替换时，复位帧必须直接使用新模板；否则画布会先用旧布局处理 resetKey，
	// 下一帧再收到新模板时又可能被误判为分页追加。拖拽中的同一查询追加仍返回旧快照。
	return hasReset || templates.length === 0 ? templates : activeTemplates
}
