interface uint8ArrayToHexOptions {
  pretty?: boolean
}

export function uint8ArrayConcat(arrays: Uint8Array[]) {
  const totalLength = arrays.reduce((acc, arr) => acc + arr.length, 0);
  const result = new Uint8Array(totalLength);

  let offset = 0;
  for(const array of arrays) {
    result.set(array, offset);
    offset += array.length;
  }

  return result;
}

export function hexToUint8Array(hexString: string, maxLength: number): Uint8Array {
  const hex = hexString.startsWith('0x') ? hexString.substring(2) : hexString;
  const bytes = new Uint8Array(hex.length / 2);
  for (let c = 0; c < hex.length; c += 2) {
    const byte = parseInt(hex.substring(c, c + 2), 16);
    if (Number.isNaN(byte)) {
      throw new Error(`Invalid hex character at position ${c}`);
    }
    bytes[c / 2] = byte;
    if (bytes.length === maxLength) {
      break;
    }
  }

  return bytes;
}

export function uint8ArrayToHex(bytes: Uint8Array, opts?: uint8ArrayToHexOptions): string {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join(opts?.pretty ? ' ' : '');
}

export function uint8ArrayToHexPretty(bytes: Uint8Array) {
  return uint8ArrayToHex(bytes, { pretty: true });
}

export function delay(duration: number) {
  return new Promise((resolve: Function) => setTimeout(() => resolve(), duration))
}