// Read a zip archive (an .xlsx is one) from a Buffer without a dependency: walk the
// central directory and inflate each entry. Returns { name: Buffer }. Entries in
// an unsupported compression method come back as null rather than as garbage.
import zlib from 'node:zlib';

export function unzip(b) {
  let eocd = b.length - 22;
  while (eocd >= 0 && b.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('not a zip file');
  const n = b.readUInt16LE(eocd + 10);
  let p = b.readUInt32LE(eocd + 16);
  const files = {};
  for (let i = 0; i < n; i++) {
    if (b.readUInt32LE(p) !== 0x02014b50) throw new Error('bad zip directory');
    const method = b.readUInt16LE(p + 10), size = b.readUInt32LE(p + 20);
    const nameLen = b.readUInt16LE(p + 28), extraLen = b.readUInt16LE(p + 30), commentLen = b.readUInt16LE(p + 32);
    const local = b.readUInt32LE(p + 42);
    const name = b.toString('utf8', p + 46, p + 46 + nameLen);
    const start = local + 30 + b.readUInt16LE(local + 26) + b.readUInt16LE(local + 28);
    const raw = b.subarray(start, start + size);
    files[name] = method === 8 ? zlib.inflateRawSync(raw) : method === 0 ? raw : null;
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}
