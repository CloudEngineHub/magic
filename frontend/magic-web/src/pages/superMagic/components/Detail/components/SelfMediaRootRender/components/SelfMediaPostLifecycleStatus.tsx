import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import type { SelfMediaPostOpsArtifacts } from "../services/selfMediaOpsArtifactStates"

type SelfMediaPostLifecycle = "draft" | "published" | "synced" | "reviewed"

const LIFECYCLE_STYLES: Record<SelfMediaPostLifecycle, string> = {
	draft: "bg-[#fff7ed] text-[#9a3412]",
	published: "bg-[#ecfeff] text-[#0e7490]",
	reviewed: "bg-[#ecfdf5] text-[#047857]",
	synced: "bg-[#eef2ff] text-[#4338ca]",
}

function resolvePostLifecycle(opsArtifacts: SelfMediaPostOpsArtifacts): SelfMediaPostLifecycle {
	if (opsArtifacts.review) return "reviewed"
	if (opsArtifacts.metrics || opsArtifacts.comments) return "synced"
	if (opsArtifacts.source) return "published"
	return "draft"
}

export default function SelfMediaPostLifecycleStatus({
	opsArtifacts,
	postId,
}: {
	opsArtifacts: SelfMediaPostOpsArtifacts
	postId: string
}) {
	const { t } = useTranslation("super")
	const lifecycle = resolvePostLifecycle(opsArtifacts)

	return (
		<span
			className={cn(
				"shrink-0 rounded-full px-2 py-0.5 text-[10px] font-[760] leading-4",
				LIFECYCLE_STYLES[lifecycle],
			)}
			data-lifecycle={lifecycle}
			data-testid={`self-media-home-post-lifecycle-${postId}`}
		>
			{t(`detail.selfMedia.home.lifecycle.${lifecycle}`)}
		</span>
	)
}
