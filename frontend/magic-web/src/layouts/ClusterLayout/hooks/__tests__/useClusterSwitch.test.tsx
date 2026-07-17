import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
	accountSwitch: vi.fn(),
	ensureClusterConfigReady: vi.fn(),
	getPrivateConfigure: vi.fn(),
	refreshAccountContextPage: vi.fn(),
	historyReplace: vi.fn(),
	routesMatch: vi.fn(),
	userStore: {
		account: {
			accounts: [
				{
					deployCode: "mock-target-cluster",
					magic_id: "mock-magic-id",
					magic_user_id: "mock-user-id",
					organizationCode: "mock-org-code",
				},
			],
		},
	},
	configStore: {
		cluster: {
			clusterCode: "mock-current-cluster",
			clusterConfig: {
				"mock-target-cluster": {},
			},
		},
	},
}))

vi.mock("react-router", () => ({
	matchPath: vi.fn(() => false),
}))

vi.mock("@/models/config", () => ({
	configStore: mocks.configStore,
}))

vi.mock("@/models/config/hooks", () => ({
	useClusterConfig: () => ({
		clustersConfig: {
			"mock-target-cluster": {},
		},
	}),
}))

vi.mock("@/models/user", () => ({
	userStore: mocks.userStore,
}))

vi.mock("@/stores/authentication", () => ({
	useAccount: () => ({
		accountSwitch: mocks.accountSwitch,
	}),
}))

vi.mock("@/services", () => ({
	service: {
		get: () => ({
			setClusterCode: vi.fn(),
		}),
	},
}))

vi.mock("@/services/config/cluster-config-loader", () => ({
	ensureClusterConfigReady: mocks.ensureClusterConfigReady,
}))

vi.mock("@/apis", () => ({
	CommonApi: {
		getPrivateConfigure: mocks.getPrivateConfigure,
	},
}))

vi.mock("@/routes/history/helpers", () => ({
	convertSearchParams: vi.fn(() => ({})),
	routesMatch: mocks.routesMatch,
}))

vi.mock("@/routes", () => ({
	history: {
		replace: mocks.historyReplace,
	},
}))

vi.mock("@/routes/constants", () => ({
	RouteName: {
		Super: "Super",
	},
}))

vi.mock("@/routes/const/whiteRoutes", () => ({
	whiteListRoutes: [],
}))

vi.mock("@/broadcastChannel/eventFactory/accountContextRefresh", () => ({
	refreshAccountContextPage: mocks.refreshAccountContextPage,
}))

import { useClusterSwitch } from "../useClusterSwitch"

describe("useClusterSwitch", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		vi.useFakeTimers()
		mocks.getPrivateConfigure.mockResolvedValue({})
		mocks.ensureClusterConfigReady.mockResolvedValue(undefined)
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	it("自动切换到匹配账号成功后刷新页面", async () => {
		let resolveSwitch: (() => void) | undefined
		mocks.accountSwitch.mockReturnValueOnce(
			new Promise<void>((resolve) => {
				resolveSwitch = resolve
			}),
		)

		renderHook(() => useClusterSwitch({ targetClusterCode: "mock-target-cluster" }))

		await act(async () => {
			await vi.advanceTimersByTimeAsync(60)
		})
		await act(async () => {
			await Promise.resolve()
		})

		expect(mocks.accountSwitch).toHaveBeenCalledWith(
			"mock-magic-id",
			"mock-user-id",
			"mock-org-code",
		)
		expect(mocks.refreshAccountContextPage).not.toHaveBeenCalled()

		await act(async () => {
			resolveSwitch?.()
		})
		await act(async () => {
			await Promise.resolve()
		})

		expect(mocks.refreshAccountContextPage).toHaveBeenCalledTimes(1)
	})
})
