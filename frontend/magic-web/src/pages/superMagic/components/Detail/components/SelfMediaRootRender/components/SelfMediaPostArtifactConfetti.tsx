import type { SelfMediaPostOpsArtifactKey } from "../services/selfMediaOpsArtifactStates"

interface SelfMediaPostArtifactConfettiProps {
	postId: string
	artifactKey: SelfMediaPostOpsArtifactKey
}

function SelfMediaPostArtifactConfetti({
	postId,
	artifactKey,
}: SelfMediaPostArtifactConfettiProps) {
	return (
		<span
			className="pointer-events-none absolute inset-0"
			aria-hidden="true"
			data-testid={`self-media-home-post-ops-artifact-confetti-${postId}-${artifactKey}`}
		>
			<span className="absolute -left-1 -top-1 size-1 animate-ping rounded-full bg-sky-400" />
			<span className="absolute -right-1 -top-0.5 size-1 animate-ping rounded-full bg-amber-400 [animation-delay:120ms]" />
			<span className="absolute -bottom-1 left-1/2 size-1 animate-ping rounded-full bg-emerald-400 [animation-delay:240ms]" />
		</span>
	)
}

export default SelfMediaPostArtifactConfetti
