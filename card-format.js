export const PERSONA_CARD_SPEC = 'sillytavern_persona';
export const PERSONA_CARD_VERSION = '1.1';

const SUPPORTED_VERSIONS = new Set(['1.0', '1.1']);

const PNG_KEYWORD = 'st_persona';
const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const MAX_METADATA_BYTES = 1024 * 1024;
const VALID_POSITIONS = new Set([0, 1, 2, 3, 4, 9]);
const VALID_ROLES = new Set([0, 1, 2]);

/** @type {Uint32Array|null} */
let crcTable = null;

function getCrcTable() {
    if (crcTable) return crcTable;

    crcTable = new Uint32Array(256);
    for (let index = 0; index < 256; index++) {
        let value = index;
        for (let bit = 0; bit < 8; bit++) {
            value = (value & 1) ? (0xEDB88320 ^ (value >>> 1)) : (value >>> 1);
        }
        crcTable[index] = value >>> 0;
    }
    return crcTable;
}

function crc32(bytes) {
    const table = getCrcTable();
    let crc = 0xFFFFFFFF;
    for (const byte of bytes) {
        crc = table[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

function concatBytes(parts) {
    const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
    let offset = 0;
    for (const part of parts) {
        result.set(part, offset);
        offset += part.length;
    }
    return result;
}

function uint32Bytes(value) {
    const bytes = new Uint8Array(4);
    new DataView(bytes.buffer).setUint32(0, value, false);
    return bytes;
}

function bytesToString(bytes) {
    let value = '';
    const blockSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += blockSize) {
        value += String.fromCharCode(...bytes.subarray(offset, offset + blockSize));
    }
    return value;
}

function bytesToBase64(bytes) {
    return btoa(bytesToString(bytes));
}

function base64ToBytes(value) {
    let binary;
    try {
        binary = atob(value);
    } catch {
        throw new Error('INVALID_METADATA');
    }

    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) {
        bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
}

function assertPng(bytes) {
    if (bytes.length < PNG_SIGNATURE.length || PNG_SIGNATURE.some((byte, index) => bytes[index] !== byte)) {
        throw new Error('NOT_PNG');
    }
}

function parseChunks(bytes) {
    assertPng(bytes);
    const chunks = [];
    let offset = PNG_SIGNATURE.length;

    while (offset + 12 <= bytes.length) {
        const length = new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, false);
        const end = offset + 12 + length;
        if (end > bytes.length) throw new Error('INVALID_PNG');

        const typeBytes = bytes.slice(offset + 4, offset + 8);
        const type = String.fromCharCode(...typeBytes);
        const data = bytes.slice(offset + 8, offset + 8 + length);
        const storedCrc = new DataView(bytes.buffer, bytes.byteOffset + offset + 8 + length, 4).getUint32(0, false);
        chunks.push({ type, typeBytes, data, storedCrc, raw: bytes.slice(offset, end) });
        offset = end;

        if (type === 'IEND') break;
    }

    if (!chunks.length || chunks.at(-1).type !== 'IEND') throw new Error('INVALID_PNG');
    return chunks;
}

function createChunk(type, data) {
    const typeBytes = new TextEncoder().encode(type);
    const crc = crc32(concatBytes([typeBytes, data]));
    return concatBytes([uint32Bytes(data.length), typeBytes, data, uint32Bytes(crc)]);
}

function decodeTextChunk(chunk) {
    let separator = -1;
    for (let index = 0; index < Math.min(chunk.data.length, 80); index++) {
        if (chunk.data[index] === 0) {
            separator = index;
            break;
        }
    }
    if (separator < 1) return null;

    const keyword = bytesToString(chunk.data.subarray(0, separator));
    if (keyword !== PNG_KEYWORD) return null;
    if (chunk.data.length > MAX_METADATA_BYTES) throw new Error('METADATA_TOO_LARGE');

    const actualCrc = crc32(concatBytes([chunk.typeBytes, chunk.data]));
    if (actualCrc !== chunk.storedCrc) throw new Error('INVALID_METADATA');

    const encodedJson = bytesToString(chunk.data.subarray(separator + 1));
    const jsonBytes = base64ToBytes(encodedJson);
    if (jsonBytes.length > MAX_METADATA_BYTES) throw new Error('METADATA_TOO_LARGE');
    return new TextDecoder().decode(jsonBytes);
}

function stringField(value, fallback = '') {
    return typeof value === 'string' ? value : fallback;
}

function normalizeConnections(value) {
    if (!Array.isArray(value)) return [];
    return value.slice(0, 500).flatMap(connection => {
        if (!connection || typeof connection !== 'object') return [];
        const type = connection.type === 'character' || connection.type === 'group' ? connection.type : '';
        const id = stringField(connection.id).trim();
        if (!type || !id) return [];
        return [{ type, id, name: stringField(connection.name).trim() }];
    });
}

/**
 * Creates a normalized v1 persona card document.
 * @param {object} data Persona data
 * @returns {{spec:string, spec_version:string, data:object}}
 */
export function createPersonaCard(data) {
    return validatePersonaCard({
        spec: PERSONA_CARD_SPEC,
        spec_version: PERSONA_CARD_VERSION,
        data,
    });
}

/**
 * Validates and normalizes a persona card document.
 * @param {unknown} value Parsed card value
 * @returns {{spec:string, spec_version:string, data:{avatar_id:string,name:string,description:string,title:string,position:number,depth:number,role:number,lorebook:string,connections_included:boolean,connections:Array<object>}}}
 */
export function validatePersonaCard(value) {
    if (!value || typeof value !== 'object') throw new Error('INVALID_CARD');
    if (value.spec !== PERSONA_CARD_SPEC) throw new Error('INVALID_SPEC');
    if (!SUPPORTED_VERSIONS.has(value.spec_version)) throw new Error('UNSUPPORTED_VERSION');
    if (!value.data || typeof value.data !== 'object') throw new Error('INVALID_CARD');

    const source = value.data;
    const name = stringField(source.name).trim();
    const avatarId = stringField(source.avatar_id).trim();
    if (!name || !avatarId) throw new Error('INVALID_CARD');

    const position = Number(source.position);
    const depth = Number(source.depth);
    const role = Number(source.role);
    const connectionsIncluded = value.spec_version !== '1.0' && source.connections_included === true;

    return {
        spec: PERSONA_CARD_SPEC,
        spec_version: PERSONA_CARD_VERSION,
        data: {
            avatar_id: avatarId,
            name,
            description: stringField(source.description),
            title: stringField(source.title),
            position: VALID_POSITIONS.has(position) ? position : 0,
            depth: Number.isInteger(depth) && depth >= 0 && depth <= 9999 ? depth : 2,
            role: VALID_ROLES.has(role) ? role : 0,
            lorebook: stringField(source.lorebook).trim(),
            connections_included: connectionsIncluded,
            connections: connectionsIncluded ? normalizeConnections(source.connections) : [],
        },
    };
}

/**
 * Adds persona metadata to a PNG, replacing any existing Persona Cards chunk.
 * @param {ArrayBuffer|Uint8Array} png PNG bytes
 * @param {object} card Persona card document
 * @returns {Uint8Array}
 */
export function embedPersonaCardInPng(png, card) {
    const bytes = png instanceof Uint8Array ? png : new Uint8Array(png);
    const chunks = parseChunks(bytes);
    const normalized = validatePersonaCard(card);
    const jsonBytes = new TextEncoder().encode(JSON.stringify(normalized));
    if (jsonBytes.length > MAX_METADATA_BYTES) throw new Error('METADATA_TOO_LARGE');

    const keyword = new TextEncoder().encode(`${PNG_KEYWORD}\0`);
    const textData = concatBytes([keyword, new TextEncoder().encode(bytesToBase64(jsonBytes))]);
    const personaChunk = createChunk('tEXt', textData);
    const output = [PNG_SIGNATURE];

    for (const chunk of chunks) {
        const isPersonaChunk = chunk.type === 'tEXt' && decodeTextChunk(chunk) !== null;
        if (isPersonaChunk) continue;
        if (chunk.type === 'IEND') output.push(personaChunk);
        output.push(chunk.raw);
    }

    return concatBytes(output);
}

/**
 * Extracts and validates persona metadata from a PNG.
 * @param {ArrayBuffer|Uint8Array} png PNG bytes
 * @returns {{spec:string, spec_version:string, data:object}}
 */
export function extractPersonaCardFromPng(png) {
    const bytes = png instanceof Uint8Array ? png : new Uint8Array(png);
    const chunks = parseChunks(bytes);
    let json = null;

    for (const chunk of chunks) {
        if (chunk.type !== 'tEXt') continue;
        const decoded = decodeTextChunk(chunk);
        if (decoded !== null) json = decoded;
    }

    if (json === null) throw new Error('NO_PERSONA_DATA');

    try {
        return validatePersonaCard(JSON.parse(json));
    } catch (error) {
        if (error instanceof Error && error.message !== 'INVALID_METADATA') throw error;
        throw new Error('INVALID_METADATA');
    }
}
