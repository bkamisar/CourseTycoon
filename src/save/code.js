/**
 * Save codes: a compressed, copyable string that round-trips to an
 * identical game state. Built directly on `serialize`/`deserialize`
 * (src/sim/state.js), so a save code inherits the simulation's own version
 * check for free — a code from an old save format fails exactly the way an
 * old localStorage save would, with a clear error, rather than loading into
 * a subtly broken game.
 *
 * The compression (a small LZW variant) and the base64 framing are both
 * hand-rolled here rather than reaching for a browser API
 * (`CompressionStream`) or a Node one (`Buffer`/`zlib`), so this file
 * behaves identically whether it runs under `node --test` or loaded as a
 * bare ES module in the browser — nothing bundles it, and nothing should
 * have to.
 */
import { serialize, deserialize } from '../sim/state.js';

// A marker at the front of every code, independent of the simulation's own
// SAVE_VERSION (which `deserialize` already checks). This one guards the
// *encoding* — so a string that isn't a save code at all (or is one from
// some future encoding this file doesn't know) is rejected immediately,
// before any attempt to decompress it as if it were.
const MAGIC = 'CT1';

// ---------------------------------------------------------------------
// Base64 framing (RFC 4648, standard alphabet, no external padding rules
// relied upon) — self-contained so this file needs neither `btoa`/`atob`
// (browser-only) nor `Buffer` (Node-only).
// ---------------------------------------------------------------------

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_INDEX = new Map([...B64].map((ch, i) => [ch, i]));

function bytesToBase64(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    out += B64[b0 >> 2];
    out += B64[((b0 & 0x03) << 4) | (b1 === undefined ? 0 : b1 >> 4)];
    out += b1 === undefined ? '' : B64[((b1 & 0x0f) << 2) | (b2 === undefined ? 0 : b2 >> 6)];
    out += b2 === undefined ? '' : B64[b2 & 0x3f];
  }
  return out;
}

function base64ToBytes(str) {
  const bytes = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of str) {
    const val = B64_INDEX.get(ch);
    if (val === undefined) throw new Error('unrecognized character in payload');
    buffer = (buffer << 6) | val;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return Uint8Array.from(bytes);
}

// ---------------------------------------------------------------------
// A minimal LZW compressor over UTF-16 code units. Codes are capped at 16
// bits (the dictionary simply stops growing once it hits that ceiling) so
// every code fits in one `Uint16`, keeping the framing below trivial — no
// variable bit-width packing, which a save-sized string never needs.
// ---------------------------------------------------------------------

const MAX_DICT_SIZE = 0xffff;

function lzwCompress(str) {
  const dict = new Map();
  for (let i = 0; i < 256; i++) dict.set(String.fromCharCode(i), i);
  let dictSize = 256;
  let w = '';
  const codes = [];

  for (const c of str) {
    const wc = w + c;
    if (dict.has(wc)) {
      w = wc;
      continue;
    }
    codes.push(dict.get(w));
    if (dictSize < MAX_DICT_SIZE) dict.set(wc, dictSize++);
    w = c;
  }
  if (w !== '') codes.push(dict.get(w));
  return codes;
}

function lzwDecompress(codes) {
  if (!codes.length) throw new Error('empty compression stream');
  const dict = new Map();
  for (let i = 0; i < 256; i++) dict.set(i, String.fromCharCode(i));
  let dictSize = 256;

  let w = dict.get(codes[0]);
  if (w === undefined) throw new Error('broken compression stream');
  let result = w;

  for (let i = 1; i < codes.length; i++) {
    const k = codes[i];
    let entry;
    if (dict.has(k)) entry = dict.get(k);
    else if (k === dictSize) entry = w + w[0];
    else throw new Error('broken compression stream');

    result += entry;
    if (dictSize < MAX_DICT_SIZE) dict.set(dictSize++, w + entry[0]);
    w = entry;
  }
  return result;
}

// ---------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------

/** Encodes a game state into a compressed, copyable save code. */
export function encode(state) {
  const json = serialize(state);
  const codes = lzwCompress(json);

  const bytes = new Uint8Array(codes.length * 2);
  const view = new DataView(bytes.buffer);
  codes.forEach((code, i) => view.setUint16(i * 2, code, true));

  return MAGIC + bytesToBase64(bytes);
}

/**
 * Decodes a save code back into a game state. Throws a clear, consistently
 * prefixed error on any corruption — a bad code must never silently
 * produce a subtly broken game.
 */
export function decode(text) {
  if (typeof text !== 'string' || text.length === 0 || !text.startsWith(MAGIC)) {
    throw new Error('corrupt save code: not a recognizable save code');
  }

  const body = text.slice(MAGIC.length);
  let bytes;
  try {
    bytes = base64ToBytes(body);
  } catch (err) {
    throw new Error(`corrupt save code: ${err.message}`);
  }
  if (bytes.length === 0 || bytes.length % 2 !== 0) {
    throw new Error('corrupt save code: truncated payload');
  }

  const view = new DataView(bytes.buffer);
  const codes = [];
  for (let i = 0; i < bytes.length; i += 2) codes.push(view.getUint16(i, true));

  let json;
  try {
    json = lzwDecompress(codes);
  } catch (err) {
    throw new Error(`corrupt save code: ${err.message}`);
  }

  try {
    return deserialize(json);
  } catch (err) {
    throw new Error(`corrupt save code: ${err.message}`);
  }
}
