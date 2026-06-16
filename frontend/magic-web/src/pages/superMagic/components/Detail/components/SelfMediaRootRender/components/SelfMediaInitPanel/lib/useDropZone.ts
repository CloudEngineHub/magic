import { useCallback, useState } from "react"
import { acceptDropEvent, parseDropPayload, type DropPayload } from "./projectFileDrag"

interface UseDropZoneOptions {
	disabled?: boolean
	onDropPayload: (payload: DropPayload) => void
}

export function useDropZone({ disabled = false, onDropPayload }: UseDropZoneOptions) {
	const [isDragging, setIsDragging] = useState(false)

	const handleDragEnter = useCallback(
		(e: React.DragEvent) => {
			if (disabled) return
			acceptDropEvent(e)
			setIsDragging(true)
		},
		[disabled],
	)

	const handleDragOver = useCallback(
		(e: React.DragEvent) => {
			if (disabled) return
			acceptDropEvent(e)
			setIsDragging(true)
		},
		[disabled],
	)

	const handleDragLeave = useCallback((e: React.DragEvent) => {
		const next = e.relatedTarget as Node | null
		if (next && e.currentTarget.contains(next)) return
		setIsDragging(false)
	}, [])

	const handleDrop = useCallback(
		(e: React.DragEvent) => {
			acceptDropEvent(e)
			setIsDragging(false)
			if (disabled) return

			const payload = parseDropPayload(e.dataTransfer)
			if (payload) onDropPayload(payload)
		},
		[disabled, onDropPayload],
	)

	return {
		isDragging,
		dropZoneProps: {
			onDragEnter: handleDragEnter,
			onDragOver: handleDragOver,
			onDragLeave: handleDragLeave,
			onDrop: handleDrop,
		},
	}
}
