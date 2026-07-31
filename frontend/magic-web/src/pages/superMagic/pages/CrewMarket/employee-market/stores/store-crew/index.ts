import { makeAutoObservable, runInAction } from "mobx"
import { crewService } from "@/services/crew/CrewService"
import type { GetStoreAgentsParams, StoreAgentMarketType } from "@/apis/modules/crew"
import type { StoreAgentView, CategoryView } from "@/services/crew/CrewService"
import {
	appendUniqueById,
	beginPageRequest,
	isLatestPageRequest,
	resolveKeywordParam,
	toOptionalKeyword,
} from "@/pages/superMagic/utils/paged-list-store"

const DEFAULT_PAGE_SIZE = 20

export class StoreCrewStore {
	list: StoreAgentView[] = []
	total = 0
	page = 1
	pageSize = DEFAULT_PAGE_SIZE
	keyword = ""
	categoryId: string | undefined = undefined
	/** The market source currently displayed; undefined means the combined view. */
	marketType: StoreAgentMarketType | undefined = undefined
	loading = false
	loadingMore = false
	pendingActionIds = new Set<string>()
	/** True after the first page-1 fetch completes; avoids clearing list on search/category refresh. */
	hasLoadedOnce = false
	private fetchRequestId = 0

	categories: CategoryView[] = []
	categoriesLoading = false
	categoriesLoaded = false

	constructor() {
		makeAutoObservable(this, {}, { autoBind: true })
	}

	get hasMore() {
		return this.list.length < this.total
	}

	get isEmpty() {
		return !this.loading && this.list.length === 0
	}

	/** Full-screen market skeleton only before the user has seen any agent rows. */
	get showInitialSkeleton() {
		return this.loading && this.list.length === 0 && !this.hasLoadedOnce
	}

	isAgentActionPending(id: string): boolean {
		return this.pendingActionIds.has(id)
	}

	async fetchCategories() {
		if (this.categoriesLoaded || this.categoriesLoading) return
		this.categoriesLoading = true
		try {
			const data = await crewService.getStoreCategories()
			runInAction(() => {
				this.categories = data
				this.categoriesLoaded = true
				this.categoriesLoading = false
			})
		} catch {
			runInAction(() => {
				this.categoriesLoading = false
			})
		}
	}

	async fetchAgents(params: GetStoreAgentsParams = {}) {
		const page = params.page ?? 1
		const pageSize = params.page_size ?? this.pageSize
		const keyword = resolveKeywordParam(params, this.keyword)
		const marketType = "market_type" in params ? params.market_type : this.marketType
		const requestedCategoryId = "category_id" in params ? params.category_id : this.categoryId
		// Organization-published agents do not carry public-market categories.
		const categoryId = marketType === "MARKET" ? requestedCategoryId : undefined
		const marketTypeChanged = marketType !== this.marketType
		const requestId = beginPageRequest({
			page,
			loading: this.loading,
			currentRequestId: this.fetchRequestId,
		})
		if (requestId == null) return

		this.fetchRequestId = requestId
		this.loading = true

		if (page === 1) {
			// A market tab switch must not briefly show rows from the previous source.
			// Search/category refreshes retain rows so the page does not jump while loading.
			if (!this.hasLoadedOnce || marketTypeChanged) {
				this.list = []
				this.total = 0
			}
			if (marketTypeChanged) this.hasLoadedOnce = false
			this.page = 1
			// Align loadMore with in-flight filters before response returns
			this.keyword = keyword
			this.categoryId = categoryId
			this.marketType = marketType
			this.loadingMore = false
		}

		try {
			const data = await crewService.getStoreAgents({
				page,
				page_size: pageSize,
				keyword: toOptionalKeyword(keyword),
				category_id: categoryId,
				market_type: marketType,
			})
			if (!isLatestPageRequest({ requestId, currentRequestId: this.fetchRequestId })) return
			runInAction(() => {
				this.list = data.list
				this.total = data.total
				this.page = data.page
				this.pageSize = data.pageSize
				this.keyword = keyword
				this.categoryId = categoryId
				this.marketType = marketType
				this.loading = false
				this.hasLoadedOnce = true
			})
		} catch {
			if (!isLatestPageRequest({ requestId, currentRequestId: this.fetchRequestId })) return
			runInAction(() => {
				this.loading = false
				this.hasLoadedOnce = true
			})
		}
	}

	async loadMore() {
		if (this.loading || this.loadingMore || !this.hasMore) return
		this.loadingMore = true
		const nextPage = this.page + 1
		const requestId = this.fetchRequestId

		try {
			const data = await crewService.getStoreAgents({
				page: nextPage,
				page_size: this.pageSize,
				keyword: toOptionalKeyword(this.keyword),
				category_id: this.categoryId,
				market_type: this.marketType,
			})
			if (!isLatestPageRequest({ requestId, currentRequestId: this.fetchRequestId })) return
			runInAction(() => {
				this.list = appendUniqueById(this.list, data.list)
				this.total = data.total
				this.page = data.page
				this.pageSize = data.pageSize
				this.loadingMore = false
			})
		} catch {
			if (!isLatestPageRequest({ requestId, currentRequestId: this.fetchRequestId })) return
			runInAction(() => {
				this.loadingMore = false
			})
		}
	}

	async hireAgent(id: string) {
		const target = this.list.find((item) => item.id === id)
		if (!target || target.allowDelete || target.isAdded || this.pendingActionIds.has(id)) return

		this.pendingActionIds.add(id)
		try {
			await crewService.hireAgent(target.agentCode)
			runInAction(() => {
				const currentTarget = this.list.find((item) => item.id === id)
				if (!currentTarget) return
				// Mutate the existing object so an open detail view observes the new state.
				currentTarget.isAdded = true
				currentTarget.allowDelete = true
			})
		} finally {
			runInAction(() => {
				this.pendingActionIds.delete(id)
			})
		}
	}

	async dismissAgent(id: string) {
		const target = this.list.find((item) => item.id === id)
		if (!target || !target.allowDelete || this.pendingActionIds.has(id)) return

		this.pendingActionIds.add(id)
		try {
			await crewService.deleteAgent(target.userCode ?? target.agentCode)
			runInAction(() => {
				const currentTarget = this.list.find((item) => item.id === id)
				if (!currentTarget) return
				currentTarget.isAdded = false
				currentTarget.allowDelete = false
			})
		} finally {
			runInAction(() => {
				this.pendingActionIds.delete(id)
			})
		}
	}

	/** Refetch categories + agents after locale change (server i18n fields). */
	refreshAfterLanguageChange() {
		runInAction(() => {
			this.categoriesLoaded = false
			this.categories = []
			this.categoriesLoading = false
		})
		void this.fetchCategories()
		void this.fetchAgents({
			page: 1,
			keyword: toOptionalKeyword(this.keyword),
			category_id: this.categoryId,
			market_type: this.marketType,
		})
	}

	reset() {
		this.list = []
		this.total = 0
		this.page = 1
		this.pageSize = DEFAULT_PAGE_SIZE
		this.keyword = ""
		this.categoryId = undefined
		this.marketType = undefined
		this.loading = false
		this.loadingMore = false
		this.pendingActionIds.clear()
		this.hasLoadedOnce = false
		this.fetchRequestId = 0
	}
}
