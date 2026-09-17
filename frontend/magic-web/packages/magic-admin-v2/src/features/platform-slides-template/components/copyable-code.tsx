import { Check, Copy } from "lucide-react"
import { useRef, useState } from "react"
import { useUnmount } from "ahooks"
import { useTranslation } from "react-i18next"
import { clipboard } from "@magic-admin-v2/utils/clipboard-helpers"

export function CopyableCode({ value }: { value: string }) {
	const { t } = useTranslation()
	const [copied, setCopied] = useState(false)
	const resetTimerRef = useRef<number | null>(null)

	useUnmount(() => {
		if (resetTimerRef.current !== null) {
			window.clearTimeout(resetTimerRef.current)
		}
	})

	async function handleCopy() {
		try {
			await clipboard.writeText(value)
		} catch {
			return
		}

		setCopied(true)
		if (resetTimerRef.current !== null) {
			window.clearTimeout(resetTimerRef.current)
		}
		resetTimerRef.current = window.setTimeout(() => {
			setCopied(false)
			resetTimerRef.current = null
		}, 1200)
	}

	return (
		<button
			aria-label={t("slidesTemplate.aria.copyCode", { code: value })}
			className="group inline-flex max-w-full items-center gap-1 text-left font-mono text-xs text-muted-foreground hover:text-foreground"
			onClick={() => void handleCopy()}
			title={value}
			type="button"
		>
			<span className="truncate">{value}</span>
			{copied ? (
				<Check className="size-3.5 text-emerald-600" />
			) : (
				<Copy className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
			)}
		</button>
	)
}
