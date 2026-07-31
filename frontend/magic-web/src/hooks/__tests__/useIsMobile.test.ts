import { renderHook, waitFor } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { useIsMobile } from "../useIsMobile"
import { interfaceStore } from "@/stores/interface"

const mocks = vi.hoisted(() => ({
	interfaceIsMobile: false,
	setInterfaceIsMobile: vi.fn((value: boolean) => {
		mocks.interfaceIsMobile = value
	}),
	isMobileDevice: false,
	widgetContext: {
		embedContext: null as { instanceId: string; hostOrigin: string } | null,
		config: {} as {
			responsive?: { mobileDetection?: "viewport" | "device-and-viewport" }
		},
	},
}))

vi.mock("@/stores/interface", () => ({
	interfaceStore: {
		get isMobile() {
			return mocks.interfaceIsMobile
		},
		setIsMobile: mocks.setInterfaceIsMobile,
	},
}))

// Mock ahooks useResponsive
vi.mock("ahooks", () => ({
	useResponsive: vi.fn(),
}))

vi.mock("@/utils/devices", () => ({
	get isMobile() {
		return mocks.isMobileDevice
	},
}))

vi.mock("@/providers/MagicWidgetProvider/context", () => ({
	useMagicWidgetConfig: () => mocks.widgetContext,
}))

import { useResponsive } from "ahooks"

describe("useIsMobile", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mocks.isMobileDevice = false
		mocks.interfaceIsMobile = false
		mocks.widgetContext = {
			embedContext: null,
			config: {},
		}
		// Reset the store state
		interfaceStore.setIsMobile(false)
	})

	it("should return true when screen is smaller than md breakpoint", async () => {
		// Mock md as false (mobile)
		vi.mocked(useResponsive).mockReturnValue({ md: false })

		const { result } = renderHook(() => useIsMobile())

		expect(result.current).toBe(true)

		// Wait for effect to run
		await waitFor(() => {
			expect(interfaceStore.isMobile).toBe(true)
		})
	})

	it("should return false when screen is larger than md breakpoint", async () => {
		// Mock md as true (desktop)
		vi.mocked(useResponsive).mockReturnValue({ md: true })

		const { result } = renderHook(() => useIsMobile())

		expect(result.current).toBe(false)

		// Wait for effect to run
		await waitFor(() => {
			expect(interfaceStore.isMobile).toBe(false)
		})
	})

	it("should use device-and-viewport detection for Widget embeds by default", () => {
		vi.mocked(useResponsive).mockReturnValue({ md: false })
		mocks.isMobileDevice = false
		mocks.widgetContext = {
			embedContext: {
				instanceId: "widget-mock-device-aware-default",
				hostOrigin: "https://widget-host.example.invalid",
			},
			config: {},
		}

		const { result } = renderHook(() => useIsMobile())

		expect(result.current).toBe(false)
	})

	it("should allow Widget embeds to opt into viewport-only detection", () => {
		vi.mocked(useResponsive).mockReturnValue({ md: false })
		mocks.isMobileDevice = false
		mocks.widgetContext = {
			embedContext: {
				instanceId: "widget-mock-viewport-override",
				hostOrigin: "https://widget-host.example.invalid",
			},
			config: { responsive: { mobileDetection: "viewport" } },
		}

		const { result } = renderHook(() => useIsMobile())

		expect(result.current).toBe(true)
	})

	it("should keep narrow desktop devices in desktop semantics when device-aware detection is enabled", () => {
		vi.mocked(useResponsive).mockReturnValue({ md: false })
		mocks.isMobileDevice = false
		mocks.widgetContext = {
			embedContext: {
				instanceId: "widget-mock-device-aware-desktop",
				hostOrigin: "https://widget-host.example.invalid",
			},
			config: { responsive: { mobileDetection: "device-and-viewport" } },
		}

		const { result } = renderHook(() => useIsMobile())

		expect(result.current).toBe(false)
	})

	it("should keep narrow mobile devices in mobile semantics when device-aware detection is enabled", () => {
		vi.mocked(useResponsive).mockReturnValue({ md: false })
		mocks.isMobileDevice = true
		mocks.widgetContext = {
			embedContext: {
				instanceId: "widget-mock-device-aware-mobile",
				hostOrigin: "https://widget-host.example.invalid",
			},
			config: { responsive: { mobileDetection: "device-and-viewport" } },
		}

		const { result } = renderHook(() => useIsMobile())

		expect(result.current).toBe(true)
	})

	it("should require a small viewport even when the device is mobile", () => {
		vi.mocked(useResponsive).mockReturnValue({ md: true })
		mocks.isMobileDevice = true
		mocks.widgetContext = {
			embedContext: {
				instanceId: "widget-mock-device-aware-wide",
				hostOrigin: "https://widget-host.example.invalid",
			},
			config: { responsive: { mobileDetection: "device-and-viewport" } },
		}

		const { result } = renderHook(() => useIsMobile())

		expect(result.current).toBe(false)
	})

	it("should update interfaceStore when breakpoint changes", async () => {
		// Start with desktop
		const mockUseResponsive = vi.mocked(useResponsive)
		mockUseResponsive.mockReturnValue({ md: true })

		const { rerender } = renderHook(() => useIsMobile())

		await waitFor(() => {
			expect(interfaceStore.isMobile).toBe(false)
		})

		// Change to mobile
		mockUseResponsive.mockReturnValue({ md: false })
		rerender()

		await waitFor(() => {
			expect(interfaceStore.isMobile).toBe(true)
		})
	})

	it("should not trigger MobX strict mode violations", async () => {
		// This test ensures the hook doesn't modify observables during render
		vi.mocked(useResponsive).mockReturnValue({ md: false })

		// If this throws, it means we're modifying observables during render
		expect(() => {
			renderHook(() => useIsMobile())
		}).not.toThrow()

		// Wait for effect to complete
		await waitFor(() => {
			expect(interfaceStore.isMobile).toBe(true)
		})
	})
})
