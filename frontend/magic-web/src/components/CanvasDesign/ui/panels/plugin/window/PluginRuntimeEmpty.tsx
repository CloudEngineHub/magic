import { memo } from "react"

import styles from "./index.module.css"

export const PluginRuntimeEmpty = memo(function PluginRuntimeEmpty({
	description,
	label,
}: {
	description: string
	label: string
}) {
	return (
		<div className={styles.pluginRuntimeEmpty}>
			<div className={styles.pluginRuntimeEmptyTitle}>{label}</div>
			<div>{description}</div>
		</div>
	)
})
