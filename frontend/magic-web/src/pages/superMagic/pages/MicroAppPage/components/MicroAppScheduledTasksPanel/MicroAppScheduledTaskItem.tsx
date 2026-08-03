import { IconCalendarEvent, IconClock, IconDots } from "@tabler/icons-react"
import { Switch } from "antd"
import { useTranslation } from "react-i18next"

import MagicIcon from "@/components/base/MagicIcon"
import ActionButton from "@/pages/superMagic/components/ActionButton"
import type { DropdownDelegateProps } from "@/pages/superMagic/components/SuperMagicDropdown"
import type { ScheduledTask } from "@/types/scheduledTask"

import { formatTaskSchedule } from "./utils"

interface MicroAppScheduledTaskItemProps extends DropdownDelegateProps<ScheduledTask.Task> {
	data: ScheduledTask.Task
	onSwitchChange: (enabled: boolean) => void
}

export default function MicroAppScheduledTaskItem({
	data,
	onSwitchChange,
	onDropdownActionClick,
	onDropdownContextMenuClick,
}: MicroAppScheduledTaskItemProps) {
	const { t } = useTranslation("super")
	const scheduleText = formatTaskSchedule(data.time_config, t)

	return (
		<div
			className="group w-full rounded-xl border border-border bg-background p-5 shadow-sm transition-all hover:border-primary/30 hover:shadow-lg"
			onContextMenu={(event) => onDropdownContextMenuClick?.(event, data)}
			data-testid="micro-app-scheduled-task-item"
		>
			<div className="flex min-w-0 items-center gap-3">
				<div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
					<IconCalendarEvent size={19} stroke={1.8} />
				</div>
				<div className="min-w-0 flex-1 truncate text-[15px] font-semibold leading-6 text-foreground">
					{data.task_name || "-"}
				</div>
				<span
					className={
						data.enabled === 1
							? "shrink-0 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs leading-5 text-emerald-600"
							: "shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs leading-5 text-muted-foreground"
					}
				>
					{data.enabled === 1 ? t("scheduleTask.enabled") : t("scheduleTask.disabled")}
				</span>
				<div className="inline-flex shrink-0" title={t("scheduleTask.moreActions")}>
					<ActionButton
						size={28}
						onClick={(event) => onDropdownActionClick?.(event, data)}
					>
						<MagicIcon size={18} component={IconDots} stroke={2} />
					</ActionButton>
				</div>
			</div>

			<div className="mt-4 flex min-h-10 items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-sm leading-5 text-muted-foreground">
				<IconClock size={15} stroke={2} />
				<span>{scheduleText}</span>
			</div>

			<div className="mt-4 flex items-center justify-between gap-3 text-xs leading-5 text-muted-foreground">
				<span className="min-w-0 truncate">
					{data.topic_name || t("scheduleTask.projectScope")}
				</span>
				<Switch
					size="small"
					checked={data.enabled === 1}
					onChange={onSwitchChange}
					aria-label={t("scheduleTask.toggleTask", { name: data.task_name || "-" })}
				/>
			</div>
		</div>
	)
}
