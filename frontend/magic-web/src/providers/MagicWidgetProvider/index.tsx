import {
	createContext,
	useContext,
	useEffect,
	useMemo,
	useState,
	type PropsWithChildren,
} from "react"
import { useLocation } from "react-router-dom"
import { flushSync } from "react-dom"
import {
	getMagicWidgetEmbedContext,
	getMagicWidgetInitialConfig,
	MAGIC_WIDGET_PROTOCOL,
	MAGIC_WIDGET_PROTOCOL_VERSION,
	normalizeMagicWidgetConfig,
} from "./config"
import type { MagicWidgetContextValue, MagicWidgetEmbedContext } from "./types"

const DEFAULT_CONTEXT_VALUE: MagicWidgetContextValue = {
	embedContext: null,
	config: {},
}

const MagicWidgetContext = createContext<MagicWidgetContextValue>(DEFAULT_CONTEXT_VALUE)

/** Owns one document-scoped embed identity and validates all runtime configuration updates. */
export function MagicWidgetProvider({ children }: PropsWithChildren) {
	const { search } = useLocation()
	// Protected embed metadata is immutable for one iframe document and is re-read after reload.
	const [embedContext] = useState(() => getMagicWidgetEmbedContext(search))
	const [config, setConfig] = useState(() => getMagicWidgetInitialConfig(search, embedContext))

	useEffect(() => {
		if (!embedContext || window.parent === window) return
		const targetOrigin = embedContext.hostOrigin

		/** Returns one correlated configuration result to the bound SDK instance. */
		const respond = (
			context: MagicWidgetEmbedContext,
			requestId: string,
			ok: boolean,
			error?: string,
		) => {
			window.parent.postMessage(
				{
					protocol: MAGIC_WIDGET_PROTOCOL,
					version: MAGIC_WIDGET_PROTOCOL_VERSION,
					instanceId: context.instanceId,
					requestId,
					type: "response",
					ok,
					error: error ? { code: "INVALID_CONFIG", message: error } : undefined,
				},
				targetOrigin,
			)
		}

		/** Accepts configuration only from the parent window bound by the initial embed metadata. */
		const handleMessage = (event: MessageEvent) => {
			if (
				event.origin !== targetOrigin ||
				event.source !== window.parent ||
				!event.data ||
				event.data.protocol !== MAGIC_WIDGET_PROTOCOL ||
				event.data.version !== MAGIC_WIDGET_PROTOCOL_VERSION ||
				event.data.instanceId !== embedContext.instanceId ||
				event.data.type !== "config" ||
				typeof event.data.requestId !== "string"
			) {
				return
			}

			try {
				const nextConfig = normalizeMagicWidgetConfig(event.data.config)
				// Commit the new snapshot before acknowledging it so updateConfig resolves after UI state changes.
				flushSync(() => setConfig(nextConfig))
				respond(embedContext, event.data.requestId, true)
			} catch (error) {
				respond(
					embedContext,
					event.data.requestId,
					false,
					error instanceof Error ? error.message : "Widget configuration is invalid",
				)
			}
		}

		window.addEventListener("message", handleMessage)
		// Announce only after the validated listener is installed so reload synchronization cannot race it.
		window.parent.postMessage(
			{
				protocol: MAGIC_WIDGET_PROTOCOL,
				version: MAGIC_WIDGET_PROTOCOL_VERSION,
				instanceId: embedContext.instanceId,
				type: "config_ready",
			},
			targetOrigin,
		)
		return () => window.removeEventListener("message", handleMessage)
	}, [embedContext])

	const value = useMemo<MagicWidgetContextValue>(
		() => ({ embedContext, config }),
		[config, embedContext],
	)
	return <MagicWidgetContext.Provider value={value}>{children}</MagicWidgetContext.Provider>
}

/** Exposes the validated document-scoped configuration to shell and Crew consumers. */
export function useMagicWidgetConfig(): MagicWidgetContextValue {
	return useContext(MagicWidgetContext)
}
