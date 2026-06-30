import { useCallback, useRef } from "react"

export function useProjectFirstAttachmentRender() {
	const renderedProjectIdRef = useRef<string>()

	const shouldRenderProjectFirstRequest = useCallback((projectId: string) => {
		if (renderedProjectIdRef.current === projectId) return false
		renderedProjectIdRef.current = projectId
		return true
	}, [])

	const resetProjectFirstRequestRender = useCallback(() => {
		renderedProjectIdRef.current = undefined
	}, [])

	return {
		shouldRenderProjectFirstRequest,
		resetProjectFirstRequestRender,
	}
}
