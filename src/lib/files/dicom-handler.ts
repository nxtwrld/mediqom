/**
 * DICOM File Handler
 *
 * Handles client-side DICOM file processing using Cornerstone3D
 * - Detects DICOM files by header magic bytes (not file extension)
 * - Extracts metadata from DICOM tags
 * - Converts DICOM images to PNG format for AI processing
 * - Preserves original DICOM data for attachment storage
 *
 * IMPORTANT: This module only works in browser environments due to Cornerstone3D dependencies
 */

import { browser } from "$app/environment";
import { resizeImage } from "$lib/images";
import { THUMBNAIL_SIZE } from "$lib/files/CONFIG";

export interface DicomMetadata {
  // Patient Information
  patientName?: string;
  patientId?: string;
  patientBirthDate?: string;
  patientSex?: string;

  // Study Information
  studyDate?: string;
  studyTime?: string;
  studyDescription?: string;
  studyInstanceUID?: string;
  accessionNumber?: string;

  // Series Information
  seriesInstanceUID?: string;
  seriesNumber?: string;
  seriesDescription?: string;
  modality?: string;

  // Image Information
  instanceNumber?: string;
  sopInstanceUID?: string;
  bodyPartExamined?: string;
  viewPosition?: string;

  // Institution Information
  institutionName?: string;
  stationName?: string;
  referringPhysician?: string;
  performingPhysician?: string;

  // Technical Parameters
  rows?: number;
  columns?: number;
  pixelSpacing?: number[];
  sliceThickness?: number;
  windowCenter?: number[];
  windowWidth?: number[];

  // Processing Metadata
  extractedAt: string;
  fileSize: number;
  fileName: string;
}

export interface DicomProcessingResult {
  extractedImages: string[]; // Base64 PNG images for AI processing
  metadata: DicomMetadata; // Extracted DICOM metadata
  originalDicomBuffer: ArrayBuffer; // Original DICOM file for attachment
  thumbnails: string[]; // Smaller versions for UI preview
}

export class DicomHandler {
  private isInitialized = false;
  private dicomParser: any = null;
  private cs3d: any = null;

  /**
   * Initialize Cornerstone3D and dicom-parser
   * BROWSER ONLY - will throw error if called server-side
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    if (!browser) {
      throw new Error(
        "DICOM Handler can only be initialized in browser environment",
      );
    }

    try {
      console.log("[DICOM] Loading Cornerstone3D modules...");

      // Initialize Cornerstone3D via shared initializer
      const { getCornerstone3D } = await import(
        "$lib/files/cornerstone3d-init"
      );
      this.cs3d = await getCornerstone3D();

      // Load dicom-parser separately for metadata extraction
      const dpMod = await import("dicom-parser");
      this.dicomParser = dpMod.default || dpMod;

      this.isInitialized = true;
      console.log("[DICOM] Handler initialized successfully");
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error("[DICOM] Failed to initialize Handler:", error);
      throw new Error(`DICOM Handler initialization failed: ${errorMessage}`);
    }
  }

  /**
   * Detect if a file is a DICOM file by examining file header
   * BROWSER ONLY - returns false if called server-side
   */
  async detectDicomFile(file: File): Promise<boolean> {
    if (!browser) {
      console.warn(
        "[DICOM] detectDicomFile called server-side, returning false",
      );
      return false;
    }

    try {
      if (file.type === "application/dicom") {
        return true;
      }

      const dicomExtensions = [
        ".dcm",
        ".dicom",
        ".dic",
        ".DCM",
        ".DICOM",
        ".DIC",
      ];
      const fileName = file.name.toLowerCase();
      const hasValidExtension = dicomExtensions.some((ext) =>
        fileName.endsWith(ext.toLowerCase()),
      );
      if (hasValidExtension) {
        return true;
      }

      const headerBuffer = await this.readFileHeader(file, 132);
      const headerBytes = new Uint8Array(headerBuffer);

      if (headerBytes.length >= 132) {
        const dicmBytes = headerBytes.slice(128, 132);
        const dicmString = String.fromCharCode(...dicmBytes);
        if (dicmString === "DICM") {
          return true;
        }
      }

      if (headerBytes.length >= 8) {
        const firstTag = this.readUint16LE(headerBytes, 0);
        if (
          firstTag === 0x0002 ||
          firstTag === 0x0008 ||
          firstTag === 0x0010 ||
          firstTag === 0x0018 ||
          firstTag === 0x0020 ||
          firstTag === 0x0028
        ) {
          return true;
        }
      }

      return false;
    } catch (error) {
      console.warn("[DICOM] Error detecting DICOM file:", error);
      return false;
    }
  }

