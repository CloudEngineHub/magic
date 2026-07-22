import { describe, expect, it } from "vitest"
import {
	parseImageDimensionsFromBlobHeader,
	parseImageDimensionsFromHeader,
} from "../image/imageHeaderDimensions"

function toArrayBuffer(bytes: number[]): ArrayBuffer {
	const array = new Uint8Array(bytes)
	return array.buffer.slice(array.byteOffset, array.byteOffset + array.byteLength)
}

function ascii(value: string): number[] {
	return Array.from(value).map((char) => char.charCodeAt(0))
}

function uint16be(value: number): number[] {
	return [(value >> 8) & 0xff, value & 0xff]
}

function uint16le(value: number): number[] {
	return [value & 0xff, (value >> 8) & 0xff]
}

function uint24le(value: number): number[] {
	return [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff]
}

function uint32be(value: number): number[] {
	return [(value >> 24) & 0xff, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff]
}

function uint32le(value: number): number[] {
	return [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >> 24) & 0xff]
}

describe("image header dimension parsing", () => {
	it("reads PNG dimensions from IHDR without decoding pixels", () => {
		const png = [
			0x89,
			0x50,
			0x4e,
			0x47,
			0x0d,
			0x0a,
			0x1a,
			0x0a,
			...uint32be(13),
			...ascii("IHDR"),
			...uint32be(640),
			...uint32be(360),
		]

		expect(parseImageDimensionsFromHeader(toArrayBuffer(png))).toEqual({
			width: 640,
			height: 360,
		})
	})

	it("reads JPEG dimensions from SOF markers after metadata segments", () => {
		const app0Payload = new Array(14).fill(0)
		const jpeg = [
			0xff,
			0xd8,
			0xff,
			0xe0,
			...uint16be(16),
			...app0Payload,
			0xff,
			0xc0,
			...uint16be(17),
			0x08,
			...uint16be(768),
			...uint16be(1024),
			0x03,
			0x01,
			0x11,
			0x00,
			0x02,
			0x11,
			0x00,
			0x03,
			0x11,
			0x00,
		]

		expect(parseImageDimensionsFromHeader(toArrayBuffer(jpeg))).toEqual({
			width: 1024,
			height: 768,
		})
	})

	it("reads WebP VP8X dimensions from RIFF chunks", () => {
		const width = 1200
		const height = 675
		const webp = [
			...ascii("RIFF"),
			...uint32le(30),
			...ascii("WEBP"),
			...ascii("VP8X"),
			...uint32le(10),
			0x00,
			0x00,
			0x00,
			0x00,
			...uint24le(width - 1),
			...uint24le(height - 1),
		]

		expect(parseImageDimensionsFromHeader(toArrayBuffer(webp))).toEqual({
			width,
			height,
		})
	})

	it("reads GIF dimensions and returns null for unknown headers", async () => {
		const gif = [...ascii("GIF89a"), ...uint16le(320), ...uint16le(200)]

		await expect(
			parseImageDimensionsFromBlobHeader(
				new Blob([toArrayBuffer(gif)], { type: "image/gif" }),
			),
		).resolves.toEqual({
			width: 320,
			height: 200,
		})
		expect(parseImageDimensionsFromHeader(toArrayBuffer([0x00, 0x01, 0x02]))).toBeNull()
	})
})
