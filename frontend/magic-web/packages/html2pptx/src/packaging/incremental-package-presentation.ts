import type {
	CreateIncrementalPresentationPackagerInput,
	IncrementalPresentationPackager,
} from "./incremental-types"

/** OSS keeps the established one-shot packager; the enterprise overlay supplies streaming. */
export function createIncrementalPresentationPackager(
	_input: CreateIncrementalPresentationPackagerInput,
): IncrementalPresentationPackager | null {
	return null
}
