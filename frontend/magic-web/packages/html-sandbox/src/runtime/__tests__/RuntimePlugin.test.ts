import { describe, expect, it, vi } from "vitest"

describe("RuntimePlugin", () => {
	it("installs registered plugins and continues after a plugin throws", async () => {
		vi.resetModules()
		const { installRegisteredRuntimePlugins, registerRuntimePlugins } =
			await import("../RuntimePlugin")

		const installed: string[] = []

		class FirstPlugin {
			install(): void {
				installed.push("first")
			}
		}

		class FailingPlugin {
			install(): void {
				throw new Error("install failed")
			}
		}

		class LastPlugin {
			install(): void {
				installed.push("last")
			}
		}

		registerRuntimePlugins([FirstPlugin, FailingPlugin, LastPlugin])

		expect(() => installRegisteredRuntimePlugins()).not.toThrow()
		expect(installed).toEqual(["first", "last"])
	})

	it("deduplicates plugin classes during registration", async () => {
		vi.resetModules()
		const { installRegisteredRuntimePlugins, registerRuntimePlugins } =
			await import("../RuntimePlugin")

		const install = vi.fn()

		class Plugin {
			install(): void {
				install()
			}
		}

		registerRuntimePlugins([Plugin, Plugin])
		installRegisteredRuntimePlugins()

		expect(install).toHaveBeenCalledOnce()
	})

	it("installs plugins registered after runtime startup immediately", async () => {
		vi.resetModules()
		const { installRegisteredRuntimePlugins, registerRuntimePlugins } =
			await import("../RuntimePlugin")

		const install = vi.fn()

		installRegisteredRuntimePlugins()

		class DynamicPlugin {
			static pluginId = "dynamic-plugin"

			install(): void {
				install()
			}
		}

		registerRuntimePlugins([DynamicPlugin])

		expect(install).toHaveBeenCalledOnce()
	})

	it("does not reinstall late plugins when runtime startup is rebound", async () => {
		vi.resetModules()
		const { installRegisteredRuntimePlugins, registerRuntimePlugins } =
			await import("../RuntimePlugin")

		const install = vi.fn()

		installRegisteredRuntimePlugins()

		class FirstDocumentPlugin {
			static pluginId = "document-plugin"

			install(): void {
				install("first")
			}
		}

		class NextDocumentPlugin {
			static pluginId = "document-plugin"

			install(): void {
				install("next")
			}
		}

		registerRuntimePlugins([FirstDocumentPlugin])
		installRegisteredRuntimePlugins()
		registerRuntimePlugins([NextDocumentPlugin])

		expect(install.mock.calls).toEqual([["first"], ["next"]])
	})
})
