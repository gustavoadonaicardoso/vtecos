/**
 * ============================================================
 * VTEC OS — Áudio gravado no navegador → formato do WhatsApp
 * ============================================================
 * O Chrome grava em WebM (Opus). O WhatsApp só aceita mensagem de voz
 * em Ogg (Opus) e não entrega/toca WebM. O som é o mesmo (Opus): aqui
 * só trocamos a "caixa" (WebM → Ogg), sem recodificar e sem programa
 * externo (ffmpeg). Coberto por tests/webm-to-ogg.test.ts.
 * ============================================================
 */

const ID = {
  SEGMENT: 0x18538067,
  TRACKS: 0x1654ae6b,
  TRACK_ENTRY: 0xae,
  TRACK_NUMBER: 0xd7,
  CODEC_ID: 0x86,
  CODEC_PRIVATE: 0x63a2,
  CODEC_DELAY: 0x56aa,
  AUDIO: 0xe1,
  SAMPLING_FREQUENCY: 0xb5,
  CHANNELS: 0x9f,
  CLUSTER: 0x1f43b675,
  BLOCK_GROUP: 0xa0,
  BLOCK: 0xa1,
  SIMPLE_BLOCK: 0xa3,
};

/** Elementos "pasta": entramos neles em vez de pular. */
const CONTAINERS = new Set([ID.SEGMENT, ID.TRACKS, ID.TRACK_ENTRY, ID.AUDIO, ID.CLUSTER, ID.BLOCK_GROUP]);

/** Começa com o cabeçalho EBML (WebM/Matroska)? */
export const isWebm = (buffer: Buffer) => buffer.length > 4 && buffer.readUInt32BE(0) === 0x1a45dfa3;

interface Vint {
  value: number;
  length: number;
  unknown: boolean;
}

/** Número de tamanho variável do EBML. `keepMarker` para IDs (que guardam o bit de marca). */
function readVint(buffer: Buffer, offset: number, keepMarker: boolean): Vint | null {
  if (offset >= buffer.length) return null;
  const first = buffer[offset];
  let length = 1;
  while (length <= 8 && !(first & (0x80 >> (length - 1)))) length++;
  if (length > 8 || offset + length > buffer.length) return null;
  let value = keepMarker ? first : first & (0xff >> length);
  let allOnes = value === (0xff >> length);
  for (let i = 1; i < length; i++) {
    value = value * 256 + buffer[offset + i];
    if (buffer[offset + i] !== 0xff) allOnes = false;
  }
  return { value, length, unknown: !keepMarker && allOnes };
}

const readUint = (data: Buffer) => data.reduce((total, byte) => total * 256 + byte, 0);

interface OpusTrack {
  number: number | null;
  codec: string;
  codecPrivate: Buffer | null;
  codecDelayNs: number;
  channels: number;
  sampleRate: number;
}

/** Quadros dentro de um Block/SimpleBlock (com ou sem "lacing"). */
function blockFrames(data: Buffer): { track: number; frames: Buffer[] } | null {
  const track = readVint(data, 0, false);
  if (!track) return null;
  let offset = track.length + 3; // + timecode (2) + flags (1)
  if (offset > data.length) return null;
  const lacing = (data[track.length + 2] >> 1) & 0x03;
  if (lacing === 0) return { track: track.value, frames: [data.subarray(offset)] };

  const count = data[offset] + 1;
  offset += 1;
  const sizes: number[] = [];
  if (lacing === 1) {
    // Xiph: cada tamanho é uma soma de bytes até um < 255.
    for (let i = 0; i < count - 1; i++) {
      let size = 0;
      let byte = 255;
      while (byte === 255) {
        if (offset >= data.length) return null;
        byte = data[offset++];
        size += byte;
      }
      sizes.push(size);
    }
  } else if (lacing === 3) {
    // EBML: o primeiro tamanho inteiro, os outros como diferença.
    const first = readVint(data, offset, false);
    if (!first) return null;
    offset += first.length;
    sizes.push(first.value);
    for (let i = 1; i < count - 1; i++) {
      const delta = readVint(data, offset, false);
      if (!delta) return null;
      offset += delta.length;
      const bias = 2 ** (7 * delta.length - 1) - 1;
      sizes.push(sizes[i - 1] + delta.value - bias);
    }
  }
  const rest = data.length - offset;
  if (lacing === 2) {
    if (rest % count) return null;
    for (let i = 0; i < count - 1; i++) sizes.push(rest / count);
  }
  const used = sizes.reduce((sum, size) => sum + size, 0);
  if (sizes.some((size) => size < 0) || used > rest) return null;
  sizes.push(rest - used);
  const frames: Buffer[] = [];
  for (const size of sizes) {
    frames.push(data.subarray(offset, offset + size));
    offset += size;
  }
  return { track: track.value, frames };
}

