import { useLayoutEffect, useRef, useState } from "react"
import type { OptionItem } from "@/pages/superMagic/components/MainInputContainer/panels/types"
import { SlidesTemplateCanvasLayoutService } from "./SlidesTemplateCanvasLayoutService"

interface UseSlidesTemplateCanvasItemsInput {
	enableInfiniteLoop?: boolean
	templates: OptionItem[]
}

export function useSlidesTemplateCanvasItems({
	enableInfiniteLoop = true,
	templates,
}: UseSlidesTemplateCanvasItemsInput) {
	const layoutServiceRef = useRef<SlidesTemplateCanvasLayoutService | null>(null)
	if (!layoutServiceRef.current) {
		layoutServiceRef.current = new SlidesTemplateCanvasLayoutService()
	}
	const layoutService = layoutServiceRef.current
	const [snapshot, setSnapshot] = useState(() => layoutService.getSnapshot())

	useLayoutEffect(() => {
		const nextSnapshot = layoutService.synchronize(templates, enableInfiniteLoop)
		setSnapshot((currentSnapshot) =>
			currentSnapshot.canvasItems === nextSnapshot.canvasItems
				? currentSnapshot
				: nextSnapshot,
		)
	}, [enableInfiniteLoop, layoutService, templates])

	return snapshot
}
