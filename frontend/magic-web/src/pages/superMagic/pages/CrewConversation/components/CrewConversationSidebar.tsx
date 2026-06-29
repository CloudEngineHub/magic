import { ArrowLeft } from "lucide-react"
import { observer } from "mobx-react-lite"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/shadcn-ui/button"
import type { AgentDetailView } from "@/services/crew/CrewService"
import type { Topic } from "@/pages/superMagic/pages/Workspace/types"
import CrewAvatar from "./CrewAvatar"
import CrewTopicList from "./CrewTopicList"

interface CrewConversationSidebarProps {
	agent: AgentDetailView | null
	topics: Topic[]
	selectedTopicId?: string | null
	isCreatingTopic?: boolean
	onBack: () => void
	onCreateTopic: () => void
	onSelectTopic: (topic: Topic) => void
}

function CrewConversationSidebar({
	agent,
	topics,
	selectedTopicId,
	isCreatingTopic,
	onBack,
	onCreateTopic,
	onSelectTopic,
}: CrewConversationSidebarProps) {
	const { t } = useTranslation("crew/market")

	return (
		<aside
			className="flex h-full min-h-0 flex-col border-r border-border bg-sidebar"
			data-testid="crew-conversation-sidebar"
		>
			<div className="shrink-0 border-b border-border p-3">
				<Button
					type="button"
					variant="ghost"
					size="sm"
					className="mb-4 h-8 px-2"
					onClick={onBack}
				>
					<ArrowLeft className="mr-1 size-4" />
					{t("crewConversation.back")}
				</Button>
				<div className="flex min-w-0 items-start gap-3">
					<CrewAvatar src={agent?.icon} name={agent?.name} className="size-12" />
					<div className="min-w-0 flex-1">
						<div className="truncate text-base font-semibold text-sidebar-foreground">
							{agent?.name || t("crewConversation.unknownCrew")}
						</div>
						{agent?.role ? (
							<div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
								{agent.role}
							</div>
						) : null}
					</div>
				</div>
				{agent?.description ? (
					<p className="mt-3 line-clamp-3 text-xs leading-5 text-muted-foreground">
						{agent.description}
					</p>
				) : null}
			</div>
			<CrewTopicList
				topics={topics}
				selectedTopicId={selectedTopicId}
				isCreatingTopic={isCreatingTopic}
				onCreateTopic={onCreateTopic}
				onSelectTopic={onSelectTopic}
			/>
		</aside>
	)
}

export default observer(CrewConversationSidebar)
