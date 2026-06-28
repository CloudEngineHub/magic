import { memo } from "react"
import { useTranslation } from "react-i18next"
import LanguageSwitch from "@/components/settings/LanguageSwitch"
import FollowUpSuggestionItems from "@/components/settings/FollowUpSuggestionItems"
import SettingItem from "@/components/settings/SettingItem"
import BrowserNotificationItem from "@/components/settings/BrowserNotificationItem"
function PreferencesPage() {
	const { t } = useTranslation("interface")

	return (
		<div data-testid="account-setting-preferences-page">
			<SettingItem
				title={t("setting.language")}
				description={t("setting.languageDescription")}
				extra={<LanguageSwitch />}
				adaptMobile
			/>
			<FollowUpSuggestionItems />
			<BrowserNotificationItem />
		</div>
	)
}

export default memo(PreferencesPage)
