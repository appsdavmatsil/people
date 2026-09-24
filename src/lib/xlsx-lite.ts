const MAX_BYTES = 5 * 1024 * 1024;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export type SheetCell = {
  text: string;
  number: number | null;
};

type ZipEntry = {
  name: string;
  data: Uint8Array;
};

export async function writeXlsx(rows: SheetCell[][]): Promise<Uint8Array> {
  const lastRow = Math.max(rows.length, 1);
  const files: ZipEntry[] = [
    { name: "[Content_Types].xml", data: encoder.encode(contentTypesXml) },
    { name: "_rels/.rels", data: encoder.encode(rootRelsXml) },
    { name: "xl/workbook.xml", data: encoder.encode(workbookXml) },
    { name: "xl/_rels/workbook.xml.rels", data: encoder.encode(workbookRelsXml) },
    { name: "xl/styles.xml", data: encoder.encode(stylesXml) },
    { name: "xl/worksheets/sheet1.xml", data: encoder.encode(sheetXml(rows, lastRow)) },
  ];

  return createStoredZip(files);
}

export async function readXlsx(input: ArrayBuffer | Uint8Array): Promise<SheetCell[][]> {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.byteLength > MAX_BYTES) {
    throw new Error("That spreadsheet is too large.");
  }

  const files = await readStoredZip(bytes);
  const byName = new Map(files.map((file) => [normalizeZipName(file.name), file.data]));
  const sheet = byName.get("xl/worksheets/sheet1.xml") ?? firstWorksheet(byName);
  if (!sheet) {
    throw new Error("That file does not contain a worksheet.");
  }

  const shared = byName.get("xl/sharedstrings.xml");
  const sharedStrings = shared ? readSharedStrings(decoder.decode(shared)) : [];
  return readSheet(decoder.decode(sheet), sharedStrings);
}

function firstWorksheet(files: Map<string, Uint8Array>) {
  for (const [name, data] of files) {
    if (name.startsWith("xl/worksheets/") && name.endsWith(".xml")) {
      return data;
    }
  }

  return null;
}

function normalizeZipName(name: string) {
  return name.replaceAll("\\", "/").replace(/^\/+/, "").toLowerCase();
}

function sheetXml(rows: SheetCell[][], lastRow: number) {
  const columnCount = Math.max(1, ...rows.map((row) => row.length));
  const lastColumn = columnName(columnCount - 1);
  const body = rows
    .map((row, rowIndex) => {
      const cells = row
        .map((cell, columnIndex) => cellXml(cell, columnIndex, rowIndex + 1))
        .join("");
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:${lastColumn}${lastRow}"/>
  <cols>
    <col min="1" max="1" width="38" customWidth="1"/>
    <col min="2" max="${columnCount}" width="18" customWidth="1"/>
  </cols>
  <sheetData>${body}</sheetData>
</worksheet>`;
}

function cellXml(cell: SheetCell, columnIndex: number, rowNumber: number) {
  const ref = `${columnName(columnIndex)}${rowNumber}`;
  if (cell.number != null && cell.text === "") {
    return `<c r="${ref}" s="2"><v>${formatNumber(cell.number)}</v></c>`;
  }

  if (!cell.text) {
    return "";
  }

  return `<c r="${ref}" t="inlineStr" s="1"><is><t xml:space="preserve">${escapeXml(cell.text)}</t></is></c>`;
}

function formatNumber(value: number) {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

function columnName(index: number) {
  let n = index + 1;
  let name = "";
  while (n > 0) {
    const remainder = (n - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

function escapeXml(value: string) {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function readSharedStrings(xml: string) {
  const strings: string[] = [];
  for (const item of matchAll(xml, /<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
    const parts = matchAll(item[1], /<t\b[^>]*>([\s\S]*?)<\/t>/g).map((part) =>
      decodeXml(part[1]),
    );
    strings.push(parts.join(""));
  }
  return strings;
}

function readSheet(xml: string, sharedStrings: string[]) {
  const rows: SheetCell[][] = [];

  for (const rowMatch of matchAll(xml, /<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: SheetCell[] = [];
    let cursor = 0;

    for (const cellMatch of matchAll(
      rowMatch[1],
      /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g,
    )) {
      const tag = cellMatch[1];
      const body = cellMatch[2] ?? "";
      const ref = attribute(tag, "r");
      const index = ref ? columnIndex(ref) : cursor;
      while (row.length < index) {
        row.push(emptyCell());
      }

      row[index] = readCell(tag, body, sharedStrings);
      cursor = index + 1;
    }

    rows.push(row);
  }

  return rows;
}

function readCell(tag: string, body: string, sharedStrings: string[]): SheetCell {
  const type = attribute(tag, "t");
  if (type === "inlineStr") {
    const parts = matchAll(body, /<t\b[^>]*>([\s\S]*?)<\/t>/g).map((part) =>
      decodeXml(part[1]),
    );
    return { text: parts.join(""), number: null };
  }

  const value = matchAll(body, /<v\b[^>]*>([\s\S]*?)<\/v>/g)[0]?.[1] ?? "";
  const text = decodeXml(value).trim();
  if (type === "s") {
    const index = Number(text);
    return { text: sharedStrings[index] ?? "", number: null };
  }

  if (text && /^-?\d+(\.\d+)?$/.test(text)) {
    const number = Number(text);
    return { text: Number.isFinite(number) ? text : "", number: Number.isFinite(number) ? number : null };
  }

  return { text, number: null };
}

function emptyCell(): SheetCell {
  return { text: "", number: null };
}

function attribute(tag: string, name: string) {
  const match = new RegExp(`\\b${name}="([^"]*)"`).exec(tag);
  return match ? decodeXml(match[1]) : null;
}

