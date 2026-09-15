/**
 * The message list owns a plain scroll element instead of a Radix ScrollArea so the virtualizer
 * is the only writer of scroll compensation. Share pages still host the list inside their own
 * ScrollArea, so descendants that need to reach the owning viewport must accept both shapes.
 */
export const MESSAGE_LIST_VIEWPORT_ATTRIBUTE = "data-message-list-viewport"

export const MESSAGE_LIST_VIEWPORT_SELECTOR =
	'[data-message-list-viewport], [data-slot="scroll-area-viewport"]'

export function findMessageListViewport(element: Element | null): HTMLElement | null {
	return element?.closest<HTMLElement>(MESSAGE_LIST_VIEWPORT_SELECTOR) ?? null
}
