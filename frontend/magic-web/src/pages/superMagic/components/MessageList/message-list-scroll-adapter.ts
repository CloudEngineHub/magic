export interface MessageListScrollRange {
	startIndex: number
	endIndex: number
}

export interface MessageListScrollAdapter {
	range?: MessageListScrollRange
	getTotalSize: () => number
	getFirstVisibleItemKey: () => string | undefined
	getItemOffset: (key: string) => number | undefined
	scrollToOffset: (
		offset: number,
		options?: { align?: "start" | "end"; behavior?: ScrollBehavior },
	) => void
}
