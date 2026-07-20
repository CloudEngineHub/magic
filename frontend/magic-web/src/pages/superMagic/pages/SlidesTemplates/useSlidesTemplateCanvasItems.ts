import { useLayoutEffect, useRef, useState } from "react"
import type { OptionItem } from "@/pages/superMagic/components/MainInputContainer/panels/types"
import { SlidesTemplateCanvasLayoutService } from "./SlidesTemplateCanvasLayoutService"

interface UseSlidesTemplateCanvasItemsInput {
	enableInfiniteLoop?: boolean
	resetKey: string
	templates: OptionItem[]
}

export function useSlidesTemplateCanvasItems({
	enableInfiniteLoop = true,
	resetKey,
	templates,
}: UseSlidesTemplateCanvasItemsInput) {
	const layoutServiceRef = useRef<SlidesTemplateCanvasLayoutService | null>(null)
	if (!layoutServiceRef.current) {
		layoutServiceRef.current = new SlidesTemplateCanvasLayoutService()
	}
	const layoutService = layoutServiceRef.current
	// 布局在 layout effect 中更新。resetKey 必须与产出的快照一起提交，
	// 否则下游会先用旧布局消费 reset，再把真正的新布局误判为分页追加。
	const [snapshot, setSnapshot] = useState(() => ({
		...layoutService.getSnapshot(),
		resetKey,
	}))

	useLayoutEffect(() => {
		const nextSnapshot = layoutService.synchronize(templates, enableInfiniteLoop)
		setSnapshot((currentSnapshot) => {
			if (
				currentSnapshot.canvasItems === nextSnapshot.canvasItems &&
				currentSnapshot.resetKey === resetKey
			) {
				return currentSnapshot
			}

			return { ...nextSnapshot, resetKey }
		})
	}, [enableInfiniteLoop, layoutService, resetKey, templates])

	return snapshot
}
