import type { ReactNode } from "react"

export function MentionFileImagePreviewBox(props: { iconSize: number; children: ReactNode }) {
	const { iconSize, children } = props

	return (
		<div
			className="relative shrink-0 overflow-hidden rounded bg-muted"
			style={{
				width: iconSize,
				height: iconSize,
				minWidth: iconSize,
				minHeight: iconSize,
				maxWidth: iconSize,
				maxHeight: iconSize,
			}}
		>
			{children}
		</div>
	)
}
