import { memo } from "react"
import type { AudioProjectListItem } from "@/types/audioProject"
import AudioRecordingCard from "@/pages/superMagic/pages/AudioRecordings/components/AudioRecordingCard"

interface MobileRecordingCardProps {
	item: AudioProjectListItem
	onOpen?: (item: AudioProjectListItem) => void
	onSummarize?: (item: AudioProjectListItem) => void
	onMore?: (item: AudioProjectListItem) => void
	onRetry?: (item: AudioProjectListItem) => void
	onRetryMerge?: (item: AudioProjectListItem) => void
	isSubmitting?: boolean
}

/**
 * Mobile recording card wrapper: delegates rendering to the shared,
 * unified AudioRecordingCard component with 'mobile' layout configuration.
 */
export const MobileRecordingCard = memo(function MobileRecordingCard(
	props: MobileRecordingCardProps,
) {
	return <AudioRecordingCard {...props} layout="mobile" />
})
