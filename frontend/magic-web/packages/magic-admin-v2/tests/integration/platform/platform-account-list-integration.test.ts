import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

function readSource(filePath: string) {
	return readFileSync(filePath, "utf8")
}

const featureRoot = "enterprise/src/features/platform-account-list"
const pageSource = readSource(`${featureRoot}/platform-account-list-page.tsx`)
const tableSource = readSource(`${featureRoot}/components/account-list-table.tsx`)
const filtersSource = readSource(`${featureRoot}/components/account-list-filters.tsx`)
const apiSource = readSource(`${featureRoot}/api.ts`)
const mutationsSource = readSource(`${featureRoot}/mutations.ts`)
const editionRoutesSource = readSource("enterprise/src/routes/edition.tsx")
const routeAccessSource = readSource("enterprise/src/routes/route-access.ts")
const menuSource = readSource("src/routes/menu.ts")
const permissionsSource = readSource("src/constants/permissions.ts")
const editionConstantsSource = readSource("enterprise/src/api/constants/edition.ts")
const editionApiSource = readSource("enterprise/src/api/edition.ts")

describe("platform account list integration", () => {
	it("debounces keyword, phone and email through the shared list hook", () => {
		assert.match(pageSource, /useListQueryParams/)
		assert.match(pageSource, /debounceFields: \["keyword", "phone", "email"\]/)
		assert.match(filtersSource, /<ListFilterPanel/u)
		assert.match(filtersSource, /onValueChange=\{\(keyword\) => onChange\(\{ keyword \}\)\}/)
		assert.match(filtersSource, /onValueChange=\{\(phone\) => onChange\(\{ phone \}\)\}/)
		assert.match(filtersSource, /onValueChange=\{\(email\) => onChange\(\{ email \}\)\}/)
		assert.equal(pageSource.includes("window.setTimeout"), false)
	})

	it("wires single and batch selection into the shared data table", () => {
		assert.match(pageSource, /const \[rowSelection, setRowSelection\] = useState<RowSelectionState>/)
		assert.match(pageSource, /<AccountBatchActions/)
		assert.match(pageSource, /pruneRowSelection/)
		assert.match(tableSource, /enableRowSelection/)
		assert.match(tableSource, /onRowSelectionChange=\{onRowSelectionChange\}/)
		assert.match(tableSource, /data-testid="account-list-select-all"/)
		assert.match(tableSource, /data-testid="account-list-select-row"/)
		// 账号主键是 magic_id，勾选与批量操作都以它为准。
		assert.match(tableSource, /rowSelection\[account\.magic_id\]/)
	})

	it("keeps the account type out of the filters and always queries human accounts", () => {
		const featureFiltersSource = readSource(`${featureRoot}/filters.ts`)
		const detailSource = readSource(
			`${featureRoot}/components/account-detail-dialog.tsx`,
		)

		assert.equal(filtersSource.includes("account-list-type-trigger"), false)
		assert.equal(featureFiltersSource.includes("accountType:"), false)
		assert.match(featureFiltersSource, /account_type: accountType\.human/)
		// 详情弹窗也不再展示账号类型。
		assert.equal(detailSource.includes("account_type"), false)
	})

	it("renders exactly one status action per row", () => {
		assert.match(tableSource, /const statusAction = getAccountStatusAction\(row\.original\)/)
		assert.match(tableSource, /\{statusAction === "enable" \?/)
		// 旧实现同时渲染「禁用」和「解封」再互相置灰，这里防止回退。
		assert.equal(tableSource.includes("disabled={!canEdit || !operable"), false)
	})

	it("uses the documented official account endpoints only", () => {
		assert.match(
			editionConstantsSource,
			/platformAccountList: "\/api\/v1\/official\/admin\/accounts"/,
		)
		assert.match(
			editionConstantsSource,
			/platformAccountDetail: "\/api\/v1\/official\/admin\/accounts\/\$\{magicId\}"/,
		)
		assert.match(
			editionConstantsSource,
			/platformAccountStatusPreview: "\/api\/v1\/official\/admin\/accounts\/\$\{magicId\}\/status-preview"/,
		)
		assert.match(
			editionConstantsSource,
			/platformAccountDisable: "\/api\/v1\/official\/admin\/accounts\/\$\{magicId\}\/disable"/,
		)
		assert.match(
			editionConstantsSource,
			/platformAccountEnable: "\/api\/v1\/official\/admin\/accounts\/\$\{magicId\}\/enable"/,
		)
		// 写操作必须带 confirm，理由只写日志。
		assert.match(apiSource, /confirm: true/)
		assert.match(apiSource, /reason: params\.reason/)
		// 接口没有批量端点，批量由前端逐账号调用聚合。
		assert.equal(apiSource.includes("account_ids"), false)
		assert.match(mutationsSource, /mapWithConcurrency/)
		assert.match(mutationsSource, /magic_id: account\.magic_id/)
	})

	it("registers the page route, menu entry, permission and API factory", () => {
		assert.match(editionRoutesSource, /RouteName\.PlatformAccountList/)
		assert.match(editionRoutesSource, /RoutePath\.PlatformAccountList/)
		assert.match(editionRoutesSource, /platformAccountListAccess/)
		assert.match(routeAccessSource, /export const platformAccountListAccess/)
		assert.match(routeAccessSource, /PERMISSION_KEY_MAP\.ACCOUNT_MANAGEMENT_QUERY/)
		assert.match(routeAccessSource, /PERMISSION_KEY_MAP\.ACCOUNT_MANAGEMENT_EDIT/)
		assert.match(
			permissionsSource,
			/ACCOUNT_MANAGEMENT_QUERY: "platform\.organization\.account_management\.query"/,
		)
		assert.match(
			permissionsSource,
			/ACCOUNT_MANAGEMENT_EDIT: "platform\.organization\.account_management\.edit"/,
		)
		assert.match(menuSource, /\[RouteName\.PlatformAccountList\]: UserLock/)
		assert.match(editionApiSource, /createPlatformAccountListApi/)
	})

	it("keeps zh_CN and en_US account copy in sync", () => {
		const zh = JSON.parse(readSource("enterprise/src/i18n/messages/edition/zh_CN/accountList.json"))
		const en = JSON.parse(readSource("enterprise/src/i18n/messages/edition/en_US/accountList.json"))
		assert.deepEqual(Object.keys(zh).sort(), Object.keys(en).sort())

		for (const language of ["zh_CN", "en_US"]) {
			const nav = JSON.parse(
				readSource(`enterprise/src/i18n/messages/edition/${language}/nav.json`),
			)
			assert.equal(typeof nav["item.accountList"], "string", language)
			assert.equal(typeof nav["desc.accountList"], "string", language)

			const index = readSource(`enterprise/src/i18n/messages/edition/${language}/index.ts`)
			assert.match(index, /accountList/, language)
		}
	})
})
