import type { GetStoreAgentsParams, StoreAgentMarketType } from "@/apis/modules/crew"

/** Synthetic filter id for the combined public + organization view. */
export const ALL_MARKET_FILTER_ID = "all"

/** Synthetic filter id for organization-shared agents. */
export const ORGANIZATION_MARKET_FILTER_ID = "organization"

export function resolveActiveMarketFilterId(
	marketType: StoreAgentMarketType | undefined,
	categoryId: string | undefined,
): string {
	if (marketType === "ORGANIZATION") return ORGANIZATION_MARKET_FILTER_ID
	if (marketType === "MARKET" && categoryId) return categoryId
	return ALL_MARKET_FILTER_ID
}

/** Convert a visible filter chip into the API's source/category parameters. */
export function resolveMarketFilterParams(
	filterId: string,
): Pick<GetStoreAgentsParams, "market_type" | "category_id"> {
	if (filterId === ORGANIZATION_MARKET_FILTER_ID) {
		return { market_type: "ORGANIZATION", category_id: undefined }
	}

	if (filterId === ALL_MARKET_FILTER_ID) {
		// Deliberately leave market_type undefined: the API combines both sources.
		return { market_type: undefined, category_id: undefined }
	}

	return { market_type: "MARKET", category_id: filterId }
}
