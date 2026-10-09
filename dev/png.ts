import { deflateSync, inflateSync } from "node:zlib"

const table = new Uint32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc(bytes: Uint8Array) {
  let c = 0xffffffff
  for (const b of bytes) c = table[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Uint8Array) {
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  out.set(new TextEncoder().encode(type), 4)
  out.set(data, 8)
  view.setUint32(8 + data.length, crc(out.subarray(4, 8 + data.length)))
  return out
}

export function encodePng(rgba: Uint8Array, width: number, height: number) {
  const raw = new Uint8Array((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0
    raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1)
  }
  const ihdr = new Uint8Array(13)
  const view = new DataView(ihdr.buffer)
  view.setUint32(0, width)
  view.setUint32(4, height)
  ihdr.set([8, 6, 0, 0, 0], 8)
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", new Uint8Array())]
  const total = parts.reduce((n, p) => n + p.length, 0)
  const png = new Uint8Array(total)
  let o = 0
  for (const p of parts) {
    png.set(p, o)
    o += p.length
  }
  return png
}

// Decodes the PNGs encodePng writes: 8-bit RGBA, unfiltered rows.
export function decodePng(png: Uint8Array) {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength)
  const width = view.getUint32(16)
  const height = view.getUint32(20)
  if (png[24] !== 8 || png[25] !== 6) throw new Error("only 8-bit RGBA PNGs are supported")
  const idat: Uint8Array[] = []
  for (let o = 8; o < png.length; o += 12 + view.getUint32(o)) {
    if (new TextDecoder().decode(png.subarray(o + 4, o + 8)) === "IDAT") idat.push(png.subarray(o + 8, o + 8 + view.getUint32(o)))
  }
  const raw = inflateSync(Buffer.concat(idat))
  const rgba = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) {
    if (raw[y * (width * 4 + 1)] !== 0) throw new Error("only unfiltered PNG rows are supported")
    rgba.set(raw.subarray(y * (width * 4 + 1) + 1, (y + 1) * (width * 4 + 1)), y * width * 4)
  }
  return { rgba, width, height }
}
