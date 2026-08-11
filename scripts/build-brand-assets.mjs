/**
 * Derives the UI-ready brand assets from the master logo.
 *
 * The master `public/qnx-qserv-mcsu-logo.png` is a 1536x1024 canvas whose
 * lockup only occupies rows 414-629 — mostly empty space, and far too wide a
 * box to lay out against. Its alpha channel is already crisp (the neon look is
 * baked into the RGB of transparent pixels, which renderers ignore), so all we
 * need to do is crop it and derive a monochrome variant for dark surfaces:
 *
 *   logo.png         full lockup, brand colours -> light surfaces
 *   logo-white.png   full lockup, forced white  -> blue / dark surfaces
 *   mark.png         QSERV mark only            -> collapsed sidebar, favicon
 *   mark-white.png   QSERV mark only, white     -> dark surfaces
 *
 * Run with `npm run brand:build`. Output lands in `public/brand/`.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const SRC = path.join(process.cwd(), "public", "qnx-qserv-mcsu-logo.png");
const OUT_DIR = path.join(process.cwd(), "public", "brand");

/** Minimal RGBA PNG decoder — enough for the single 8-bit truecolour+alpha master. */
function decodePng(file) {
  const buf = fs.readFileSync(file);
  let off = 8;
  let width = 0;
  let height = 0;
  const idat = [];

  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.subarray(off + 4, off + 8).toString("latin1");
    if (type === "IHDR") {
      width = buf.readUInt32BE(off + 8);
      height = buf.readUInt32BE(off + 12);
      if (buf[off + 16] !== 8 || buf[off + 17] !== 6) {
        throw new Error("expected an 8-bit RGBA png");
      }
    }
    if (type === "IDAT") idat.push(buf.subarray(off + 8, off + 8 + len));
    if (type === "IEND") break;
    off += 12 + len;
  }

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const data = Buffer.alloc(height * stride);
  let p = 0;

  for (let y = 0; y < height; y++) {
    const filter = raw[p++];
    const line = raw.subarray(p, p + stride);
    p += stride;
    for (let x = 0; x < stride; x++) {
      const left = x >= 4 ? data[y * stride + x - 4] : 0;
      const up = y > 0 ? data[(y - 1) * stride + x] : 0;
      const upLeft = x >= 4 && y > 0 ? data[(y - 1) * stride + x - 4] : 0;
      let v = line[x];
      switch (filter) {
        case 1:
          v += left;
          break;
        case 2:
          v += up;
          break;
        case 3:
          v += (left + up) >> 1;
          break;
        case 4: {
          const pred = left + up - upLeft;
          const pa = Math.abs(pred - left);
          const pb = Math.abs(pred - up);
          const pc = Math.abs(pred - upLeft);
          v += pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
          break;
        }
        default:
          break;
      }
      data[y * stride + x] = v & 0xff;
    }
  }

  return { width, height, stride, data };
}

function encodePng({ width, height, data }) {
  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    data.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const chunk = (type, body) => {
    const out = Buffer.alloc(body.length + 12);
    out.writeUInt32BE(body.length, 0);
    out.write(type, 4, "latin1");
    body.copy(out, 8);
    out.writeUInt32BE(zlib.crc32(out.subarray(4, 8 + body.length)) >>> 0, 8 + body.length);
    return out;
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // truecolour + alpha

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/**
 * Crops a region, optionally replacing every pixel's colour with `tint` while
 * keeping its alpha. Fully transparent pixels get their colour zeroed so the
 * baked-in neon halo can't bleed back in when a renderer downscales the asset.
 */
function extract(img, box, tint = null) {
  const width = box.x2 - box.x1;
  const height = box.y2 - box.y1;
  const out = Buffer.alloc(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const src = (y + box.y1) * img.stride + (x + box.x1) * 4;
      const dst = (y * width + x) * 4;
      const alpha = img.data[src + 3];
      const colour = alpha === 0 ? [0, 0, 0] : (tint ?? [img.data[src], img.data[src + 1], img.data[src + 2]]);

      out[dst] = colour[0];
      out[dst + 1] = colour[1];
      out[dst + 2] = colour[2];
      out[dst + 3] = alpha;
    }
  }

  return { width, height, data: out };
}

const img = decodePng(SRC);

// Measured from the master: the lockup occupies rows 414-629, with the QNX
// wordmark at 50-705, a divider at 754, the QSERV mark at 801-979 and the
// QSERV-MCSU wordmark at 1008-1485.
const FULL = { x1: 26, y1: 390, x2: 1510, y2: 654 };
const MARK = { x1: 786, y1: 408, x2: 994, y2: 636 };
const WHITE = [255, 255, 255];

const outputs = {
  "logo.png": extract(img, FULL),
  "logo-white.png": extract(img, FULL, WHITE),
  "mark.png": extract(img, MARK),
  "mark-white.png": extract(img, MARK, WHITE),
};

fs.mkdirSync(OUT_DIR, { recursive: true });
for (const [name, bitmap] of Object.entries(outputs)) {
  fs.writeFileSync(path.join(OUT_DIR, name), encodePng(bitmap));
  console.log(`${name}  ${bitmap.width}x${bitmap.height}`);
}