/** Lê a trilha Opus e os pacotes de áudio, em ordem. */
function demux(buffer: Buffer): { track: OpusTrack; packets: Buffer[] } {
  const tracks: OpusTrack[] = [];
  const blocks: { track: number; frames: Buffer[] }[] = [];
  let current: OpusTrack | null = null;
  let offset = 0;
  while (offset < buffer.length) {
    const id = readVint(buffer, offset, true);
    if (!id) break;
    const size = readVint(buffer, offset + id.length, false);
    if (!size) break;
    const start = offset + id.length + size.length;
    if (CONTAINERS.has(id.value)) {
      if (id.value === ID.TRACK_ENTRY) {
        current = { number: null, codec: '', codecPrivate: null, codecDelayNs: 0, channels: 1, sampleRate: 48000 };
        tracks.push(current);
      }
      offset = start; // entra na pasta (tamanho desconhecido também funciona)
      continue;
    }
    if (size.unknown) break;
    const end = start + size.value;
    if (end > buffer.length) {
      // Gravação cortada no fim: aproveita o que veio inteiro.
      if (id.value === ID.SIMPLE_BLOCK || id.value === ID.BLOCK) break;
      throw new Error('Arquivo de áudio incompleto.');
    }
    const data = buffer.subarray(start, end);
    if (id.value === ID.SIMPLE_BLOCK || id.value === ID.BLOCK) {
      const block = blockFrames(data);
      if (block) blocks.push(block);
    } else if (current) {
      if (id.value === ID.TRACK_NUMBER) current.number = readUint(data);
      else if (id.value === ID.CODEC_ID) current.codec = data.toString('latin1');
      else if (id.value === ID.CODEC_PRIVATE) current.codecPrivate = Buffer.from(data);
      else if (id.value === ID.CODEC_DELAY) current.codecDelayNs = readUint(data);
      else if (id.value === ID.CHANNELS) current.channels = readUint(data) || 1;
      else if (id.value === ID.SAMPLING_FREQUENCY) current.sampleRate = Math.round(data.length === 4 ? data.readFloatBE(0) : data.length === 8 ? data.readDoubleBE(0) : 48000) || 48000;
    }
    offset = end;
  }
  const track = tracks.find((item) => item.codec === 'A_OPUS');
  if (!track) throw new Error('O áudio não está em Opus.');
  const packets = blocks.filter((block) => track.number === null || block.track === track.number).flatMap((block) => block.frames).filter((frame) => frame.length > 0);
  if (!packets.length) throw new Error('O áudio está vazio.');
  return { track, packets };
}

/** Quantas amostras (a 48 kHz) um pacote Opus tem, pelo byte TOC (RFC 6716, 3.1). */
export function opusPacketSamples(packet: Buffer): number {
  if (!packet.length) return 0;
  const toc = packet[0];
  const config = toc >> 3;
  let frameSamples: number;
  if (config < 12) frameSamples = [480, 960, 1920, 2880][config % 4]; // SILK: 10/20/40/60 ms
  else if (config < 16) frameSamples = [480, 960][config % 2]; // híbrido: 10/20 ms
  else frameSamples = [120, 240, 480, 960][config % 4]; // CELT: 2,5/5/10/20 ms
  const code = toc & 0x03;
  const frames = code === 0 ? 1 : code === 3 ? (packet[1] ?? 0) & 0x3f : 2;
  return frameSamples * frames;
}

