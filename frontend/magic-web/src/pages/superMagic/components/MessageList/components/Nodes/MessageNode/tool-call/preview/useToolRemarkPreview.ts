import { useEffect, useRef, useState } from "react"
import { getToolRemarkPreviewStrategy, type ToolRemarkPreviewStrategy } from "./registry"
import type { ToolRemarkPreviewParser } from "./types"

interface ToolRemarkPreviewOptions {
	enabled: boolean
	identity: string
	toolName?: string
	rawArguments: string
}

interface ToolRemarkPreviewState {
	sessionKey: string
	value: string
}

export function useToolRemarkPreview({
	enabled,
	identity,
	toolName,
	rawArguments,
}: ToolRemarkPreviewOptions) {
	const strategy: ToolRemarkPreviewStrategy | undefined = getToolRemarkPreviewStrategy(toolName)
	const sessionKey = `${identity}:${toolName || ""}`
	const sessionKeyRef = useRef("")
	const parserRef = useRef<ToolRemarkPreviewParser | null>(null)
	const exhaustedRef = useRef(false)
	const previewRef = useRef("")
	const [previewState, setPreviewState] = useState<ToolRemarkPreviewState>(() => ({
		sessionKey,
		value: "",
	}))

	if (sessionKeyRef.current !== sessionKey) {
		sessionKeyRef.current = sessionKey
		// Parser state is session-local and never enters React state, avoiding a render per chunk.
		parserRef.current = strategy?.createParser() ?? null
		exhaustedRef.current = false
		previewRef.current = ""
	}

	useEffect(() => {
		if (!enabled || exhaustedRef.current || !parserRef.current) return

		const result = parserRef.current.parse(rawArguments)
		if (result.status === "pending") return
		if (result.status === "exhausted") {
			exhaustedRef.current = true
			return
		}
		if (!result.value || result.value === previewRef.current) return

		previewRef.current = result.value
		setPreviewState({ sessionKey, value: result.value })
	}, [enabled, rawArguments, sessionKey])

	return enabled && previewState.sessionKey === sessionKey ? previewState.value : ""
}
