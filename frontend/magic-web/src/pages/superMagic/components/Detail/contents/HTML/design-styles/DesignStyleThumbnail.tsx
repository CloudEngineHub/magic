import { memo } from "react"
import type { DesignStyle } from "./catalog"
import DesignStyleCover from "./DesignStyleCover"
import { getStyleProfile } from "./styleProfiles"

interface DesignStyleThumbnailProps {
	style: DesignStyle
}

/** A 16:10 composition derived from the same profile and tokens as the full preview. */
export default memo(function DesignStyleThumbnail({ style }: DesignStyleThumbnailProps) {
	const profile = getStyleProfile(style.code)

	return (
		<div
			data-testid={`design-style-thumbnail-${style.code}`}
			data-variant={profile?.layout ?? "pending"}
			className="aspect-[8/5] overflow-hidden border-b border-border/50 bg-muted/30"
			aria-hidden="true"
		>
			<DesignStyleCover style={style} />
		</div>
	)
})
