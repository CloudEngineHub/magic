import { beforeEach, describe, expect, it, vi } from "vitest"
import type { User } from "@/types/user"

enum MockRouteName {
	Login = "Login",
	Chat = "Chat",
}

const mocks = vi.hoisted(() => {
	const localStorageStub = {
		getItem: vi.fn(() => null),
		setItem: vi.fn(),
		removeItem: vi.fn(),
		clear: vi.fn(),
		key: vi.fn(() => null),
		length: 0,
	}

	Object.defineProperty(globalThis, "localStorage", {
		configurable: true,
		value: localStorageStub,
	})

	const mockState = {
		refreshAccountContextPage: vi.fn(),
		switchAccount: vi.fn(),
		historyReplace: vi.fn(),
		routesMatch: vi.fn(),
		convertSearchParams: vi.fn(() => ({})),
		getRoutePath: vi.fn(({ name }: { name: MockRouteName }) =>
			name === MockRouteName.Login ? "/login" : "/",
		),
		has: vi.fn(() => true),
		userStore: {
			user: {
				userInfo: null as User.UserInfo | null,
				organizationCode: "",
				authorization: "",
			},
			account: {
				accounts: [] as User.UserAccount[],
				setAccount: vi.fn(),
				getAccountByMagicId: vi.fn(),
				updateAccount: vi.fn(),
			},
		},
	}

	mockState.userStore.account.setAccount.mockImplementation((account: User.UserAccount) => {
		const index = mockState.userStore.account.accounts.findIndex(
			(item) => item.magic_id === account.magic_id,
		)
		if (index === -1) {
			mockState.userStore.account.accounts.push(account)
		} else {
			mockState.userStore.account.accounts[index] = account
		}
	})
	mockState.userStore.account.getAccountByMagicId.mockImplementation((magicId: string) =>
		mockState.userStore.account.accounts.find((item) => item.magic_id === magicId),
	)

	return mockState
})

vi.mock("@/broadcastChannel/eventFactory/accountContextRefresh", () => ({
	refreshAccountContextPage: mocks.refreshAccountContextPage,
}))

vi.mock("antd", () => ({
	message: {
		config: vi.fn(),
	},
	theme: {
		defaultAlgorithm: {},
		darkAlgorithm: {},
	},
	ConfigProvider: ({ children }: { children?: unknown }) => children,
}))

vi.mock("@/models/user", () => ({
	userStore: mocks.userStore,
}))

vi.mock("@/models/user/index", () => ({
	userStore: mocks.userStore,
}))

vi.mock("../index", () => ({
	service: {
		get: vi.fn((name: string) => {
			if (name === "accountService") {
				return {
					switchAccount: mocks.switchAccount,
				}
			}
			throw new Error(`Unexpected service lookup: ${name}`)
		}),
	},
}))

vi.mock("../../index", () => ({
	service: {
		get: vi.fn((name: string) => {
			if (name === "accountService") {
				return {
					switchAccount: mocks.switchAccount,
				}
			}
			throw new Error(`Unexpected service lookup: ${name}`)
		}),
	},
}))

vi.mock("@/routes/history", () => ({
	history: {
		replace: mocks.historyReplace,
		push: vi.fn(),
	},
}))

vi.mock("@/routes/constants", () => ({
	RouteName: {
		Login: "Login",
		Chat: "Chat",
	},
}))

vi.mock("@/routes/history/helpers", () => ({
	convertSearchParams: mocks.convertSearchParams,
	getRoutePath: mocks.getRoutePath,
	routesMatch: mocks.routesMatch,
}))

vi.mock("@/routes/helpers", () => ({
	defaultClusterCode: "global",
}))

vi.mock("@/utils/redirect", () => ({
	getHomeURL: vi.fn(async () => ({ name: MockRouteName.Chat })),
}))

vi.mock("@/services/app/AppService", () => ({
	appService: {
		initUserData: vi.fn(),
	},
}))

vi.mock("@/stores/interface", () => ({
	interfaceStore: {
		setIsSwitchingOrganization: vi.fn(),
	},
}))

vi.mock("lodash-es", async (importOriginal) => {
	const actual = await importOriginal<typeof import("lodash-es")>()
	return {
		...actual,
		cloneDeep: <T>(value: T) => value,
		has: mocks.has,
	}
})

import UserDispatchService from "../UserDispatchService"

/** Creates a synthetic account for account-dispatch tests without real user data. */
function createMockAccount(magicId: string, organizationCode: string): User.UserAccount {
	return {
		magic_id: magicId,
		magic_user_id: `${magicId}-user`,
		nickname: `${magicId}-nickname`,
		organizationCode,
		avatar: "",
		access_token: `${magicId}-token`,
		deployCode: "cluster-a",
		organizations: [],
		teamshareOrganizations: [],
	} as User.UserAccount
}

/** Creates synthetic current user info that differs from the account being added. */
function createMockUserInfo(
	magicId: string,
	userId: string,
	organizationCode: string,
): User.UserInfo {
	return {
		magic_id: magicId,
		user_id: userId,
		organization_code: organizationCode,
	} as User.UserInfo
}

describe("UserDispatchService.addAccount", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		window.history.replaceState({}, "", "/global/super/workspace/mock-workspace")
		mocks.userStore.user.userInfo = createMockUserInfo(
			"magic-current",
			"user-current",
			"org-current",
		)
		mocks.userStore.user.organizationCode = "org-current"
		mocks.userStore.user.authorization = "token-current"
		mocks.userStore.account.accounts = [createMockAccount("magic-current", "org-current")]
		mocks.routesMatch.mockReturnValue({
			route: { name: MockRouteName.Chat },
			params: { clusterCode: "global" },
		})
	})

	it("refreshes the page after adding an account switches the active account", async () => {
		const nextAccount = createMockAccount("magic-next", "org-next")

		await UserDispatchService.addAccount({ userAccount: nextAccount })

		expect(mocks.userStore.account.setAccount).toHaveBeenCalledWith(nextAccount)
		expect(mocks.switchAccount).toHaveBeenCalledWith("magic-next", "org-next")
		expect(mocks.refreshAccountContextPage).toHaveBeenCalledTimes(1)
	})
})
