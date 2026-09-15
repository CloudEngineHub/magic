import { act, render, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { observable, runInAction } from "mobx"
import { observer } from "mobx-react-lite"
import { appStore } from "@/stores/app"

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
	const account = { ...mocks.userStore.account.accounts[0] }
	const advance = () =>
		act(async () => {
			await vi.advanceTimersByTimeAsync(60)
		})
	function deferred() {
		let resolve!: () => void
		let reject!: (error: Error) => void
		const promise = new Promise<void>((res, rej) => {
			resolve = res
			reject = rej
		})
		return { promise, resolve, reject }
	}
	beforeEach(() => {
		vi.resetAllMocks()
		vi.useFakeTimers()
		appStore.setIsInitialing(false)
		mocks.configStore.cluster.clusterCode = "mock-current-cluster"
		mocks.userStore.account.accounts = [{ ...account }]
		mocks.accountSwitch.mockResolvedValue(undefined)
		mocks.getPrivateConfigure.mockResolvedValue({})
		mocks.ensureClusterConfigReady.mockResolvedValue(undefined)
	})

	afterEach(() => {
		appStore.setIsInitialing(false)
		vi.restoreAllMocks()
		vi.useRealTimers()
	})

	it("自动切换到匹配账号成功后刷新页面", async () => {
		let resolveSwitch: (() => void) | undefined
		mocks.accountSwitch.mockReturnValueOnce(
			new Promise<void>((resolve) => {
				resolveSwitch = resolve
			}),
		)

		const { result } = renderHook(() =>
			useClusterSwitch({ targetClusterCode: "mock-target-cluster" }),
		)

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
		expect(result.current.isSameCluster).toBe(false)
		expect(result.current.loading).toBe(true)

		await act(async () => {
			resolveSwitch?.()
		})
		await act(async () => {
			await Promise.resolve()
		})

		expect(mocks.refreshAccountContextPage).toHaveBeenCalledTimes(1)
	})

	it("waits for bootstrap before deciding whether the restored account exists", async () => {
		appStore.setIsInitialing(true)
		mocks.userStore.account.accounts = []
		const { result, rerender } = renderHook(() =>
			useClusterSwitch({ targetClusterCode: "mock-target-cluster" }),
		)
		await advance()
		expect(result.current.loading).toBe(true)
		expect(mocks.getPrivateConfigure).not.toHaveBeenCalled()
		act(() => {
			mocks.userStore.account.accounts.push(account)
			appStore.setIsInitialing(false)
			rerender()
		})
		await advance()
		expect(result.current.isSameCluster).toBe(true)
		expect(mocks.accountSwitch).toHaveBeenCalledTimes(1)
	})

	it("shows the login gate when bootstrap finishes without a matching account", async () => {
		appStore.setIsInitialing(true)
		mocks.userStore.account.accounts = []
		const { result, rerender } = renderHook(() =>
			useClusterSwitch({ targetClusterCode: "mock-target-cluster" }),
		)
		act(() => {
			appStore.setIsInitialing(false)
			rerender()
		})
		await advance()
		expect(result.current).toMatchObject({ loading: false, isSameCluster: false })
	})

	it("reacts to an in-place MobX account insertion after the first rejection", async () => {
		mocks.userStore.account.accounts = observable.array([])
		let result!: ReturnType<typeof useClusterSwitch>
		const Probe = observer(() => {
			result = useClusterSwitch({ targetClusterCode: "mock-target-cluster" })
			return null
		})
		render(<Probe />)
		await advance()
		expect(result.isSameCluster).toBe(false)
		act(() => {
			runInAction(() => mocks.userStore.account.accounts.push(account))
		})
		await advance()
		expect(result.isSameCluster).toBe(true)
		expect(mocks.accountSwitch).toHaveBeenCalledTimes(1)
	})

	it("recovers when the active cluster becomes the target after a rejection", async () => {
		mocks.userStore.account.accounts = []
		const { result, rerender } = renderHook(() =>
			useClusterSwitch({ targetClusterCode: "mock-target-cluster" }),
		)
		await advance()
		expect(result.current.isSameCluster).toBe(false)
		act(() => {
			mocks.configStore.cluster.clusterCode = "mock-target-cluster"
			rerender()
		})
		await advance()
		expect(result.current).toMatchObject({ loading: false, isSameCluster: true })
		expect(mocks.accountSwitch).not.toHaveBeenCalled()
	})

	it("keeps waiting for one switch when the switch updates the active cluster", async () => {
		const switchTask = deferred()
		mocks.accountSwitch.mockReturnValueOnce(switchTask.promise)
		const { result, rerender } = renderHook(() =>
			useClusterSwitch({ targetClusterCode: "mock-target-cluster" }),
		)
		await advance()
		act(() => {
			mocks.configStore.cluster.clusterCode = "mock-target-cluster"
			rerender()
		})
		await advance()
		expect(result.current).toMatchObject({ loading: true, isSameCluster: false })
		expect(mocks.accountSwitch).toHaveBeenCalledTimes(1)
		await act(async () => {
			switchTask.resolve()
		})
		expect(result.current).toMatchObject({ loading: false, isSameCluster: true })
		expect(mocks.refreshAccountContextPage).toHaveBeenCalledTimes(1)
	})

	it("does not allow entry when account switching fails", async () => {
		vi.spyOn(console, "error").mockImplementation(() => undefined)
		mocks.accountSwitch.mockRejectedValueOnce(new Error("switch failed"))
		const { result } = renderHook(() =>
			useClusterSwitch({ targetClusterCode: "mock-target-cluster" }),
		)
		await advance()
		expect(result.current).toMatchObject({ loading: false, isSameCluster: false })
		expect(mocks.refreshAccountContextPage).not.toHaveBeenCalled()
	})

	it("ignores completion from a switch for a previous target", async () => {
		const switchTask = deferred()
		mocks.accountSwitch.mockReturnValueOnce(switchTask.promise)
		const { result, rerender } = renderHook(
			({ target }) => useClusterSwitch({ targetClusterCode: target }),
			{
				initialProps: { target: "mock-target-cluster" },
			},
		)
		await advance()
		rerender({ target: "other-cluster" })
		await advance()
		await act(async () => {
			switchTask.resolve()
		})
		expect(result.current).toMatchObject({ loading: false, isSameCluster: false })
		expect(mocks.refreshAccountContextPage).not.toHaveBeenCalled()
	})

	it("does not refresh after unmounting during a switch", async () => {
		const switchTask = deferred()
		mocks.accountSwitch.mockReturnValueOnce(switchTask.promise)
		const { unmount } = renderHook(() =>
			useClusterSwitch({ targetClusterCode: "mock-target-cluster" }),
		)
		await advance()
		unmount()
		await act(async () => {
			switchTask.resolve()
		})
		expect(mocks.refreshAccountContextPage).not.toHaveBeenCalled()
	})

	it("preserves admission for an already active cluster with no cached account", async () => {
		mocks.configStore.cluster.clusterCode = "mock-target-cluster"
		mocks.userStore.account.accounts = []
		const { result } = renderHook(() =>
			useClusterSwitch({ targetClusterCode: "mock-target-cluster" }),
		)
		await advance()
		expect(result.current).toMatchObject({ loading: false, isSameCluster: true })
		expect(mocks.accountSwitch).not.toHaveBeenCalled()
	})

	it("ignores a stale config request after the target changes", async () => {
		const configTask = deferred()
		mocks.getPrivateConfigure.mockReturnValueOnce(configTask.promise)
		const { result, rerender } = renderHook(
			({ target }) => useClusterSwitch({ targetClusterCode: target }),
			{
				initialProps: { target: "mock-target-cluster" },
			},
		)
		await advance()
		rerender({ target: "other-cluster" })
		await advance()
		await act(async () => {
			configTask.resolve()
		})
		expect(result.current).toMatchObject({ loading: false, isSameCluster: false })
		expect(mocks.accountSwitch).not.toHaveBeenCalled()
	})
})
