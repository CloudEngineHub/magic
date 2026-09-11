import { makeAutoObservable, observable, reaction, runInAction } from "mobx"
import type { MagicFSFile } from "@/apis"
import {
	getFileReferenceIdentityKey,
	invalidateFileReferenceCache,
} from "@/pages/superMagic/services/userFileReferenceResolver"
import { userSpaceFileService } from "@/pages/superMagic/components/UserSpace/services/userSpaceFileService"

export interface UserDirectorySnapshot {
	ids: string[]
	loaded: boolean
	loading: boolean
	error: unknown | null
}

interface DirectoryRequest {
	controller: AbortController
	version: number
	promise: Promise<MagicFSFile[]>
}

const ROOT_QUERY = "root"
const EMPTY_DIRECTORY: UserDirectorySnapshot = {
	ids: [],
	loaded: false,
	loading: false,
	error: null,
}

/** 实体按 ID 共享，目录只保存直接子节点；切换项目不重载整个用户空间。 */
export class UserFilesStore {
	identityKey: string | null = null
	rootId: string | null = null
	changeVersion = 0
	mutationVersion = 0
	editingFileIds = observable.set<string>()
	private fileGuards = new Map<string, { path: string; check: () => Promise<boolean> }>()
	files = observable.map<string, MagicFSFile>(undefined, { deep: false })
	directories = observable.map<string, UserDirectorySnapshot>(undefined, { deep: false })
	private requests = new Map<string, DirectoryRequest>()
	private requestVersion = 0
	private uploadCancellations = new Map<string, () => Promise<void>>()

	constructor() {
		makeAutoObservable<
			this,
			"requests" | "requestVersion" | "uploadCancellations" | "fileGuards"
		>(
			this,
			{
				files: false,
				directories: false,
				requests: false,
				requestVersion: false,
				uploadCancellations: false,
				fileGuards: false,
				editingFileIds: false,
			},
			{ autoBind: true },
		)
		reaction(getFileReferenceIdentityKey, this.activateIdentity, { fireImmediately: true })
	}

	get currentIdentityKey(): string | null {
		return getFileReferenceIdentityKey()
	}

	getDirectory(parentId?: string): UserDirectorySnapshot {
		if (this.identityKey !== this.currentIdentityKey) return EMPTY_DIRECTORY
		return this.directories.get(parentId ?? ROOT_QUERY) ?? EMPTY_DIRECTORY
	}

	getChildren(parentId?: string): MagicFSFile[] {
		return this.getDirectory(parentId).ids.flatMap((id) => {
			const file = this.files.get(id)
			return file ? [file] : []
		})
	}

	async loadDirectory(parentId?: string, force = false): Promise<MagicFSFile[]> {
		const identity = this.currentIdentityKey
		this.activateIdentity(identity)
		if (!identity) throw new DOMException("User space is unavailable", "AbortError")
		const key = parentId ?? ROOT_QUERY
		const previous = this.requests.get(key)
		if (previous && !force) return previous.promise
		if (!force && this.getDirectory(parentId).loaded) return this.getChildren(parentId)
		previous?.controller.abort()
		const controller = new AbortController()
		const version = ++this.requestVersion
		this.directories.set(key, { ...this.getDirectory(parentId), loading: true, error: null })
		const isCurrent = () =>
			identity === this.currentIdentityKey && this.requests.get(key)?.version === version
		const promise = userSpaceFileService
			.listDirectory(parentId, controller.signal)
			.then((files) => {
				if (!isCurrent())
					throw new DOMException("Directory request cancelled", "AbortError")
				runInAction(() => {
					this.cacheDirectory(parentId, files, identity)
					if (!parentId) this.rootId = files.find((file) => file.is_directory)?.id ?? null
				})
				return files
			})
			.catch((error: unknown) => {
				// 两个视图同时刷新同一目录时，旧调用等待替代它的新请求，避免误报加载失败。
				if (identity === this.currentIdentityKey && controller.signal.aborted) {
					const latest = this.requests.get(key)
					if (latest && latest.version !== version) return latest.promise
					const directory = this.getDirectory(parentId)
					if (directory.loaded && !directory.loading && !directory.error)
						return this.getChildren(parentId)
				}
				if (isCurrent())
					runInAction(() => {
						this.directories.set(key, {
							...this.getDirectory(parentId),
							loading: false,
							error: controller.signal.aborted ? null : error,
						})
					})
				throw error
			})
			.finally(() => {
				if (isCurrent()) this.requests.delete(key)
			})
		this.requests.set(key, { controller, version, promise })
		return promise
	}

	cacheDirectory(
		parentId: string | undefined,
		files: MagicFSFile[],
		identity: string | null,
	): void {
		if (identity !== this.currentIdentityKey || identity !== this.identityKey) return
		files.forEach((file) => this.files.set(file.id, file))
		this.directories.set(parentId ?? ROOT_QUERY, {
			ids: files.map((file) => file.id),
			loaded: true,
			loading: false,
			error: null,
		})
		this.changeVersion += 1
	}

	async getRoot(): Promise<MagicFSFile> {
		const roots = await this.loadDirectory()
		const root = roots.find((file) => file.is_directory)
		if (!root) throw new Error("User root is unavailable")
		return root
	}

