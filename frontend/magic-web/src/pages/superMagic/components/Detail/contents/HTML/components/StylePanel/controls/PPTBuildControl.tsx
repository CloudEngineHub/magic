import { useEffect, useId, useRef, useState, type RefObject } from "react"
import { observer } from "mobx-react-lite"
import { useTranslation } from "react-i18next"
import { ListOrdered } from "lucide-react"
import { Popover, PopoverTrigger } from "@/components/shadcn-ui/popover"
import { EditorPopoverContent } from "../../EditorFloating"
import { Button } from "@/components/shadcn-ui/button"
import { Input } from "@/components/shadcn-ui/input"
import magicToast from "@/components/base/MagicToaster/utils"
import { collectPPTBuilds, parsePPTBuild } from "@dtyq/html-sandbox/utils/pptBuild"
import type { HTMLEditorV2Ref } from "../../../iframe-bridge/types/props"
import { useSelectedElement } from "../hooks/useSelectedElement"

/** Uses the editor's existing undoable attribute and file-save path. */
export const PPTBuildControl = observer(function PPTBuildControl({
	editorRef,
	disabled,
}: {
	editorRef: RefObject<HTMLEditorV2Ref>
	disabled?: boolean
}) {
	const { t } = useTranslation("super")
	const { selectedElement, updateAttributes } = useSelectedElement(editorRef)
	const raw = selectedElement?.attributes?.dataMagicPptBuild
	const selector = selectedElement?.selector
	const [open, setOpen] = useState(false)
	const [busy, setBusy] = useState(false)
	const [step, setStep] = useState(1)
	const [effect, setEffect] = useState<"appear" | "fade">("fade")
	const generation = useRef(0)
	const id = useId()
	useEffect(() => {
		const build = parsePPTBuild(raw)
		setStep(build?.step ?? 1)
		setEffect(build?.effect ?? "fade")
		setOpen(false)
		generation.current++
	}, [raw, selector])
	const apply = async (remove: boolean) => {
		if (busy) return
		setBusy(true)
		try {
			await updateAttributes({
				dataMagicPptBuild: remove ? null : JSON.stringify({ version: 1, step, effect }),
			})
			setOpen(false)
		} catch (error) {
			magicToast.error(
				String(error).includes("PPT_BUILD_NESTED")
					? t("ppt.build.nested")
					: t("ppt.build.saveFailed"),
			)
		} finally {
			setBusy(false)
		}
	}
	return (
		<Popover
			open={open}
			onOpenChange={async (next) => {
				setOpen(next)
				const request = ++generation.current
				if (!next || raw) return
				try {
					const html = await editorRef.current?.getCleanContent()
					if (generation.current !== request || !html) return
					const builds = collectPPTBuilds(
						new DOMParser().parseFromString(html, "text/html"),
					)
					setStep(
						Math.min(1000, Math.max(0, ...builds.map(({ build }) => build.step)) + 1),
					)
				} catch {
					/* The user can still choose an explicit step if content is unavailable. */
				}
			}}
		>
			<PopoverTrigger asChild>
				<Button variant="ghost" size="sm" disabled={disabled || !selector || busy}>
					<ListOrdered size={16} />
					<span>{t("ppt.build.title")}</span>
				</Button>
			</PopoverTrigger>
			<EditorPopoverContent
				className="w-[min(18rem,calc(100vw-1rem))] space-y-3"
				align="start"
			>
				<p className="text-sm font-medium">{t("ppt.build.title")}</p>
				<p className="text-xs text-muted-foreground">{t("ppt.build.description")}</p>
				<label className="block space-y-1 text-sm" htmlFor={`${id}-effect`}>
					<span>{t("ppt.build.effect")}</span>
					<select
						id={`${id}-effect`}
						value={effect}
						disabled={busy}
						className="h-9 w-full rounded-md border border-input bg-background px-2"
						onChange={(event) => setEffect(event.target.value as "appear" | "fade")}
					>
						<option value="appear">{t("ppt.build.appear")}</option>
						<option value="fade">{t("ppt.build.fade")}</option>
					</select>
				</label>
				<label className="block space-y-1 text-sm" htmlFor={`${id}-step`}>
					<span>{t("ppt.build.step")}</span>
					<Input
						id={`${id}-step`}
						type="number"
						min={1}
						max={1000}
						value={Number.isNaN(step) ? "" : step}
						disabled={busy}
						onChange={(event) => setStep(event.target.valueAsNumber)}
					/>
				</label>
				<div className="flex justify-between gap-2">
					<Button
						variant="ghost"
						size="sm"
						disabled={busy || !raw}
						onClick={() => void apply(true)}
					>
						{t("ppt.build.remove")}
					</Button>
					<Button
						size="sm"
						disabled={busy || !Number.isInteger(step) || step < 1 || step > 1000}
						onClick={() => void apply(false)}
					>
						{t("ppt.build.apply")}
					</Button>
				</div>
			</EditorPopoverContent>
		</Popover>
	)
})
