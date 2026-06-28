import { platformKey } from "@/utils/storage"
import { userStore } from "@/models/user"

/** 首页输入框互联网搜索状态的默认键 */
export const DEFAULT_KEY = "default"

/** 互联网搜索状态管理器 */
export class InternetSearchManager {
	private isCheckedTopicMap: Record<string, boolean> | null = null
	private listeners = new Set<(topicId: string | undefined, isChecked: boolean) => void>()

	get localStorageKey() {
		// 组织维度下的话题维度隔离
		const key = userStore.user.organizationCode
		return key ? platformKey(`super_magic/topic_internet_search/${key}`) : ""
	}

	public getIsChecked(topicId: string | undefined): boolean {
		const getKey = topicId ?? DEFAULT_KEY
		// 1. 优先读取内存
		if (this.isCheckedTopicMap) {
			return this.isCheckedTopicMap[getKey] ?? true
		}
		// 2. 处理组织码为空的极端情况
		const localStorageKey = this.localStorageKey
		if (!localStorageKey) return true
		// 3. 读取 localStorage
		const cachedIsCheckedTopicMap = localStorage.getItem(this.localStorageKey)
		// 4. 处理 localStorage 为空的情况
		if (!cachedIsCheckedTopicMap) return true
		// 5. 处理 localStorage 不为空的情况
		let cachedIsCheckedTopicMapObj: Record<string, boolean>
		try {
			cachedIsCheckedTopicMapObj = JSON.parse(cachedIsCheckedTopicMap)
		} catch {
			return true
		}
		return cachedIsCheckedTopicMapObj[getKey] ?? true
	}

	public setIsChecked(topicId: string | undefined, isChecked: boolean) {
		const getKey = topicId ?? DEFAULT_KEY
		const localStorageKey = this.localStorageKey
		// 1. 处理内存为空的情况
		if (!this.isCheckedTopicMap) {
			this.isCheckedTopicMap = {}
			if (localStorageKey) {
				try {
					const cachedIsCheckedTopicMap = localStorage.getItem(localStorageKey)
					if (cachedIsCheckedTopicMap) {
						this.isCheckedTopicMap = JSON.parse(cachedIsCheckedTopicMap)
					}
				} catch {
					this.isCheckedTopicMap = {}
				}
			}
		}
		// 2. 写入内存
		this.isCheckedTopicMap[getKey] = isChecked
		// 3. 写入 localStorage
		if (localStorageKey) {
			localStorage.setItem(localStorageKey, JSON.stringify(this.isCheckedTopicMap))
		}
		this.listeners.forEach((listener) => listener(topicId, isChecked))
	}

	public subscribe(listener: (topicId: string | undefined, isChecked: boolean) => void) {
		this.listeners.add(listener)
		return () => {
			this.listeners.delete(listener)
		}
	}

	public init() {
		this.isCheckedTopicMap = null
		this.listeners.forEach((listener) => listener(undefined, this.getIsChecked(undefined)))
	}
}

export const internetSearchManager = new InternetSearchManager()
