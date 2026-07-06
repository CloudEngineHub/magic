import { forwardRef, memo } from "react"

import styles from "./index.module.css"

export const PluginRuntimeFrame = memo(
	forwardRef<
		HTMLIFrameElement,
		{
			height: number
			srcDoc: string
			title: string
		}
	>(function PluginRuntimeFrame({ height, srcDoc, title }, ref) {
		return (
			<iframe
				ref={ref}
				className={styles.pluginFrame}
				title={title}
				sandbox="allow-scripts"
				srcDoc={srcDoc}
				style={{ height }}
			/>
		)
	}),
)
