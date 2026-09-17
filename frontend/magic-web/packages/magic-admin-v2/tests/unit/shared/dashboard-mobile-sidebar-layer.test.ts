import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

const source = readFileSync("src/layouts/dashboard-layout.tsx", "utf8")
const accountControlsSource = readFileSync(
	"src/layouts/components/shell-account-controls.tsx",
	"utf8",
)
const languageSwitcherSource = readFileSync("src/components/language-switcher.tsx", "utf8")

describe("dashboard mobile sidebar layering", () => {
	it("keeps the mobile navigation above the sticky header", () => {
		assert.match(source, /fixed inset-0 z-\[60\] isolate lg:hidden/)
		assert.match(source, /sticky top-0 z-50/)
	})

	it("keeps the navigation panel above its own backdrop", () => {
		assert.match(source, /absolute inset-0 z-0 bg-black\/50/)
		assert.match(source, /relative z-10 flex h-full w-\[18rem\]/)
	})

	it("animates both entering and exiting instead of unmounting immediately", () => {
		assert.match(source, /const \[isMobileSidebarMounted, setIsMobileSidebarMounted\]/)
		assert.match(source, /const \[isMobileSidebarEntered, setIsMobileSidebarEntered\]/)
		assert.match(source, /requestAnimationFrame\(\(\) => setIsMobileSidebarEntered\(true\)\)/)
		assert.match(source, /setIsMobileSidebarMounted\(false\), 300\)/)
		assert.match(source, /transition-opacity duration-300/)
		assert.match(source, /transition-transform duration-300/)
		assert.match(source, /translate-x-0.*-translate-x-full/s)
	})

	it("keeps organization switching available and account actions compact on mobile", () => {
		assert.match(
			accountControlsSource,
			/className="flex h-9 w-9[^"\n]*sm:w-auto[^"\n]*sm:max-w-\[260px\]/,
		)
		assert.match(accountControlsSource, /hidden min-w-0 max-w-\[188px\][^"\n]*sm:block/)
		assert.match(languageSwitcherSource, /className="inline-flex h-9 w-9[^"\n]*sm:w-auto/)
		assert.match(languageSwitcherSource, /className="hidden sm:inline"/)
		assert.match(languageSwitcherSource, /options\.find\([^\n]+\)\?\.label/)
	})
})
