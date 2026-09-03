import { useEffect, useRef } from "react"
import { useMemoizedFn } from "ahooks"
import {
	MAGIC_WIDGET_PROTOCOL,
	MAGIC_WIDGET_PROTOCOL_VERSION,
} from "@/providers/MagicWidgetProvider/config"
import type { MagicWidgetEmbedContext } from "@/providers/MagicWidgetProvider/types"

/** Publishes the actual preview fullscreen state to the validated Widget host instance. */
export function useMagicWidgetPreviewFullscreen(
	widgetContext: Pick<MagicWidgetEmbedContext, "instanceId" | "hostOrigin"> | null,
) {
	const lastSentStateRef = useRef<boolean>()
	const instanceId = widgetContext?.instanceId
	const hostOrigin = widgetContext?.hostOrigin

	const publishPreviewFullscreen = useMemoizedFn((isFullscreen: boolean) => {
		if (!instanceId || !hostOrigin || window.parent === window) return
		if (lastSentStateRef.current === isFullscreen) return

		lastSentStateRef.current = isFullscreen
		window.parent.postMessage(
			{
				protocol: MAGIC_WIDGET_PROTOCOL,
				version: MAGIC_WIDGET_PROTOCOL_VERSION,
				instanceId,
				type: "ui_state",
				state: { previewFullscreen: isFullscreen },
			},
			hostOrigin,
		)
	})

	useEffect(() => {
		lastSentStateRef.current = undefined
		return () => {
			if (
				!instanceId ||
				!hostOrigin ||
				window.parent === window ||
				lastSentStateRef.current !== true
			) {
				return
			}
			// A final false snapshot prevents host layout leaks when the Crew route unmounts.
			window.parent.postMessage(
				{
					protocol: MAGIC_WIDGET_PROTOCOL,
					version: MAGIC_WIDGET_PROTOCOL_VERSION,
					instanceId,
					type: "ui_state",
					state: { previewFullscreen: false },
				},
				hostOrigin,
			)
		}
	}, [hostOrigin, instanceId])

	return publishPreviewFullscreen
}
