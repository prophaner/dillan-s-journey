// Tiny QR Code encoder (Model 2, byte mode, error correction level M, versions 1–10, automatic
// mask choice). Enough for the TV pairing link (https://<host>/approve-tv?code=DLN-XXXX, ~60
// bytes = version 4–5). Written here instead of adding a runtime dependency; the algorithm follows
// ISO/IEC 18004 as laid out in Project Nayuki's reference implementation (MIT).
// The QR carries only the approve URL and the public pairing code, never a token (build-plan D8).

const MAX_VERSION = 10;
/** Level M, versions 1..10 (index 0 unused). */
const EC_PER_BLOCK = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
const NUM_BLOCKS = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];
/** Format-info bits for level M. */
const ECL_M_BITS = 0;

export interface QrCode {
  version: number;
  size: number;
  mask: number;
  /** modules[y][x], true = dark */
  modules: boolean[][];
}

function rawDataModules(ver: number): number {
  let r = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const n = Math.floor(ver / 7) + 2;
    r -= (25 * n - 10) * n - 55;
    if (ver >= 7) r -= 36;
  }
  return r;
}

export function dataCodewords(ver: number): number {
  return (
    Math.floor(rawDataModules(ver) / 8) -
    (EC_PER_BLOCK[ver] as number) * (NUM_BLOCKS[ver] as number)
  );
}

// ---- Reed–Solomon over GF(2^8), primitive polynomial 0x11D ----
function gfMul(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

function rsDivisor(degree: number): number[] {
  const result: number[] = new Array(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = gfMul(result[j] as number, root);
      if (j + 1 < result.length) result[j] = (result[j] as number) ^ (result[j + 1] as number);
    }
    root = gfMul(root, 0x02);
  }
  return result;
}

/** Error-correction codewords for one block (exported for the known-answer test). */
export function rsRemainder(data: readonly number[], degree: number): number[] {
  const div = rsDivisor(degree);
  const result: number[] = div.map(() => 0);
  for (const b of data) {
    const factor = b ^ (result.shift() as number);
    result.push(0);
    div.forEach((coef, i) => {
      result[i] = (result[i] as number) ^ gfMul(coef, factor);
    });
  }
  return result;
}

function utf8(text: string): number[] {
  return Array.from(new TextEncoder().encode(text));
}

function encodeData(bytes: number[], ver: number): number[] {
  const cap = dataCodewords(ver);
  const bits: number[] = [];
  const put = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1);
  };
  put(0b0100, 4); // byte mode
  put(bytes.length, ver <= 9 ? 8 : 16);
  for (const b of bytes) put(b, 8);
  const capBits = cap * 8;
  put(0, Math.min(4, capBits - bits.length));
  put(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < capBits; pad ^= 0xec ^ 0x11) put(pad, 8);
  const out: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let v = 0;
    for (let j = 0; j < 8; j++) v = (v << 1) | (bits[i + j] as number);
    out.push(v);
  }
  return out;
}

function addEccAndInterleave(data: number[], ver: number): number[] {
  const numBlocks = NUM_BLOCKS[ver] as number;
  const ecLen = EC_PER_BLOCK[ver] as number;
  const raw = Math.floor(rawDataModules(ver) / 8);
  const numShort = numBlocks - (raw % numBlocks);
  const shortLen = Math.floor(raw / numBlocks);
  const blocks: number[][] = [];
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const dat = data.slice(k, k + shortLen - ecLen + (i < numShort ? 0 : 1));
    k += dat.length;
    const ecc = rsRemainder(dat, ecLen);
    if (i < numShort) dat.push(0); // placeholder, skipped below
    blocks.push(dat.concat(ecc));
  }
  const result: number[] = [];
  for (let i = 0; i < (blocks[0] as number[]).length; i++) {
    blocks.forEach((b, j) => {
      if (i !== shortLen - ecLen || j >= numShort) result.push(b[i] as number);
    });
  }
  return result;
}

function alignmentPositions(ver: number): number[] {
  if (ver === 1) return [];
  const n = Math.floor(ver / 7) + 2;
  const step = Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2;
  const size = ver * 4 + 17;
  const result = [6];
  for (let pos = size - 7; result.length < n; pos -= step) result.splice(1, 0, pos);
  return result;
}

