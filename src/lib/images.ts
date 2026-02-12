import mergeImages from "merge-images";

export async function resizeImage(
  base64Str: string,
  MAX_WIDTH: number,
  MAX_HEIGHT: number | undefined = undefined,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();

    const canvas: HTMLCanvasElement = document.createElement("canvas");
    img.onload = () => {
      let width = img.width;
      let height = img.height;

      // if only MAX_WIDTH  niether width or height can be bigger, but wee have to keep the aspect ratio
      if (MAX_HEIGHT === undefined) {
        if (width > MAX_WIDTH) {
          height *= MAX_WIDTH / width;
          width = MAX_WIDTH;
        }
        if (height > MAX_WIDTH) {
          width *= MAX_WIDTH / height;
          height = MAX_WIDTH;
        }
      } else {
        if (width > MAX_WIDTH || height > MAX_HEIGHT) {
          let aspect = width / height;
          if (width > MAX_WIDTH) {
            width = MAX_WIDTH;
            height = width / aspect;
          }
          if (height > MAX_HEIGHT) {
            height = MAX_HEIGHT;
            width = height * aspect;
          }
        }
      }

      //console.log('Resizing image to', MAX_WIDTH, width, height);
      canvas.width = width;
      canvas.height = height;
      const ctx: CanvasRenderingContext2D | null = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL());
      }
      resolve(base64Str);
    };
    img.src = base64Str;
  });
}

export function cropImage(
  imgUri: string,
  width: number = 400,
  height: number = 300,
  xstart: number = 0,
  ystart: number = 0,
): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      let resize_canvas = document.createElement("canvas");
      let orig_src = new Image();
      orig_src.src = imgUri;
      orig_src.onload = function () {
        resize_canvas.width = width;
        resize_canvas.height = height;
        let cnv = resize_canvas.getContext("2d") as CanvasRenderingContext2D;
        cnv.drawImage(
          orig_src,
          xstart,
          ystart,
          width,
          height,
          0,
          0,
          width,
          height,
        );
        let newimgUri: string = resize_canvas.toDataURL("image/png").toString();
        resolve(newimgUri);
      };
    } catch (e) {
      console.log("Couldn't crop image due to", e);
      reject();
    }
  });
}

// calculate image height
export async function getImageHeight(base64Image: string): Promise<{
  src: string;
  height: number;
}> {
  // get image height
  const img = new Image();
  img.src = base64Image;
  return new Promise((resolve, reject) => {
    img.onload = () => {
      resolve({
        src: base64Image,
        height: img.height,
      });
    };
  });
}

export async function merge(base64Images: string[]): Promise<string> {
  // get all images heights and merge them under each other
  const srcs = await Promise.all(base64Images.map(getImageHeight));
  let y = 0;
  const images = srcs.map((o, index) => {
    const r = {
      src: o.src,
      x: 0,
      y: y,
    };
    y += o.height;
    return r;
  });

  return await mergeImages(images, {
    height: y,
  });
}

// Helper function to get image MIME type from ArrayBuffer
export function getImageMimeTypeFromBuffer(
  input: ArrayBuffer | string,
): string {
  let arr: Uint8Array;
  if (typeof input === "string") {
    // Detect and strip data URL prefix if present
    let base64String = input;
    if (base64String.startsWith("data:")) {
      const commaIndex = base64String.indexOf(",");
      if (commaIndex === -1) {
        // Invalid data URL, no comma found
        return undefined;
      }
      // Extract the part after the comma
      base64String = base64String.slice(commaIndex + 1);
    }

    // Decode base64 into a binary string
    const binaryString = atob(base64String);
    const length = binaryString.length;
    arr = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
      arr[i] = binaryString.charCodeAt(i);
    }
  } else {
    arr = new Uint8Array(input);
  }

  // Extract the first 4 bytes (enough to identify most formats)
  const header = Array.from(arr.subarray(0, 4))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Check the header bytes for common image formats
  if (header.startsWith("ffd8ff")) {
    return "image/jpg";
  } else if (header.startsWith("89504e47")) {
    return "image/png";
  } else if (header.startsWith("47494638")) {
    return "image/jpeg";
  } else if (header.startsWith("424d")) {
    return "image/bmp";
  } else if (header.startsWith("49492a00") || header.startsWith("4d4d002a")) {
    return "image/tiff";
  } else if (header.startsWith("52494646")) {
    const riffType = Array.from(arr.subarray(8, 12))
      .map((b) => String.fromCharCode(b))
      .join("");
    if (riffType === "WEBP") {
      return "image/webp";
    }
    return "application/octet-stream";
  } else {
    return "application/octet-stream";
  }
}
