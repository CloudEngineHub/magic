import { useEffect, useRef } from "react"
import { mountPureShareDocument } from "../pure-share/mountPureShareDocument"

interface PureShareHTMLRendererProps {
	content: string
	onReady?: () => void
}

/**
 * React bridge for mounting pure-share HTML into the real document flow.
 * Example: mount -> native page scroll; unmount -> shell state restored.
 */
export default function PureShareHTMLRenderer({ content, onReady }: PureShareHTMLRendererProps) {
	const markerRef = useRef<HTMLSpanElement>(null)

	useEffect(() => {
		const marker = markerRef.current
		if (!marker) return

		return mountPureShareDocument({ content, marker, onReady })
	}, [content, onReady])

	return <span ref={markerRef} hidden data-testid="pure-share-html-renderer" />
}
