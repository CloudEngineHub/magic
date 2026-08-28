import { useEffect, useState } from "react"
import { useMemoizedFn } from "ahooks"

interface UseHtmlDevConsoleStateOptions {
	fileId?: string
	onRegisterToggle?: (handler: (() => void) | null) => void
	onEnabledChange?: (enabled: boolean) => void
}

interface HtmlDevConsoleState {
	fileId?: string
	enabled: boolean
}

/** Preserve each HTML file's DevTools preference while previews remount or switch entry files. */
const enabledByFileId = new Map<string, boolean>()

export function useHtmlDevConsoleState({
	fileId,
	onRegisterToggle,
	onEnabledChange,
}: UseHtmlDevConsoleStateOptions) {
	const [state, setState] = useState<HtmlDevConsoleState>(() => ({
		fileId,
		enabled: fileId ? (enabledByFileId.get(fileId) ?? false) : false,
	}))
	const enabled =
		state.fileId === fileId
			? state.enabled
			: fileId
				? (enabledByFileId.get(fileId) ?? false)
				: false

	const setEnabled = useMemoizedFn((nextEnabled: boolean) => {
		if (fileId) enabledByFileId.set(fileId, nextEnabled)
		setState({ fileId, enabled: nextEnabled })
	})
	const toggle = useMemoizedFn(() => setEnabled(!enabled))

	useEffect(() => {
		onRegisterToggle?.(toggle)
		return () => onRegisterToggle?.(null)
	}, [onRegisterToggle, toggle])

	useEffect(() => {
		onEnabledChange?.(enabled)
	}, [enabled, onEnabledChange])

	return { enabled, setEnabled, toggle }
}
