import { makeAutoObservable, runInAction } from "mobx"
import { skillsService } from "@/services/skills/SkillsService"
import type { GetStoreSkillsParams } from "@/apis/modules/skills"
import type { StoreSkillView } from "@/services/skills/SkillsService"
import {
	appendUniqueById,
	beginPageRequest,
	isLatestPageRequest,
	resolveKeywordParam,
	toOptionalKeyword,
} from "@/pages/superMagic/utils/paged-list-store"

const DEFAULT_PAGE_SIZE = 20

export class StoreSkillsStore {
	list: StoreSkillView[] = []
	total = 0
	page = 1
	pageSize = DEFAULT_PAGE_SIZE
	keyword = ""
	loading = false
	loadingMore = false
	addingSkillIds = new Set<string>()
	private fetchRequestId = 0

	constructor() {
		makeAutoObservable(this, {}, { autoBind: true })
	}

	get hasMore() {
		return this.list.length < this.total
	}

	get isEmpty() {
		return !this.loading && this.list.length === 0
	}

	isAddingSkill(id: string) {
		return this.addingSkillIds.has(id)
	}

	async fetchSkills(params: GetStoreSkillsParams = {}) {
		const page = params.page ?? 1
		const pageSize = params.page_size ?? this.pageSize
		const keyword = resolveKeywordParam(params, this.keyword)
		const requestId = beginPageRequest({
			page,
			loading: this.loading,
			currentRequestId: this.fetchRequestId,
		})
		if (requestId == null) return

		this.fetchRequestId = requestId
		this.loading = true

		if (page === 1) {
			this.list = []
			this.total = 0
			this.page = 1
			// Align loadMore with in-flight search before response returns
			this.keyword = keyword
			this.loadingMore = false
		}

		try {
			const data = await skillsService.getStoreSkills({
				page,
				page_size: pageSize,
				keyword: toOptionalKeyword(keyword),
				publisher_type: params.publisher_type,
			})
			if (!isLatestPageRequest({ requestId, currentRequestId: this.fetchRequestId })) return
			runInAction(() => {
				this.list = data.list
				this.total = data.total
				this.page = data.page
				this.pageSize = data.pageSize
				this.keyword = keyword
				this.loading = false
			})
		} catch (error) {
			if (!isLatestPageRequest({ requestId, currentRequestId: this.fetchRequestId })) return
			runInAction(() => {
				this.loading = false
			})
			throw error
		}
	}

	async loadMore() {
		if (this.loading || this.loadingMore || !this.hasMore) return
		this.loadingMore = true
		const nextPage = this.page + 1
		const requestId = this.fetchRequestId

		try {
			const data = await skillsService.getStoreSkills({
				page: nextPage,
				page_size: this.pageSize,
				keyword: toOptionalKeyword(this.keyword),
			})
			if (!isLatestPageRequest({ requestId, currentRequestId: this.fetchRequestId })) return
			runInAction(() => {
				this.list = appendUniqueById(this.list, data.list)
				this.total = data.total
				this.page = data.page
				this.pageSize = data.pageSize
				this.loadingMore = false
			})
		} catch (error) {
			if (!isLatestPageRequest({ requestId, currentRequestId: this.fetchRequestId })) return
			runInAction(() => {
				this.loadingMore = false
			})
			throw error
		}
	}

	async addSkill(id: string) {
		const target = this.list.find((item) => item.id === id)
		if (!target || target.status === "added" || this.isAddingSkill(id)) return

		this.addingSkillIds.add(id)
		try {
			await skillsService.addSkillFromStore(target.storeSkillId)
			runInAction(() => {
				target.status = "added"
			})
		} finally {
			runInAction(() => {
				this.addingSkillIds.delete(id)
			})
		}
	}

	async upgradeSkill(id: string) {
		const target = this.list.find((item) => item.id === id)
		if (!target) return

		await skillsService.upgradeSkill(target.skillCode)
		runInAction(() => {
			target.needUpgrade = false
		})
	}

	/** Refetch list after locale change (server i18n fields). */
	refreshAfterLanguageChange() {
		void this.fetchSkills({
			page: 1,
			keyword: toOptionalKeyword(this.keyword),
		})
	}

	reset() {
		this.list = []
		this.total = 0
		this.page = 1
		this.pageSize = DEFAULT_PAGE_SIZE
		this.keyword = ""
		this.loading = false
		this.loadingMore = false
		this.addingSkillIds.clear()
		this.fetchRequestId = 0
	}
}
