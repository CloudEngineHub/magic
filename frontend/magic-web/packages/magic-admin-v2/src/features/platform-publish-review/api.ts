import { RequestUrl } from "@magic-admin-v2/api/constants"
import type { HttpClient, RequestOptions } from "@magic-admin-v2/api/types"
import { buildApiUrl } from "@magic-admin-v2/api/api-url"
import type {
	AgentReviewListParams,
	AgentVersionReviewItem,
	PublishReviewVariant,
	ReviewVersionParams,
	SkillReviewListParams,
	SkillVersionReviewItem,
	WithPage,
} from "@magic-admin-v2/features/platform-publish-review/types"

const reviewEndpointMap = {
	internal: {
		agentAction: RequestUrl.organizationAgentReviewAction,
		agentList: RequestUrl.organizationAgentReviewList,
		skillAction: RequestUrl.organizationSkillReviewAction,
		skillList: RequestUrl.organizationSkillReviewList,
	},
	platform: {
		agentAction: RequestUrl.agentReviewAction,
		agentList: RequestUrl.agentReviewList,
		skillAction: RequestUrl.skillReviewAction,
		skillList: RequestUrl.skillReviewList,
	},
} as const

export function createPlatformPublishReviewApi(client: HttpClient) {
	return {
		getAgentReviewList(
			params: AgentReviewListParams,
			variant: PublishReviewVariant = "platform",
			options?: RequestOptions,
		) {
			return client.post<WithPage<AgentVersionReviewItem>>(
				reviewEndpointMap[variant].agentList,
				params,
				options,
			)
		},
		getSkillReviewList(
			params: SkillReviewListParams,
			variant: PublishReviewVariant = "platform",
			options?: RequestOptions,
		) {
			return client.post<WithPage<SkillVersionReviewItem>>(
				reviewEndpointMap[variant].skillList,
				params,
				options,
			)
		},
		reviewAgentVersion(
			id: string,
			values: ReviewVersionParams,
			variant: PublishReviewVariant = "platform",
			options?: RequestOptions,
		) {
			return client.put<null>(
				buildApiUrl(reviewEndpointMap[variant].agentAction, { id }),
				values,
				options,
			)
		},
		reviewSkillVersion(
			id: string,
			values: ReviewVersionParams,
			variant: PublishReviewVariant = "platform",
			options?: RequestOptions,
		) {
			return client.put<null>(
				buildApiUrl(reviewEndpointMap[variant].skillAction, { id }),
				values,
				options,
			)
		},
	}
}
