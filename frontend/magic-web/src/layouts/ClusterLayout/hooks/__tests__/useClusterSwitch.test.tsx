import { act, cleanup, render, renderHook } from "@testing-library/react"
import { useEffect, type PropsWithChildren } from "react"
import { MemoryRouter, Route, Routes } from "react-router"
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
	clustersConfig: { "mock-target-cluster": {} } as Record<string, object>,
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

vi.mock("@/models/config", () => ({
	configStore: mocks.configStore,
}))

vi.mock("@/models/config/hooks", () => ({
	useClusterConfig: () => ({
		clustersConfig: mocks.clustersConfig,
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

vi.mock("@/routes/helpers", () => ({
	defaultClusterCode: "global",
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
	whiteListRoutes: ["/:clusterCode/preview"],
}))

vi.mock("@/providers/ClusterProvider", () => ({
	useClusterCode: () => ({ setClusterCode: vi.fn() }),
}))

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock("../../ClusterLoginFailed", () => ({
	default: ({ children }: PropsWithChildren) => <div data-testid="login-failed">{children}</div>,
}))

vi.mock("@/components/shadcn-ui/button", () => ({
	Button: ({ children }: PropsWithChildren) => <button>{children}</button>,
}))

vi.mock("@/components/shadcn-ui/spinner", () => ({
	Spinner: () => <span />,
}))

vi.mock("@/broadcastChannel/eventFactory/accountContextRefresh", () => ({
	refreshAccountContextPage: mocks.refreshAccountContextPage,
}))

import { useClusterSwitch } from "../useClusterSwitch"
import { ClusterLayoutBase } from "../../ClusterLayoutBase"

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
		mocks.clustersConfig = { "mock-target-cluster": {} }
		mocks.userStore.account.accounts = [{ ...account }]
		mocks.accountSwitch.mockResolvedValue(undefined)
		mocks.getPrivateConfigure.mockResolvedValue({})
		mocks.ensureClusterConfigReady.mockResolvedValue(undefined)
	})

	afterEach(() => {
		cleanup()
		window.history.replaceState(null, "", "/")
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
		expect(result.current).toMatchObject({ isInitialing: true, loading: false })
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

	// Exercise the real layout and Outlet so state transitions cannot hide a remount.
	function renderLayout(path = "/mock-target-cluster/page") {
		const mounted = vi.fn()
		const unmounted = vi.fn()
		function Child() {
			useEffect(() => {
				mounted()
				return () => unmounted()
			}, [])
			return <div data-testid="child-view" />
		}
		window.history.replaceState(null, "", path)
		const view = render(
			<MemoryRouter initialEntries={[path]}>
				<Routes>
					<Route
						path="/:clusterCode"
						element={<ClusterLayoutBase loginAdapter={{ open: vi.fn() }} />}
					>
						<Route path="*" element={<Child />} />
					</Route>
				</Routes>
			</MemoryRouter>,
		)
		return { ...view, mounted, unmounted }
	}

	it.each(["page", "preview"])(
		"keeps the %s child mounted through bootstrap and pending config synchronization",
		async (page) => {
			appStore.setIsInitialing(true)
			mocks.userStore.account.accounts = []
			mocks.clustersConfig = {}
			const configTask = deferred()
			mocks.ensureClusterConfigReady.mockReturnValue(configTask.promise)
			const view = renderLayout(`/mock-target-cluster/${page}`)
			expect(view.queryByTestId("child-view")).not.toBeNull()
			await advance()
			expect(mocks.getPrivateConfigure).not.toHaveBeenCalled()
			expect(mocks.ensureClusterConfigReady).not.toHaveBeenCalled()
			expect(mocks.accountSwitch).not.toHaveBeenCalled()

			act(() => {
				// For the ordinary route, bootstrap restores the requested cluster.
				// The allowlisted route must stay mounted even with a different cluster.
				if (page === "page")
					mocks.configStore.cluster.clusterCode = "mock-target-cluster"
				appStore.setIsInitialing(false)
			})
			await advance()
			expect(mocks.ensureClusterConfigReady).toHaveBeenCalled()
			expect(view.queryByTestId("child-view")).not.toBeNull()
			expect(view.queryByTestId("cluster-layout-loading")).toBeNull()
			expect(view.queryByTestId("login-failed")).toBeNull()
			expect(view.mounted).toHaveBeenCalledTimes(1)
			expect(view.unmounted).not.toHaveBeenCalled()

			await act(async () => configTask.resolve())
			expect(view.mounted).toHaveBeenCalledTimes(1)
			expect(view.unmounted).not.toHaveBeenCalled()
		},
	)

	it("blocks the child only when a real switch remains after bootstrap", async () => {
		appStore.setIsInitialing(true)
		const switchTask = deferred()
		mocks.accountSwitch.mockReturnValue(switchTask.promise)
		const view = renderLayout()
		expect(view.queryByTestId("child-view")).not.toBeNull()
		act(() => appStore.setIsInitialing(false))
		await advance()
		expect(view.queryByTestId("child-view")).toBeNull()
		expect(view.queryByTestId("cluster-layout-loading")).not.toBeNull()
		expect(mocks.accountSwitch).toHaveBeenCalledTimes(1)
		await act(async () => switchTask.resolve())
		expect(view.queryByTestId("child-view")).not.toBeNull()
		expect(mocks.refreshAccountContextPage).toHaveBeenCalledTimes(1)
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
