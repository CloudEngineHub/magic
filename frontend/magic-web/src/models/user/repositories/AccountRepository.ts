import { GlobalBaseRepository } from "@/models/repository/GlobalBaseRepository"
import type { User } from "@/types/user"
import { Storage } from "../../repository/Cache"
import { logger } from "../../repository/logger"
import type { UpdateSpec } from "dexie"

export class AccountRepository extends GlobalBaseRepository<User.UserAccount> {
	static tableName = "account"

	constructor() {
		super(AccountRepository.tableName)
	}

	// 查询单个账号、移除单个帐号
	async getAllAccounts(): Promise<Array<User.UserAccount>> {
		try {
			return await this.getAll()
		} catch (error) {
			logger.error({
				eventKey: "get_all_accounts_failed",
				errorKind: "unknown",
				error: error,
				message: "getAllAccountsError",
				context: { tableName: AccountRepository.tableName },
			})
			return Storage.getAll<User.UserAccount>(`${AccountRepository.tableName}:`)
		}
	}

	async addAccount(account: User.UserAccount) {
		try {
			await this.put(account)
		} catch (error) {
			logger.error({
				eventKey: "add_account_failed",
				errorKind: "unknown",
				error: error,
				message: "Add account failed",
				context: { tableName: AccountRepository.tableName },
			})
			return Storage.set(`${AccountRepository.tableName}:${account?.magic_id ?? ""}`, account)
		}
	}

	async deleteAccount(magicId: string) {
		try {
			await this.delete(magicId)
		} catch (error) {
			logger.error({
				eventKey: "delete_account_failed",
				errorKind: "unknown",
				error: error,
				message: "Delete account failed",
				context: { tableName: AccountRepository.tableName },
			})
			return Storage.remove(`${AccountRepository.tableName}:${magicId}`)
		}
	}

	async updateAccount(magicId: string, account: UpdateSpec<User.UserAccount>) {
		try {
			await this.update(magicId, account)
		} catch (error) {
			logger.error({
				eventKey: "update_account_failed",
				errorKind: "unknown",
				error: error,
				message: "Update account failed",
				context: { tableName: AccountRepository.tableName },
			})
			const cache = Storage.get(`${AccountRepository.tableName}:${magicId}`)
			return Storage.set(`${AccountRepository.tableName}:${magicId}`, {
				...cache,
				...account,
			})
		}
	}

	async clearAccount() {
		try {
			await this.clear()
		} catch (error) {
			logger.error({
				eventKey: "clear_accounts_failed",
				errorKind: "unknown",
				error: error,
				message: "Clear accounts failed",
				context: { tableName: AccountRepository.tableName },
			})
			return Storage.clearById(`${AccountRepository.tableName}:`)
		}
	}
}