/** 15 format bits (level M) for a mask, BCH-coded and XOR-masked; bit 14 first in the spec. */
export function formatBits(mask: number): number {
  const data = (ECL_M_BITS << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

/** 18 version bits (versions ≥ 7). */
export function versionBits(ver: number): number {
  let rem = ver;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  return (ver << 12) | rem;
}

const bit = (x: number, i: number) => ((x >>> i) & 1) !== 0;

function maskBit(mask: number, x: number, y: number): boolean {
  switch (mask) {
    case 0:
      return (x + y) % 2 === 0;
    case 1:
      return y % 2 === 0;
    case 2:
      return x % 3 === 0;
    case 3:
      return (x + y) % 3 === 0;
    case 4:
      return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
    case 5:
      return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6:
      return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    default:
      return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
  }
}

class Matrix {
  size: number;
  m: boolean[][];
  fn: boolean[][];
  constructor(public ver: number) {
    this.size = ver * 4 + 17;
    this.m = Array.from({ length: this.size }, () => new Array<boolean>(this.size).fill(false));
    this.fn = Array.from({ length: this.size }, () => new Array<boolean>(this.size).fill(false));
  }
  setF(x: number, y: number, dark: boolean) {
    (this.m[y] as boolean[])[x] = dark;
    (this.fn[y] as boolean[])[x] = true;
  }
  drawFunctionPatterns() {
    const s = this.size;
    for (let i = 0; i < s; i++) {
      this.setF(6, i, i % 2 === 0);
      this.setF(i, 6, i % 2 === 0);
    }
    this.finder(3, 3);
    this.finder(s - 4, 3);
    this.finder(3, s - 4);
    const pos = alignmentPositions(this.ver);
    const n = pos.length;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
        this.alignment(pos[i] as number, pos[j] as number);
      }
    this.format(0);
    this.version();
  }
  finder(x: number, y: number) {
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && xx < this.size && yy >= 0 && yy < this.size)
          this.setF(xx, yy, d !== 2 && d !== 4);
      }
  }
  alignment(x: number, y: number) {
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++)
        this.setF(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  format(mask: number) {
    const b = formatBits(mask);
    const s = this.size;
    for (let i = 0; i <= 5; i++) this.setF(8, i, bit(b, i));
    this.setF(8, 7, bit(b, 6));
    this.setF(8, 8, bit(b, 7));
    this.setF(7, 8, bit(b, 8));
    for (let i = 9; i < 15; i++) this.setF(14 - i, 8, bit(b, i));
    for (let i = 0; i < 8; i++) this.setF(s - 1 - i, 8, bit(b, i));
    for (let i = 8; i < 15; i++) this.setF(8, s - 15 + i, bit(b, i));
    this.setF(8, s - 8, true); // dark module
  }
  version() {
    if (this.ver < 7) return;
    const b = versionBits(this.ver);
    for (let i = 0; i < 18; i++) {
      const a = this.size - 11 + (i % 3);
      const c = Math.floor(i / 3);
      this.setF(a, c, bit(b, i));
      this.setF(c, a, bit(b, i));
    }
  }
  codewords(data: number[]) {
    const s = this.size;
    let i = 0;
    for (let right = s - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < s; vert++)
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? s - 1 - vert : vert;
          if (!(this.fn[y] as boolean[])[x] && i < data.length * 8) {
            (this.m[y] as boolean[])[x] = bit(data[i >>> 3] as number, 7 - (i & 7));
            i++;
          }
        }
    }
  }
  applyMask(mask: number) {
    for (let y = 0; y < this.size; y++)
      for (let x = 0; x < this.size; x++)
        if (!(this.fn[y] as boolean[])[x] && maskBit(mask, x, y))
          (this.m[y] as boolean[])[x] = !(this.m[y] as boolean[])[x];
  }
}

/** Standard penalty score (lower is easier to read). */
function penalty(m: boolean[][]): number {
  const n = m.length;
  let score = 0;
  const at = (x: number, y: number) => (m[y] as boolean[])[x] as boolean;
  const line = (get: (i: number) => boolean) => {
    let run = 1;
    for (let i = 1; i <= n; i++) {
      if (i < n && get(i) === get(i - 1)) run++;
      else {
        if (run >= 5) score += 3 + (run - 5);
        run = 1;
      }
    }
    // finder-like 1:1:3:1:1 with 4 light modules on either side (outside = light)
    const v = (i: number) => (i < 0 || i >= n ? false : get(i));
    const pat = [true, false, true, true, true, false, true];
    for (let i = 0; i + 7 <= n; i++) {
      if (!pat.every((p, k) => v(i + k) === p)) continue;
      const before = [1, 2, 3, 4].every((k) => !v(i - k));
      const after = [7, 8, 9, 10].every((k) => !v(i + k));
      if (before || after) score += 40;
    }
  };
  for (let y = 0; y < n; y++) line((x) => at(x, y));
  for (let x = 0; x < n; x++) line((y) => at(x, y));
  for (let y = 0; y < n - 1; y++)
    for (let x = 0; x < n - 1; x++) {
      const c = at(x, y);
      if (c === at(x + 1, y) && c === at(x, y + 1) && c === at(x + 1, y + 1)) score += 3;
    }
  let dark = 0;
  for (const row of m) for (const c of row) if (c) dark++;
  const total = n * n;
  const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
  return score + Math.max(0, k) * 10;
}

/** Encode text (UTF-8 bytes) at level M in the smallest version that fits (1–10). */
export function encodeQr(text: string, forceMask?: number): QrCode {
  const bytes = utf8(text);
  let ver = 1;
  for (; ver <= MAX_VERSION; ver++) {
    const header = 4 + (ver <= 9 ? 8 : 16);
    if (header + bytes.length * 8 <= dataCodewords(ver) * 8) break;
  }
  if (ver > MAX_VERSION) throw new Error("qr_too_long");
  const codewords = addEccAndInterleave(encodeData(bytes, ver), ver);
  let best: Matrix | null = null;
  let bestScore = Infinity;
  let bestMask = 0;
  const masks = forceMask != null ? [forceMask] : [0, 1, 2, 3, 4, 5, 6, 7];
  for (const mask of masks) {
    const mx = new Matrix(ver);
    mx.drawFunctionPatterns();
    mx.codewords(codewords);
    mx.applyMask(mask);
    mx.format(mask);
    const sc = penalty(mx.m);
    if (sc < bestScore) {
      best = mx;
      bestScore = sc;
      bestMask = mask;
    }
  }
  const b = best as Matrix;
  return { version: ver, size: b.size, mask: bestMask, modules: b.m };
}

/** SVG path ("M x y h1 v1 h-1 z" per dark module) in module units, offset by the quiet zone. */
export function qrPath(qr: QrCode, quiet = 4): string {
  const parts: string[] = [];
  qr.modules.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) parts.push(`M${x + quiet} ${y + quiet}h1v1h-1z`);
    }),
  );
  return parts.join("");
}
