import { GlobalBaseRepository } from "@/models/repository/GlobalBaseRepository"

export interface CachedUserFileTab {
	fileId: string
	title: string
	order: number
	activeAt: number
}

export interface UserFileTabsRecord {
	/** 使用文件引用 resolver 的集群、组织、用户身份键，不依附任何项目。 */
	id: string
	tabs: CachedUserFileTab[]
	activeTabId?: string
}

export class UserFileTabsRepository extends GlobalBaseRepository<UserFileTabsRecord> {
	static readonly tableName = "super-user-file-tabs"

	constructor() {
		super(UserFileTabsRepository.tableName)
	}
}