// ── Ogg ────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let crc = i << 24;
    for (let bit = 0; bit < 8; bit++) crc = crc & 0x80000000 ? (crc << 1) ^ 0x04c11db7 : crc << 1;
    table[i] = crc >>> 0;
  }
  return table;
})();

function oggCrc(data: Buffer) {
  let crc = 0;
  for (const byte of data) crc = ((crc << 8) ^ CRC_TABLE[((crc >>> 24) ^ byte) & 0xff]) >>> 0;
  return crc >>> 0;
}

function oggPage(packets: Buffer[], options: { serial: number; sequence: number; granule: number; first: boolean; last: boolean }) {
  const lacing: number[] = [];
  for (const packet of packets) {
    let left = packet.length;
    while (left >= 255) {
      lacing.push(255);
      left -= 255;
    }
    lacing.push(left);
  }
  const header = Buffer.alloc(27 + lacing.length);
  header.write('OggS', 0, 'latin1');
  header[4] = 0;
  header[5] = (options.first ? 0x02 : 0) | (options.last ? 0x04 : 0);
  header.writeBigInt64LE(BigInt(options.granule), 6);
  header.writeUInt32LE(options.serial, 14);
  header.writeUInt32LE(options.sequence, 18);
  header.writeUInt32LE(0, 22);
  header[26] = lacing.length;
  lacing.forEach((value, index) => (header[27 + index] = value));
  const page = Buffer.concat([header, ...packets]);
  page.writeUInt32LE(oggCrc(page), 22);
  return page;
}

function opusHead(track: OpusTrack) {
  if (track.codecPrivate && track.codecPrivate.length >= 19 && track.codecPrivate.subarray(0, 8).toString('latin1') === 'OpusHead') return track.codecPrivate;
  const head = Buffer.alloc(19);
  head.write('OpusHead', 0, 'latin1');
  head[8] = 1;
  head[9] = Math.min(Math.max(track.channels, 1), 2);
  head.writeUInt16LE(track.codecDelayNs ? Math.round((track.codecDelayNs * 48000) / 1e9) : 312, 10);
  head.writeUInt32LE(track.sampleRate, 12);
  head.writeInt16LE(0, 16);
  head[18] = 0;
  return head;
}

function opusTags() {
  const vendor = Buffer.from('vtec-os', 'latin1');
  const tags = Buffer.alloc(8 + 4 + vendor.length + 4);
  tags.write('OpusTags', 0, 'latin1');
  tags.writeUInt32LE(vendor.length, 8);
  vendor.copy(tags, 12);
  tags.writeUInt32LE(0, 12 + vendor.length);
  return tags;
}

/** WebM (Opus) → Ogg (Opus), o formato de mensagem de voz do WhatsApp. */
export function webmToOgg(buffer: Buffer): Buffer {
  const { track, packets } = demux(buffer);
  const serial = (Math.random() * 0xffffffff) >>> 0;
  const pages: Buffer[] = [
    oggPage([opusHead(track)], { serial, sequence: 0, granule: 0, first: true, last: false }),
    oggPage([opusTags()], { serial, sequence: 1, granule: 0, first: false, last: false }),
  ];
  let sequence = 2;
  let granule = 0;
  let group: Buffer[] = [];
  let segments = 0;
  // Páginas de até ~1 s (50 pacotes de 20 ms) e no máximo 255 pedaços.
  for (let index = 0; index < packets.length; index++) {
    const packet = packets[index];
    const needed = Math.floor(packet.length / 255) + 1;
    if (group.length && (segments + needed > 255 || group.length >= 50)) {
      pages.push(oggPage(group, { serial, sequence: sequence++, granule, first: false, last: false }));
      group = [];
      segments = 0;
    }
    group.push(packet);
    segments += needed;
    granule += opusPacketSamples(packet);
  }
  pages.push(oggPage(group, { serial, sequence: sequence++, granule, first: false, last: true }));
  return Buffer.concat(pages);
}
