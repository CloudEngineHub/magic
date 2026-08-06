import { Check, MessageCircle, X } from "lucide-react"
import { useTranslation } from "react-i18next"

import MagicPopup from "@/components/base-mobile/MagicPopup"
import { Button } from "@/components/shadcn-ui/button"
import type { Topic } from "@/pages/superMagic/pages/Workspace/types"
import { MobileResourceTypeIcon } from "@/pages/superMagicMobile/components/icons/mobile-resource-type-icon"
import { cn } from "@/lib/utils"

interface MicroAppTopicPickerProps {
	open: boolean
	topics: Topic[]
	selectedTopicId?: string
	onSelect: (topic: Topic) => void
	onClose: () => void
}

/** 微应用移动端话题选择使用独立底部列表，不引入桌面历史话题面板。 */
export default function MicroAppTopicPicker({
	open,
	topics,
	selectedTopicId,
	onSelect,
	onClose,
}: MicroAppTopicPickerProps) {
	const { t } = useTranslation("super")

	return (
		<MagicPopup
			visible={open}
			position="bottom"
			onClose={onClose}
			hideDefaultHandle
			title={t("topic.allTopics")}
			bodyClassName="h-[64dvh] max-h-[64dvh] overflow-hidden rounded-t-[20px] border-0 bg-mobile-background p-0"
		>
			<div className="flex h-full min-h-0 flex-col">
				<header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4">
					<div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
						<MessageCircle className="size-[18px]" aria-hidden />
					</div>
					<div className="min-w-0 flex-1">
						<p className="truncate text-base font-medium text-foreground">
							{t("topic.allTopics")}
						</p>
						<p className="text-xs text-muted-foreground">
							{t("microAppPage.mobileConversation.topicCount", {
								count: topics.length,
							})}
						</p>
					</div>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						className="size-9"
						onClick={onClose}
						aria-label={t("common.close")}
					>
						<X className="size-[18px]" aria-hidden />
					</Button>
				</header>

				<div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-3 py-2">
					{topics.length === 0 ? (
						<div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
							{t("microAppPage.mobileConversation.noTopics")}
						</div>
					) : (
						<div className="flex flex-col gap-1">
							{topics.map((topic) => {
								const selected = topic.id === selectedTopicId
								const isRunning =
									topic.task_status === "running" ||
									topic.task_status === "waiting_for_user"
								return (
									<button
										key={topic.id}
										type="button"
										className={cn(
											"flex min-h-14 w-full items-center gap-3 rounded-xl px-3 py-2 text-left",
											selected && "bg-primary/10",
										)}
										onClick={() => onSelect(topic)}
										data-testid={`micro-app-mobile-topic-${topic.id}`}
									>
										<MobileResourceTypeIcon
											type="projectTopic"
											isRunning={isRunning}
											iconSizeClass="size-5"
											data-testid="micro-app-mobile-topic-icon"
										/>
										<div className="min-w-0 flex-1">
											<p className="truncate text-sm font-medium text-foreground">
												{topic.topic_name || t("topic.unnamedTopic")}
											</p>
										</div>
										{selected ? (
											<Check
												className="size-4 shrink-0 text-primary"
												aria-hidden
											/>
										) : null}
									</button>
								)
							})}
						</div>
					)}
				</div>
			</div>
		</MagicPopup>
	)
}
