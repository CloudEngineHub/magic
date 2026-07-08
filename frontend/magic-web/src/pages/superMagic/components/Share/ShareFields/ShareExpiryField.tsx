import { memo } from "react"
import { useTranslation } from "react-i18next"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/shadcn-ui/select"
import type { ShareExpiryFieldProps } from "./types"
import { EXPIRY_OPTIONS } from "./types"

export default memo(function ShareExpiryField(props: ShareExpiryFieldProps) {
	const { value, onChange } = props
	const { t } = useTranslation("super")

	const currentValue = value === null ? "permanent" : String(value)

	return (
		<div className="flex flex-col gap-2" data-testid="share-expiry-field">
			<label className="text-sm font-medium leading-none text-foreground" data-testid="share-expiry-field-label">
				{t("share.shareExpiry")}
			</label>
			<Select
				value={currentValue}
				onValueChange={(val) => {
					onChange(val === "permanent" ? null : Number(val))
				}}
				data-testid="on-change"
			>
				<SelectTrigger className="h-9 w-full" data-testid="share-expiry-trigger">
					<SelectValue placeholder={t("share.expiryPermanent")} />
				</SelectTrigger>
				<SelectContent className="z-[1500]" style={{ zIndex: 1500 }} data-testid="share-expiry-content">
					{EXPIRY_OPTIONS.map((option) => {
						const optionValue =
							option.value === null ? "permanent" : String(option.value)
						return (
							<SelectItem key={optionValue} value={optionValue} data-testid="share-expiry-option">
								{t(option.label)}
							</SelectItem>
						)
					})}
				</SelectContent>
			</Select>
		</div>
	)
})
