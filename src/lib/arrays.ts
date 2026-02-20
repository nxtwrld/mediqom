// convert typed array (Uint8Array) to ArrayBuffer
export function typedArrayToBuffer(array: Uint8Array): ArrayBuffer {
  // Handle both ArrayBuffer and SharedArrayBuffer
  const buffer = array.buffer;
  // Check if SharedArrayBuffer exists and if buffer is an instance of it
  if (
    typeof SharedArrayBuffer !== "undefined" &&
    buffer instanceof SharedArrayBuffer
  ) {
    // Convert SharedArrayBuffer to ArrayBuffer
    const arrayBuffer = new ArrayBuffer(array.byteLength);
    new Uint8Array(arrayBuffer).set(array);
    return arrayBuffer;
  }
  // At this point, buffer is guaranteed to be ArrayBuffer
  return (buffer as ArrayBuffer).slice(
    array.byteOffset,
    array.byteLength + array.byteOffset,
  );
}

export async function toBase64(array: ArrayBuffer): Promise<string> {
  return new Promise((resolve) => {
    const blob = new Blob([array]);
    const reader = new FileReader();

    reader.onload = (event: Event) => {
      const dataUrl = reader.result as string;
      const [_, base64] = dataUrl.split(",");

      resolve(base64);
    };

    reader.readAsDataURL(blob);
  });
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  var binaryString = atob(base64);
  var bytes = new Uint8Array(binaryString.length);
  for (var i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  // Use typedArrayToBuffer to handle potential SharedArrayBuffer
  return typedArrayToBuffer(bytes);
}

export function stringToUint(str: string) {
  const binary_string: string = atob(str);
  const len: number = binary_string.length;
  let bytes: Uint8Array = new Uint8Array(len);
  for (var i = 0; i < len; i++) {
    bytes[i] = binary_string.charCodeAt(i);
  }
  return bytes;
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  var binary = "";
  var bytes = new Uint8Array(buffer);
  var len = bytes.byteLength;
  for (var i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}