  private async readFileHeader(
    file: File,
    bytes: number,
  ): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = reject;
      reader.readAsArrayBuffer(file.slice(0, bytes));
    });
  }

  private readUint16LE(bytes: Uint8Array, offset: number): number {
    return bytes[offset] | (bytes[offset + 1] << 8);
  }

  /**
   * Main processing function - extract images and metadata from DICOM file
   */
  async processDicomFile(file: File): Promise<DicomProcessingResult> {
    if (!browser) {
      throw new Error(
        "DICOM processing can only be performed in browser environment",
      );
    }

    await this.initialize();

    try {
      const arrayBuffer = await file.arrayBuffer();
      const byteArray = new Uint8Array(arrayBuffer);
      const dataSet = this.dicomParser.parseDicom(byteArray);
      const metadata = this.extractMetadata(dataSet, file);
      const extractedImages = await this.extractImages(file);
      const thumbnails = await this.createThumbnails(extractedImages);

      return {
        extractedImages,
        metadata,
        originalDicomBuffer: arrayBuffer,
        thumbnails,
      };
    } catch (error) {
      console.error("[DICOM] Error processing DICOM file:", error);
      throw new Error(`DICOM processing failed: ${(error as Error).message}`);
    }
  }

  private extractMetadata(dataSet: any, file: File): DicomMetadata {
    try {
      return {
        patientName: this.getStringValue(dataSet, "x00100010"),
        patientId: this.getStringValue(dataSet, "x00100020"),
        patientBirthDate: this.getStringValue(dataSet, "x00100030"),
        patientSex: this.getStringValue(dataSet, "x00100040"),
        studyDate: this.getStringValue(dataSet, "x00080020"),
        studyTime: this.getStringValue(dataSet, "x00080030"),
        studyDescription: this.getStringValue(dataSet, "x00081030"),
        studyInstanceUID: this.getStringValue(dataSet, "x0020000d"),
        accessionNumber: this.getStringValue(dataSet, "x00080050"),
        seriesInstanceUID: this.getStringValue(dataSet, "x0020000e"),
        seriesNumber: this.getStringValue(dataSet, "x00200011"),
        seriesDescription: this.getStringValue(dataSet, "x0008103e"),
        modality: this.getStringValue(dataSet, "x00080060"),
        instanceNumber: this.getStringValue(dataSet, "x00200013"),
        sopInstanceUID: this.getStringValue(dataSet, "x00080018"),
        bodyPartExamined: this.getStringValue(dataSet, "x00180015"),
        viewPosition: this.getStringValue(dataSet, "x00185101"),
        institutionName: this.getStringValue(dataSet, "x00080080"),
        stationName: this.getStringValue(dataSet, "x00081010"),
        referringPhysician: this.getStringValue(dataSet, "x00080090"),
        performingPhysician: this.getStringValue(dataSet, "x00081050"),
        rows: this.getNumberValue(dataSet, "x00280010"),
        columns: this.getNumberValue(dataSet, "x00280011"),
        pixelSpacing: this.parsePixelSpacing(
          this.getStringValue(dataSet, "x00280030"),
        ),
        sliceThickness: this.getNumberValue(dataSet, "x00180050"),
        windowCenter: this.parseNumberArray(
          this.getStringValue(dataSet, "x00281050"),
        ),
        windowWidth: this.parseNumberArray(
          this.getStringValue(dataSet, "x00281051"),
        ),
        extractedAt: new Date().toISOString(),
        fileSize: file.size,
        fileName: file.name,
      };
    } catch (error) {
      console.error("[DICOM] Error extracting metadata:", error);
      return {
        extractedAt: new Date().toISOString(),
        fileSize: file.size,
        fileName: file.name,
      };
    }
  }

  /**
   * Extract PNG images from DICOM file using Cornerstone3D offscreen rendering
   */
  private async extractImages(file: File): Promise<string[]> {
    try {
      const pngDataUrl = await this.loadDICOMAndConvertToPNG(file, 512, 512);
      if (!pngDataUrl) {
        throw new Error("Failed to convert DICOM to PNG");
      }
      return [pngDataUrl];
    } catch (error) {
      console.error("[DICOM] Error extracting images:", error);
      throw new Error(`Image extraction failed: ${(error as Error).message}`);
    }
  }

  /**
   * Load DICOM file and convert to PNG using Cornerstone3D stack viewport
   */
  private async loadDICOMAndConvertToPNG(
    file: File,
    width: number,
    height: number,
  ): Promise<string | null> {
    const { core, dicomImageLoader } = this.cs3d;

    const imageId = dicomImageLoader.wadouri.fileManager.add(file);

    // Create an offscreen container
    const container = document.createElement("div");
    container.setAttribute(
      "style",
      `position: absolute; top: -10000px; left: -10000px; z-index: -10000; width: ${width}px; height: ${height}px;`,
    );
    document.body.appendChild(container);

    const engineId = "dicom-png-export-" + Date.now();
    let renderingEngine: any = null;

    try {
      renderingEngine = new core.RenderingEngine(engineId);

      renderingEngine.enableElement({
        viewportId: "export-vp",
        element: container,
        type: core.Enums.ViewportType.STACK,
      });

      const viewport = renderingEngine.getViewport("export-vp");
      await viewport.setStack([imageId], 0);

      // Wait for render
      renderingEngine.render();

      // Give it a frame to render
      await new Promise((resolve) => requestAnimationFrame(resolve));
      await new Promise((resolve) => requestAnimationFrame(resolve));

      const canvas = container.querySelector("canvas");
      const dataUrl = canvas?.toDataURL("image/png");

      return dataUrl || null;
    } catch (error) {
      console.error("[DICOM] Error converting to PNG:", error);
      return null;
    } finally {
      if (renderingEngine) {
        renderingEngine.destroy();
      }
      document.body.removeChild(container);
    }
  }

  private async createThumbnails(
    images: string[],
    maxSize: number = THUMBNAIL_SIZE,
  ): Promise<string[]> {
    const thumbnails: string[] = [];
    for (const imageDataUrl of images) {
      try {
        const thumbnail = await resizeImage(imageDataUrl, maxSize);
        thumbnails.push(thumbnail);
      } catch (error) {
        console.error("[DICOM] Error creating thumbnail:", error);
        thumbnails.push(imageDataUrl);
      }
    }
    return thumbnails;
  }

  private getStringValue(dataSet: any, tag: string): string | undefined {
    try {
      return dataSet.string(tag);
    } catch {
      return undefined;
    }
  }

  private getNumberValue(dataSet: any, tag: string): number | undefined {
    try {
      const value = dataSet.intString(tag);
      return value !== undefined ? parseInt(value) : undefined;
    } catch {
      return undefined;
    }
  }

  private parsePixelSpacing(value: string | undefined): number[] | undefined {
    if (!value) return undefined;
    try {
      return value.split("\\").map((v) => parseFloat(v.trim()));
    } catch {
      return undefined;
    }
  }

  private parseNumberArray(value: string | undefined): number[] | undefined {
    if (!value) return undefined;
    try {
      return value.split("\\").map((v) => parseFloat(v.trim()));
    } catch {
      return [parseFloat(value)];
    }
  }
}

// Create singleton instance
export const dicomHandler = new DicomHandler();