	/** 只查询目标路径的各级目录；缺失返回 null，请求失败继续抛出。 */
	async findPath(segments: readonly string[]): Promise<MagicFSFile | null> {
		const identity = this.currentIdentityKey
		let current = await this.getRoot()
		for (const segment of segments) {
			const children = await this.loadDirectory(current.id)
			if (identity !== this.currentIdentityKey)
				throw new DOMException("Identity changed", "AbortError")
			const child = children.find((file) => file.name === segment)
			if (!child) return null
			current = child
		}
		return current
	}

	/** 仅在用户确认新建或上传后调用；并发同名时重新读取，不重试创建操作。 */
	async ensureDirectory(segments: readonly string[]): Promise<MagicFSFile> {
		const identity = this.currentIdentityKey
		let current = await this.getRoot()
		for (const name of segments) {
			if (identity !== this.currentIdentityKey)
				throw new DOMException("Identity changed", "AbortError")
			const children = await this.loadDirectory(current.id)
			if (identity !== this.currentIdentityKey)
				throw new DOMException("Identity changed", "AbortError")
			let child = children.find((file) => file.name === name)
			if (!child) {
				try {
					child = await userSpaceFileService.createNode({
						name,
						parentId: current.id,
						isDirectory: true,
					})
				} catch (error) {
					if (identity !== this.currentIdentityKey)
						throw new DOMException("Identity changed", "AbortError")
					const latest = await this.loadDirectory(current.id, true)
					child = latest.find((file) => file.name === name)
					if (!child) throw error
				}
				if (identity !== this.currentIdentityKey)
					throw new DOMException("Identity changed", "AbortError")
				await this.loadDirectory(current.id, true)
			}
			if (identity !== this.currentIdentityKey)
				throw new DOMException("Identity changed", "AbortError")
			if (!child.is_directory) throw new Error("A file occupies the directory path")
			current = child
		}
		return current
	}

	/** 目录加载已经保留各级父节点；只沿父链构造路径，不复制完整树。 */
	getPath(fileId: string): MagicFSFile[] {
		if (this.identityKey !== this.currentIdentityKey) return []
		const path: MagicFSFile[] = []
		const visited = new Set<string>()
		let file = this.files.get(fileId)
		while (file && file.id !== this.rootId && !visited.has(file.id)) {
			visited.add(file.id)
			path.unshift(file)
			file = this.files.get(file.parent_id)
		}
		return file?.id === this.rootId ? path : []
	}

	/** 删除结果确认后使相关目录失效；旧响应不得重新插入已删除的子树。 */
	removeFiles(fileIds: readonly string[]): void {
		const removed = new Set(fileIds)
		for (const file of this.files.values()) {
			if (this.getPath(file.id).some((parent) => removed.has(parent.id))) removed.add(file.id)
		}
		this.changeVersion += 1
		for (const id of removed) {
			this.requests.get(id)?.controller.abort()
			this.requests.delete(id)
			this.directories.delete(id)
			this.files.delete(id)
		}
		for (const [id, directory] of this.directories) {
			if (directory.ids.some((child) => removed.has(child))) {
				this.directories.set(id, {
					...directory,
					ids: directory.ids.filter((child) => !removed.has(child)),
					loaded: false,
				})
			}
		}
	}

	notifyMutation(): void {
		invalidateFileReferenceCache()
		this.mutationVersion += 1
	}
	setFileEditing(id: string, editing: boolean): void {
		if (editing) this.editingFileIds.add(id)
		else this.editingFileIds.delete(id)
	}
	registerFileGuard(id: string, path: string, check: () => Promise<boolean>): void {
		this.fileGuards.set(id, { path, check })
	}
	unregisterFileGuard(id: string): void {
		this.fileGuards.delete(id)
	}

	async confirmIdentityChange(): Promise<boolean> {
		for (const id of this.editingFileIds) {
			const guard = this.fileGuards.get(id)
			if (guard && !(await guard.check())) return false
		}
		return true
	}

	async confirmFileChanges(ids: readonly string[]): Promise<boolean> {
		const paths = ids
			.map((id) =>
				this.getPath(id)
					.map((file) => file.name)
					.join("/"),
			)
			.filter(Boolean)
		for (const [id, guard] of this.fileGuards) {
			if (
				(ids.includes(id) || paths.some((path) => guard.path.startsWith(path + "/"))) &&
				!(await guard.check())
			)
				return false
		}
		return true
	}

	trackUpload(id: string, cancel: () => Promise<void>): void {
		this.uploadCancellations.set(id, cancel)
	}
	finishUpload(id: string): void {
		this.uploadCancellations.delete(id)
	}

	private activateIdentity(identity: string | null): void {
		if (identity === this.identityKey) return
		for (const request of this.requests.values()) request.controller.abort()
		for (const cancel of this.uploadCancellations.values()) void cancel().catch(() => undefined)
		this.uploadCancellations.clear()
		this.fileGuards.clear()
		this.editingFileIds.clear()
		this.requests.clear()
		this.files.clear()
		this.directories.clear()
		this.rootId = null
		this.identityKey = identity
	}
}

export default new UserFilesStore()
