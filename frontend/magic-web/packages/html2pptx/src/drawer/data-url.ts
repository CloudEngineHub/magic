/**
 * 打包 Worker 内：把透传过来的图片二进制字节转成 base64 data URL，
 * 即将写入 pptxgenjs 前才编码——主线程不再长期持有膨胀的 base64。
 *
 * 分块（32KB）是为了避免 String.fromCharCode 一次传入过多参数触发栈溢出。
 */
export function bytesToDataUrl(buffer: ArrayBuffer, mime: string): string {
	const u8 = new Uint8Array(buffer)
	const CHUNK = 0x8000
	let binary = ""
	for (let i = 0; i < u8.length; i += CHUNK) {
		binary += String.fromCharCode.apply(null, u8.subarray(i, i + CHUNK) as unknown as number[])
	}
	return `data:${mime || "image/png"};base64,${btoa(binary)}`
}
