import { useEffect } from "react"
import useSWR from "swr"
import { SuperMagicApi } from "@/apis"
import { isPrivateDeployment } from "@/utils/env"

const SLIDES_TEMPLATE_STATISTICS_CACHE_KEY = "slides-template-statistics"
export const SLIDES_TEMPLATE_STATISTICS_REFRESH_INTERVAL = 5000

interface StatisticsPollingSubscriber {
	interval: number
	revalidate: () => Promise<unknown>
}

const statisticsPollingSubscribers = new Map<symbol, StatisticsPollingSubscriber>()
let statisticsPollingTimer: ReturnType<typeof setInterval> | undefined
let statisticsPollingInterval = 0
let isStatisticsPolling = false

function canPollStatistics() {
	if (typeof document !== "undefined" && document.visibilityState === "hidden") return false
	if (typeof navigator !== "undefined" && navigator.onLine === false) return false
	return true
}

function stopStatisticsPollingTimer() {
	if (statisticsPollingTimer) clearInterval(statisticsPollingTimer)
	statisticsPollingTimer = undefined
	statisticsPollingInterval = 0
}

function pollStatistics() {
	if (!canPollStatistics() || isStatisticsPolling) return

	const subscriber = statisticsPollingSubscribers.values().next().value
	if (!subscriber) return

	isStatisticsPolling = true
	void subscriber
		.revalidate()
		.catch(() => undefined)
		.finally(() => {
			isStatisticsPolling = false
		})
}

function updateStatisticsPollingTimer() {
	const intervals = Array.from(statisticsPollingSubscribers.values(), ({ interval }) => interval)
	const nextInterval = intervals.length > 0 ? Math.min(...intervals) : 0

	if (nextInterval === statisticsPollingInterval) return
	stopStatisticsPollingTimer()
	if (nextInterval <= 0) return

	statisticsPollingInterval = nextInterval
	statisticsPollingTimer = setInterval(pollStatistics, nextInterval)
}

function subscribeStatisticsPolling(
	interval: number,
	revalidate: StatisticsPollingSubscriber["revalidate"],
) {
	if (interval <= 0) return () => undefined

	const subscriberId = Symbol("slides-template-statistics-polling")
	statisticsPollingSubscribers.set(subscriberId, { interval, revalidate })
	updateStatisticsPollingTimer()

	return () => {
		statisticsPollingSubscribers.delete(subscriberId)
		updateStatisticsPollingTimer()
	}
}

export interface SlidesTemplateStatistics {
	templateTotal: number
	templateTotalUsageCount?: number
	templateCountTodayGrowth?: number
}

interface UseSlidesTemplateStatisticsOptions {
	enabled?: boolean
	refreshInterval?: number
}

/**
 * 侧栏与 PPT 制作专家共用同一个接口结果，避免分别请求或维护静态展示数字。
 */
export function useSlidesTemplateStatistics({
	enabled = true,
	refreshInterval = SLIDES_TEMPLATE_STATISTICS_REFRESH_INTERVAL,
}: UseSlidesTemplateStatisticsOptions = {}): SlidesTemplateStatistics | undefined {
	const { data, mutate } = useSWR(
		enabled ? SLIDES_TEMPLATE_STATISTICS_CACHE_KEY : null,
		() => SuperMagicApi.getSlidesTemplateCount({}),
		{
			revalidateOnFocus: false,
			revalidateOnReconnect: false,
		},
	)
	const shouldPoll = !isPrivateDeployment()

	useEffect(() => {
		if (!enabled || !shouldPoll) return
		return subscribeStatisticsPolling(refreshInterval, () => mutate())
	}, [enabled, mutate, refreshInterval, shouldPoll])

	if (!data) return undefined

	return {
		templateTotal: data.total,
		templateTotalUsageCount: data.total_usage_count,
		templateCountTodayGrowth: data.template_count_today_growth,
	}
}

export function useSlidesTemplateTotal(
	options: UseSlidesTemplateStatisticsOptions = {},
): number | undefined {
	return useSlidesTemplateStatistics(options)?.templateTotal
}
