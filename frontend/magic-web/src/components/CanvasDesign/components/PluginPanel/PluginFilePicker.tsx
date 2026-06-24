import { memo, type CSSProperties } from "react"

import ReferenceResourcePopover from "../MessageEditor/reference-assets/ReferenceResourcePopover"
import type {
	ReferenceResourceTypeFilter,
	ReferenceResourceSourceType,
} from "../MessageEditor/reference-assets/reference-resource.types"
import type { ReferenceResourcePanelItem, ReferenceResourcePanelSelectContext } from "../../types"
import type { PluginPoint } from "./runtime/v1"
import {
	noop,
	PLUGIN_FILE_PICKER_BOTTOM_VAR,
	PLUGIN_FILE_PICKER_X_VAR,
	PLUGIN_FILE_PICKER_Y_VAR,
} from "./constants"
import styles from "./index.module.css"

export const PluginFilePicker = memo(function PluginFilePicker({
	anchorPosition,
	maxReferenceFiles,
	onOpenChange,
	onProjectSelect,
	onSelectSource,
	open,
	referenceResourceType,
}: {
	anchorPosition?: PluginPoint
	maxReferenceFiles?: number
	onOpenChange: (open: boolean) => void
	onProjectSelect: (
		item: ReferenceResourcePanelItem,
		context?: ReferenceResourcePanelSelectContext,
	) => void
	onSelectSource: (source: ReferenceResourceSourceType) => void
	open: boolean
	referenceResourceType: ReferenceResourceTypeFilter
}) {
	const hostStyle = anchorPosition
		? ({
				[PLUGIN_FILE_PICKER_X_VAR]: `${anchorPosition.x}px`,
				[PLUGIN_FILE_PICKER_Y_VAR]: `${anchorPosition.y}px`,
				[PLUGIN_FILE_PICKER_BOTTOM_VAR]: "auto",
			} as CSSProperties)
		: undefined

	return (
		<div className={styles.pluginFilePickerHost} style={hostStyle}>
			<ReferenceResourcePopover
				open={open}
				onOpenChange={onOpenChange}
				onMouseEnter={noop}
				onMouseLeave={noop}
				onSelectSource={onSelectSource}
				maxReferenceFiles={maxReferenceFiles}
				currentReferenceFiles={[]}
				isReferenceFileLimitReached={false}
				referenceResourceType={referenceResourceType}
				referenceFileInfos={[]}
				onProjectSelect={onProjectSelect}
				triggerClassName={styles.pluginFilePickerAnchor}
				trigger={<span aria-hidden />}
			/>
		</div>
	)
})
