import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isWebm, opusPacketSamples, webmToOgg } from '@/lib/audio/webm-to-ogg';

// Gravação real do Chrome (MediaRecorder, audio/webm;codecs=opus, 0,36 s).
const CHROME_WEBM = Buffer.from(
  'GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQRChYECGFOAZwEAAAAAAAFMEU2bdLlNu4tTq4QVSalmU6yBbk27i1OrhBZUrmtTrIGTTbuLU6uEH0O2dVOsgddNu4xTq4QcU7trU6yCATrsrgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmoCrXsYMPQkBEiYRDlgAATYCGQ2hyb21lV0GGQ2hyb21lFlSua7+uvdeBAXPFh4QtGkovigiDgQKGhkFfT1BVU2Oik09wdXNIZWFkAQEAAIC7AAAAAADhjbWERzuAAJ+BAWJkgSAfQ7Z1AQAAAAAAAFfngQCjjIEAAID7A//+//7//qOMgQA8gPsD//7//v/+o4yBAHiA+wP//v/+//6jjIEAtID7A//+//7//qOMgQDwgPsD//7//v/+o4yBASyA+wP//v/+//4cU7trjbuLs4EAt4b3gQHxgdc=',
  'base64'
);

interface Page { flags: number; granule: number; packets: Buffer[]; crcOk: boolean }

/** Lê as páginas Ogg e confere o CRC de cada uma (implementação independente). */
function readOgg(data: Buffer): Page[] {
  const crc = (bytes: Buffer) => {
    let value = 0;
    for (const byte of bytes) {
      value ^= byte << 24;
      for (let bit = 0; bit < 8; bit++) value = value & 0x80000000 ? (value << 1) ^ 0x04c11db7 : value << 1;
      value >>>= 0;
    }
    return value >>> 0;
  };
  const pages: Page[] = [];
  let offset = 0;
  while (offset < data.length) {
    assert.equal(data.subarray(offset, offset + 4).toString('latin1'), 'OggS');
    const count = data[offset + 26];
    const lacing = [...data.subarray(offset + 27, offset + 27 + count)];
    const size = 27 + count + lacing.reduce((sum, value) => sum + value, 0);
    const page = Buffer.from(data.subarray(offset, offset + size));
    const stored = page.readUInt32LE(22);
    page.writeUInt32LE(0, 22);
    const packets: Buffer[] = [];
    let cursor = offset + 27 + count;
    let current: Buffer[] = [];
    for (const value of lacing) {
      current.push(data.subarray(cursor, cursor + value));
      cursor += value;
      if (value < 255) {
        packets.push(Buffer.concat(current));
        current = [];
      }
    }
    pages.push({ flags: data[offset + 5], granule: Number(data.readBigInt64LE(offset + 6)), packets, crcOk: crc(page) === stored });
    offset += size;
  }
  return pages;
}

test('áudio do Chrome (WebM) vira Ogg/Opus para o WhatsApp', () => {
  assert.ok(isWebm(CHROME_WEBM));
  const ogg = webmToOgg(CHROME_WEBM);
  assert.ok(!isWebm(ogg));
  const pages = readOgg(ogg);
  assert.ok(pages.every((page) => page.crcOk), 'CRC de todas as páginas');
  assert.equal(pages[0].flags, 0x02, 'primeira página marca o início');
  assert.equal(pages[pages.length - 1].flags, 0x04, 'última página marca o fim');
  assert.equal(pages[0].packets[0].subarray(0, 8).toString('latin1'), 'OpusHead');
  assert.equal(pages[1].packets[0].subarray(0, 8).toString('latin1'), 'OpusTags');
  const audio = pages.slice(2).flatMap((page) => page.packets);
  assert.equal(audio.length, 6, 'os 6 pacotes de áudio');
  assert.equal(pages[pages.length - 1].granule, 17280, '0,36 s a 48 kHz');
});

test('WebM com pacotes agrupados (lacing Xiph e EBML)', () => {
  const vint = (value: number) => Buffer.from([0x01, 0, 0, 0, 0, 0, 0, 0].map((byte, index) => (index === 0 ? byte : Math.floor(value / 256 ** (7 - index)) % 256)));
  const el = (id: number[], payload: Buffer) => Buffer.concat([Buffer.from(id), vint(payload.length), payload]);
  const unknown = (id: number[], payload: Buffer) => Buffer.concat([Buffer.from(id), Buffer.from([0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]), payload]);
  const packet = (fill: number, length: number) => Buffer.concat([Buffer.from([0xf8]), Buffer.alloc(length - 1, fill)]); // CELT 20 ms
  const a = packet(1, 300); // maior que 255: lacing Xiph usa 255 + 45
  const b = packet(2, 40);
  const c = packet(3, 41);
  const xiph = Buffer.concat([Buffer.from([0x81, 0, 0, 0x02, 1, 255, 45]), a, b]);
  // EBML: 3 quadros, tamanho do 1º = 40, diferença do 2º = +1 (vint com bias 63 → 64 = 0xC0).
  const ebml = Buffer.concat([Buffer.from([0x81, 0, 20, 0x06, 2, 0x80 | 40, 0xc0]), b, c, b]);
  const webm = Buffer.concat([
    el([0x1a, 0x45, 0xdf, 0xa3], el([0x42, 0x82], Buffer.from('webm'))),
    unknown([0x18, 0x53, 0x80, 0x67], Buffer.concat([
      el([0x16, 0x54, 0xae, 0x6b], el([0xae], Buffer.concat([el([0xd7], Buffer.from([1])), el([0x86], Buffer.from('A_OPUS')), el([0xe1], el([0x9f], Buffer.from([1])))]))),
      unknown([0x1f, 0x43, 0xb6, 0x75], Buffer.concat([el([0xe7], Buffer.from([0])), el([0xa3], xiph), el([0xa3], ebml)])),
    ])),
  ]);
  const pages = readOgg(webmToOgg(webm));
  assert.ok(pages.every((page) => page.crcOk));
  assert.equal(pages[0].packets[0][9], 1, 'OpusHead montado com 1 canal');
  const audio = pages.slice(2).flatMap((page) => page.packets);
  assert.deepEqual(audio.map((item) => item.length), [300, 40, 40, 41, 40]);
  assert.ok(audio[0].equals(a) && audio[3].equals(c));
  assert.equal(pages[pages.length - 1].granule, 5 * 960);
});

test('duração dos pacotes Opus e arquivos que não são WebM/Opus', () => {
  assert.equal(opusPacketSamples(Buffer.from([0xf8])), 960); // CELT 20 ms, 1 quadro
  assert.equal(opusPacketSamples(Buffer.from([0x18])), 2880); // SILK 60 ms
  assert.equal(opusPacketSamples(Buffer.from([0xfb, 0x03])), 2880); // CELT 20 ms × 3
  assert.equal(opusPacketSamples(Buffer.from([0x79])), 1920); // híbrido 20 ms × 2
  assert.throws(() => webmToOgg(Buffer.from('OggS não é webm')));
  assert.ok(!isWebm(Buffer.from('ID3 mp3')));
});
