/** Shared visual tokens for the HTML style panel.
 *
 * Keeping these classes in one local module makes the compact and full
 * variants use the same control rhythm without introducing global CSS.
 */
export const STYLE_PANEL_STYLES = {
	section: "min-w-0 space-y-2",
	sectionTitle:
		"sticky top-0 z-10 -mx-1 bg-card/95 px-1.5 py-1.5 pr-10 text-xs font-semibold leading-4 text-foreground backdrop-blur supports-[backdrop-filter]:bg-card/80",
	subsectionTitle:
		"sticky top-7 z-[9] -mx-2 flex min-h-6 items-center justify-between gap-2 bg-muted/95 px-2 py-1 text-[11px] font-semibold leading-4 text-foreground backdrop-blur supports-[backdrop-filter]:bg-muted/80 rounded-t-md",
	field: "min-w-0 space-y-1",
	label: "text-[11px] font-medium leading-4 text-muted-foreground",
	control:
		"h-7 rounded-md border-border/70 bg-background/70 px-2 text-xs transition-[background-color,border-color,box-shadow] duration-150 hover:border-primary/45 hover:bg-primary/5 focus-visible:border-primary/70 focus-visible:bg-primary/10 focus-visible:ring-2 focus-visible:ring-primary/20 disabled:bg-muted/40",
	iconButton:
		"h-7 w-7 rounded-md p-0 transition-[background-color,color,transform] duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.96]",
	group: "min-w-0 rounded-md border border-border/60 bg-muted/20 p-2 pt-0",
	toolbarGroup:
		"flex min-h-7 items-center gap-1 rounded-md border border-border/60 bg-muted/30 p-0.5",
} as const
