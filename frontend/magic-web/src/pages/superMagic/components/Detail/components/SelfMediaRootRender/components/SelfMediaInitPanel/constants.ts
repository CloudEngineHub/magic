import type { SelfMediaInitData } from "./types"

export const STEPS = [
	{ key: "brand", titleKey: "detail.selfMedia.initPanel.steps.brand" },
	{ key: "topics", titleKey: "detail.selfMedia.initPanel.steps.topics" },
	{ key: "confirm", titleKey: "detail.selfMedia.initPanel.steps.confirm" },
]

export const PLATFORM_FETCH_TIMEOUT_MS = 3 * 60 * 1000

export function createEmptyInitData(): SelfMediaInitData {
	return {
		global: {
			author: "",
			brandPosition: "",
			targetAudience: "",
			brandImages: [],
		},
		articles: [],
	}
}

export const SKETCH_STYLES = {
	// Open paper section with a thin divider instead of a card frame
	section: "border-t border-dashed border-zinc-950/10 pt-5",
	sectionHeader: "text-[10px] font-black uppercase tracking-[0.22em] text-muted-foreground",
	accentLabel: "bg-primary/20 px-2 py-0.5 text-[10px] font-black text-zinc-950",

	// Compatibility aliases for older local components; prefer section styles above
	card: "border-t border-dashed border-zinc-950/10 bg-white p-5 transition-all",
	cardHover: "hover:bg-zinc-50/40",
	cardActive: "active:bg-zinc-50",
	stickerCard: "border-l-2 border-primary/50 bg-primary/10 p-4",

	// Flat buttons for the open workbench style
	buttonPrimary:
		"inline-flex cursor-pointer items-center justify-center gap-1.5 bg-zinc-950 px-5 py-2.5 text-xs font-black text-white transition-all hover:bg-zinc-900 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50",
	buttonSecondary:
		"inline-flex cursor-pointer items-center justify-center gap-1.5 bg-zinc-100 px-5 py-2.5 text-xs font-extrabold text-zinc-900 transition-all hover:bg-zinc-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50",
	buttonDanger:
		"inline-flex cursor-pointer items-center justify-center gap-1.5 bg-red-50 px-5 py-2.5 text-xs font-extrabold text-red-600 transition-all hover:bg-red-100 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50",

	// Underline input; active label should carry emphasis instead of heavy frames
	input: "w-full border-0 border-b border-zinc-200 bg-zinc-50/40 px-4 py-3 text-sm outline-none transition-all placeholder:text-muted-foreground/40 focus:border-zinc-950 focus:bg-primary/[0.03] disabled:cursor-not-allowed disabled:opacity-50",

	// Flat tags
	tag: "inline-flex items-center gap-1.5 bg-primary/20 px-2.5 py-1 text-xs font-extrabold text-zinc-950",
	tagWhite:
		"inline-flex items-center gap-1.5 bg-zinc-100 px-2.5 py-1 text-xs font-extrabold text-zinc-700",

	// Hero-only notebook paper grid background
	heroGrid:
		"pointer-events-none absolute inset-0 opacity-[0.025] [background-image:linear-gradient(#111_1px,transparent_1px),linear-gradient(90deg,#111_1px,transparent_1px)] [background-size:28px_28px]",
}
