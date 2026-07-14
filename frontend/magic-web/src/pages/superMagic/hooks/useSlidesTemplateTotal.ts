import useSWR from "swr"
import { SuperMagicApi } from "@/apis"

const SLIDES_TEMPLATE_STATISTICS_CACHE_KEY = "slides-template-statistics"

export interface SlidesTemplateStatistics {
	templateTotal: number
	templateTotalUsageCount?: number
}

/**
 * 侧栏与 PPT 制作专家共用同一个接口结果，避免分别请求或维护静态展示数字。
 */
export function useSlidesTemplateStatistics(): SlidesTemplateStatistics | undefined {
	const { data } = useSWR(
		SLIDES_TEMPLATE_STATISTICS_CACHE_KEY,
		() => SuperMagicApi.getSlidesTemplateCount({}),
		{
			revalidateOnFocus: false,
		},
	)

	if (!data) return undefined

	return {
		templateTotal: data.total,
		templateTotalUsageCount: data.total_usage_count,
	}
}

export function useSlidesTemplateTotal(): number | undefined {
	return useSlidesTemplateStatistics()?.templateTotal
}
