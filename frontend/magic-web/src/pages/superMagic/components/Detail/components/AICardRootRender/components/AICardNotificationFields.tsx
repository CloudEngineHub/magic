import { useCallback } from "react"
import { useTranslation } from "react-i18next"
import { Bell } from "lucide-react"
import { Checkbox } from "@/components/shadcn-ui/checkbox"
import { Input } from "@/components/shadcn-ui/input"
import { Button } from "@/components/shadcn-ui/button"
import {
	EMPTY_AI_CARD_NOTIFICATION,
	normalizeAICardNotification,
	type AICardNotificationChannel,
	type AICardNotificationConfig,
} from "../utils/aiCardNotification"

interface AICardNotificationFieldsProps {
	value?: AICardNotificationConfig | null
	onChange: (value: AICardNotificationConfig) => void
	disabled?: boolean
}

function AICardNotificationFields({ value, onChange, disabled }: AICardNotificationFieldsProps) {
	const { t } = useTranslation("super")
	const notification = normalizeAICardNotification(value ?? EMPTY_AI_CARD_NOTIFICATION)
	const channels = [
		{
			channel: "dingtalk" as const,
			label: t("detail.aiCard.notification.channels.dingtalk"),
			placeholder: t("detail.aiCard.notification.placeholders.dingtalk"),
			templates: [
				t("detail.aiCard.notification.templates.dingtalkGroup"),
				t("detail.aiCard.notification.templates.dingtalkUser"),
			],
		},
		{
			channel: "lark" as const,
			label: t("detail.aiCard.notification.channels.lark"),
			placeholder: t("detail.aiCard.notification.placeholders.lark"),
			templates: [
				t("detail.aiCard.notification.templates.larkGroup"),
				t("detail.aiCard.notification.templates.larkUser"),
			],
		},
	]

	const updateChannel = useCallback(
		(channel: AICardNotificationChannel, nextTargetDescription: string) => {
			const nextChannels = notification.channels.map((item) =>
				item.channel === channel
					? { ...item, targetDescription: nextTargetDescription }
					: item,
			)
			onChange({ channels: nextChannels })
		},
		[notification.channels, onChange],
	)

	const toggleChannel = useCallback(
		(channel: AICardNotificationChannel, checked: boolean) => {
			if (checked) {
				onChange({
					channels: [...notification.channels, { channel, targetDescription: "" }],
				})
				return
			}
			onChange({ channels: notification.channels.filter((item) => item.channel !== channel) })
		},
		[notification.channels, onChange],
	)

	return (
		<section className="space-y-3 rounded-lg border border-border px-4 py-3">
			<div className="flex items-start gap-2">
				<Bell className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
				<div className="min-w-0">
					<div className="text-sm font-medium text-foreground">
						{t("detail.aiCard.notification.title")}
					</div>
					<div className="text-xs leading-relaxed text-muted-foreground">
						{t("detail.aiCard.notification.description")}
					</div>
				</div>
			</div>

			<div className="space-y-3">
				{channels.map(({ channel, label, placeholder, templates }) => {
					const selected = notification.channels.find((item) => item.channel === channel)
					const checked = Boolean(selected)
					return (
						<div
							key={channel}
							className="space-y-2 rounded-md border border-border/70 p-3"
						>
							<label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-foreground">
								<Checkbox
									checked={checked}
									onCheckedChange={(nextChecked) =>
										toggleChannel(channel, nextChecked === true)
									}
									disabled={disabled}
									aria-label={label}
								/>
								<span>{label}</span>
							</label>

							{checked && (
								<div className="space-y-2 pl-6">
									<Input
										value={selected?.targetDescription || ""}
										onChange={(event) =>
											updateChannel(channel, event.target.value)
										}
										placeholder={placeholder}
										disabled={disabled}
									/>
									<div className="flex flex-wrap gap-2">
										{templates.map((template) => (
											<Button
												key={template}
												type="button"
												variant="outline"
												size="sm"
												disabled={disabled}
												onClick={() => updateChannel(channel, template)}
												className="h-7 rounded-full px-3 text-xs"
											>
												{template}
											</Button>
										))}
									</div>
								</div>
							)}
						</div>
					)
				})}
			</div>
		</section>
	)
}

export default AICardNotificationFields
