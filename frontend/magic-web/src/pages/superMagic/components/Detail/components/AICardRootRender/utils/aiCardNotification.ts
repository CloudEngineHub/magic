export type AICardNotificationChannel = "dingtalk" | "wecom" | "lark"

export interface AICardNotificationChannelConfig {
	channel: AICardNotificationChannel
	targetDescription: string
}

export interface AICardNotificationConfig {
	channels: AICardNotificationChannelConfig[]
}

export const EMPTY_AI_CARD_NOTIFICATION: AICardNotificationConfig = { channels: [] }

export function normalizeAICardNotification(
	value: AICardNotificationConfig | undefined | null,
): AICardNotificationConfig {
	if (!value || !Array.isArray(value.channels)) return EMPTY_AI_CARD_NOTIFICATION

	const seen = new Set<AICardNotificationChannel>()
	const channels = value.channels.reduce<AICardNotificationChannelConfig[]>((acc, item) => {
		if (!isAICardNotificationChannel(item?.channel) || seen.has(item.channel)) return acc
		const targetDescription =
			typeof item.targetDescription === "string" ? item.targetDescription : ""
		seen.add(item.channel)
		acc.push({ channel: item.channel, targetDescription })
		return acc
	}, [])

	return { channels }
}

export function compactAICardNotification(
	value: AICardNotificationConfig | undefined | null,
): AICardNotificationConfig | undefined {
	const notification = normalizeAICardNotification(value)
	const channels = notification.channels
		.map((item) => ({
			channel: item.channel,
			targetDescription: item.targetDescription.trim(),
		}))
		.filter((item) => item.targetDescription)

	return channels.length > 0 ? { channels } : undefined
}

function isAICardNotificationChannel(value: unknown): value is AICardNotificationChannel {
	return value === "dingtalk" || value === "wecom" || value === "lark"
}