function columnIndex(ref: string) {
  const letters = /^[A-Z]+/i.exec(ref)?.[0].toUpperCase() ?? "A";
  let index = 0;
  for (const letter of letters) {
    index = index * 26 + (letter.charCodeAt(0) - 64);
  }
  return index - 1;
}

function decodeXml(value: string) {
  return value
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, digits: string) => String.fromCodePoint(Number(digits)))
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

function matchAll(value: string, pattern: RegExp) {
  return [...value.matchAll(pattern)];
}

function createStoredZip(files: ZipEntry[]) {
  const locals: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const name = encoder.encode(file.name);
    const crc = crc32(file.data);
    const local = new Uint8Array(30 + name.length);
    writeU32(local, 0, 0x04034b50);
    writeU16(local, 4, 20);
    writeU16(local, 6, 0x800);
    writeU16(local, 8, 0);
    writeU32(local, 14, crc);
    writeU32(local, 18, file.data.length);
    writeU32(local, 22, file.data.length);
    writeU16(local, 26, name.length);
    local.set(name, 30);
    locals.push(local, file.data);

    const directory = new Uint8Array(46 + name.length);
    writeU32(directory, 0, 0x02014b50);
    writeU16(directory, 4, 20);
    writeU16(directory, 6, 20);
    writeU16(directory, 8, 0x800);
    writeU32(directory, 16, crc);
    writeU32(directory, 20, file.data.length);
    writeU32(directory, 24, file.data.length);
    writeU16(directory, 28, name.length);
    writeU32(directory, 42, offset);
    directory.set(name, 46);
    central.push(directory);
    offset += local.length + file.data.length;
  }

  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const eocd = new Uint8Array(22);
  writeU32(eocd, 0, 0x06054b50);
  writeU16(eocd, 8, files.length);
  writeU16(eocd, 10, files.length);
  writeU32(eocd, 12, centralSize);
  writeU32(eocd, 16, offset);
  return concat([...locals, ...central, eocd]);
}

async function readStoredZip(bytes: Uint8Array) {
  const eocd = findEocd(bytes);
  const count = readU16(bytes, eocd + 8);
  const size = readU32(bytes, eocd + 12);
  let offset = readU32(bytes, eocd + 16);
  if (count > 64 || size > MAX_BYTES || offset + size > bytes.length) {
    throw new Error("That Excel file could not be read.");
  }

  const entries: ZipEntry[] = [];
  for (let index = 0; index < count; index += 1) {
    if (readU32(bytes, offset) !== 0x02014b50) {
      throw new Error("That Excel file could not be read.");
    }

    const method = readU16(bytes, offset + 10);
    const compressedSize = readU32(bytes, offset + 20);
    const uncompressedSize = readU32(bytes, offset + 24);
    const nameLength = readU16(bytes, offset + 28);
    const extraLength = readU16(bytes, offset + 30);
    const commentLength = readU16(bytes, offset + 32);
    const localOffset = readU32(bytes, offset + 42);
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    offset += 46 + nameLength + extraLength + commentLength;

    if (
      compressedSize > MAX_BYTES ||
      uncompressedSize > MAX_BYTES ||
      localOffset + 30 > bytes.length
    ) {
      throw new Error("That Excel file could not be read.");
    }

    const localNameLength = readU16(bytes, localOffset + 26);
    const localExtraLength = readU16(bytes, localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.subarray(dataStart, dataStart + compressedSize);
    if (dataStart + compressedSize > bytes.length) {
      throw new Error("That Excel file could not be read.");
    }

    entries.push({
      name,
      data: await unzipEntry(method, compressed, uncompressedSize),
    });
  }

  return entries;
}

async function unzipEntry(method: number, compressed: Uint8Array, uncompressedSize: number) {
  if (method === 0) {
    return compressed.slice();
  }

  if (method !== 8) {
    throw new Error("That Excel file could not be read.");
  }

  const source = compressed.buffer.slice(
    compressed.byteOffset,
    compressed.byteOffset + compressed.byteLength,
  ) as ArrayBuffer;
  const stream = new Blob([source]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  const inflated = new Uint8Array(await new Response(stream).arrayBuffer());
  if (inflated.byteLength > MAX_BYTES || inflated.byteLength !== uncompressedSize) {
    throw new Error("That Excel file could not be read.");
  }

  return inflated;
}

function findEocd(bytes: Uint8Array) {
  const start = Math.max(0, bytes.length - 22 - 65535);
  for (let offset = bytes.length - 22; offset >= start; offset -= 1) {
    if (readU32(bytes, offset) !== 0x06054b50) {
      continue;
    }

    const commentLength = readU16(bytes, offset + 20);
    if (offset + 22 + commentLength === bytes.length) {
      return offset;
    }
  }

  throw new Error("Choose an .xlsx spreadsheet.");
}

function crc32(data: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function concat(parts: Uint8Array[]) {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function readU16(bytes: Uint8Array, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readU32(bytes: Uint8Array, offset: number) {
  return (
    (bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)) >>>
    0
  );
}

function writeU16(bytes: Uint8Array, offset: number, value: number) {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
}

function writeU32(bytes: Uint8Array, offset: number, value: number) {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
  bytes[offset + 3] = (value >>> 24) & 0xff;
}

const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Staff" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`;

const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="1"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts>
  <fills count="2">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
  </fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="3">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
    <xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
