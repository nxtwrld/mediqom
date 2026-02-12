/**
 * DICOM File Handler
 *
 * Handles client-side DICOM file processing using Cornerstone.js
 * - Detects DICOM files by header magic bytes (not file extension)
 * - Extracts metadata from DICOM tags
 * - Converts DICOM images to PNG format for AI processing
 * - Preserves original DICOM data for attachment storage
 *
 * IMPORTANT: This module only works in browser environments due to Cornerstone.js dependencies
 */

// Dynamic imports to avoid UI crashes - cornerstone has publicPath issues with static imports
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
  private cornerstone: any = null;
  private cornerstoneWADOImageLoader: any = null;
  private dicomParser: any = null;

  /**
   * Initialize with currentScript fix for publicPath issue
   * BROWSER ONLY - will throw error if called server-side
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    // Critical: Only initialize in browser environment
    if (!browser) {
      throw new Error(
        "DICOM Handler can only be initialized in browser environment",
      );
    }

    try {
      // Fix for publicPath issue - ensure document.currentScript exists
      if (typeof document !== "undefined" && !document.currentScript) {
        const script = document.createElement("script");
        script.setAttribute("src", window.location.origin + "/");
        Object.defineProperty(document, "currentScript", {
          value: script,
          configurable: true,
        });
      }

      // Dynamic imports - only safe in browser
      console.log("[DICOM] Loading Cornerstone modules...");
      this.cornerstone = await import("cornerstone-core");
      this.cornerstoneWADOImageLoader = await import(
        "cornerstone-wado-image-loader"
      );
      this.dicomParser = await import("dicom-parser");

      // Configure external dependencies (like working code)
      this.cornerstoneWADOImageLoader.external.dicomParser = this.dicomParser;
      this.cornerstoneWADOImageLoader.external.cornerstone = this.cornerstone;

      this.isInitialized = true;
      console.log("✅ DICOM Handler initialized successfully");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("❌ Failed to initialize DICOM Handler:", error);
      throw new Error(`DICOM Handler initialization failed: ${errorMessage}`);
    }
  }

  /**
   * Detect if a file is a DICOM file by examining file header
   * Most DICOM files don't have extensions, so we check the magic bytes
   * BROWSER ONLY - returns false if called server-side
   */
  async detectDicomFile(file: File): Promise<boolean> {
    // Fail gracefully on server side
    if (!browser) {
      console.warn(
        "[DICOM] detectDicomFile called server-side, returning false",
      );
      return false;
    }

    try {
      // First check by MIME type (if available)
      if (file.type === "application/dicom") {
        return true;
      }

      // Check by file extension as secondary method
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

      // Primary method: Check DICOM header magic bytes
      // Read first 132 bytes to check for DICOM preamble and prefix
      const headerBuffer = await this.readFileHeader(file, 132);
      const headerBytes = new Uint8Array(headerBuffer);

      // DICOM files have a 128-byte preamble followed by 'DICM' (0x4449434D)
      if (headerBytes.length >= 132) {
        // Check for 'DICM' at offset 128
        const dicmBytes = headerBytes.slice(128, 132);
        const dicmString = String.fromCharCode(...dicmBytes);
        if (dicmString === "DICM") {
          return true;
        }
      }

      // Some DICOM files might not have the preamble, check for common DICOM tags at the beginning
      // Look for common Group 0002 or Group 0008 elements
      if (headerBytes.length >= 8) {
        const firstTag = this.readUint16LE(headerBytes, 0);
        const secondTag = this.readUint16LE(headerBytes, 2);

        // Common DICOM groups: 0002 (File Meta Information), 0008 (Identifying Information)
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
      console.warn("⚠️ Error detecting DICOM file:", error);
      return false;
    }
  }

  /**
   * Read the first N bytes of a file
   */
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

  /**
   * Read 16-bit little-endian integer from byte array
   */
  private readUint16LE(bytes: Uint8Array, offset: number): number {
    return bytes[offset] | (bytes[offset + 1] << 8);
  }

  /**
   * Main processing function - extract images and metadata from DICOM file
   */
  async processDicomFile(file: File): Promise<DicomProcessingResult> {
    // Critical: Only process in browser environment
    if (!browser) {
      throw new Error(
        "DICOM processing can only be performed in browser environment",
      );
    }

    await this.initialize();

    try {
      const arrayBuffer = await file.arrayBuffer();

      // Parse DICOM file
      const byteArray = new Uint8Array(arrayBuffer);
      const dataSet = this.dicomParser.parseDicom(byteArray);

      // Extract metadata
      const metadata = this.extractMetadata(dataSet, file);

      // Extract images
      const extractedImages = await this.extractImages(file, dataSet);

      // Create thumbnails
      const thumbnails = await this.createThumbnails(extractedImages);

      return {
        extractedImages,
        metadata,
        originalDicomBuffer: arrayBuffer,
        thumbnails,
      };
    } catch (error) {
      console.error("❌ Error processing DICOM file:", error);
      throw new Error(`DICOM processing failed: ${(error as Error).message}`);
    }
  }

  /**
   * Extract DICOM metadata from parsed dataset
   */
  private extractMetadata(dataSet: any, file: File): DicomMetadata {
    try {
      return {
        // Patient Information
        patientName: this.getStringValue(dataSet, "x00100010"),
        patientId: this.getStringValue(dataSet, "x00100020"),
        patientBirthDate: this.getStringValue(dataSet, "x00100030"),
        patientSex: this.getStringValue(dataSet, "x00100040"),

        // Study Information
        studyDate: this.getStringValue(dataSet, "x00080020"),
        studyTime: this.getStringValue(dataSet, "x00080030"),
        studyDescription: this.getStringValue(dataSet, "x00081030"),
        studyInstanceUID: this.getStringValue(dataSet, "x0020000d"),
        accessionNumber: this.getStringValue(dataSet, "x00080050"),

        // Series Information
        seriesInstanceUID: this.getStringValue(dataSet, "x0020000e"),
        seriesNumber: this.getStringValue(dataSet, "x00200011"),
        seriesDescription: this.getStringValue(dataSet, "x0008103e"),
        modality: this.getStringValue(dataSet, "x00080060"),

        // Image Information
        instanceNumber: this.getStringValue(dataSet, "x00200013"),
        sopInstanceUID: this.getStringValue(dataSet, "x00080018"),
        bodyPartExamined: this.getStringValue(dataSet, "x00180015"),
        viewPosition: this.getStringValue(dataSet, "x00185101"),

        // Institution Information
        institutionName: this.getStringValue(dataSet, "x00080080"),
        stationName: this.getStringValue(dataSet, "x00081010"),
        referringPhysician: this.getStringValue(dataSet, "x00080090"),
        performingPhysician: this.getStringValue(dataSet, "x00081050"),

        // Technical Parameters
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

        // Processing Metadata
        extractedAt: new Date().toISOString(),
        fileSize: file.size,
        fileName: file.name,
      };
    } catch (error) {
      console.error("❌ Error extracting DICOM metadata:", error);
      // Return basic metadata even if extraction fails
      return {
        extractedAt: new Date().toISOString(),
        fileSize: file.size,
        fileName: file.name,
      };
    }
  }

  /**
   * Extract PNG images from DICOM file using the proven DOM-based approach
   */
  private async extractImages(file: File, dataSet: any): Promise<string[]> {
    try {
      // Use the proven approach from working code
      const pngDataUrl = await this.loadDICOMAndConvertToPNG(file, 512, 512);

      if (!pngDataUrl) {
        throw new Error("Failed to convert DICOM to PNG");
      }

      // Return full data URL for proper system compatibility
      return [pngDataUrl];
    } catch (error) {
      console.error("❌ Error extracting DICOM images:", error);
      throw new Error(`Image extraction failed: ${(error as Error).message}`);
    }
  }

  /**
   * Load DICOM file and convert to PNG using DOM rendering (proven approach)
   */
  private async loadDICOMAndConvertToPNG(
    file: File,
    width: number,
    height: number,
  ): Promise<string | null> {
    const imageId =
      this.cornerstoneWADOImageLoader.wadouri.fileManager.add(file);

    // Create an off-screen canvas element
    const container = document.createElement("div");
    container.setAttribute(
      "style",
      `position: absolute; top: -10000px; left: -10000px; z-index: -10000; width: ${width}px; height: ${height}px;`,
    );
    document.body.appendChild(container);

    try {
      const image = await this.cornerstone.loadImage(imageId);
      this.cornerstone.enable(container);

      return new Promise((resolve, reject) => {
        const self = this;
        container.addEventListener(
          "cornerstoneimagerendered",
          function handler() {
            try {
              const canvas = container.querySelector("canvas");
              const dataUrl = canvas?.toDataURL("image/png");
              if (dataUrl) {
                resolve(dataUrl);
              } else {
                reject(new Error("Failed to get canvas data URL"));
              }
            } catch (error) {
              console.error("Error converting DICOM to PNG:", error);
              reject(error);
            } finally {
              // Cleanup
              self.cornerstone.disable(container);
              document.body.removeChild(container);
              container.removeEventListener(
                "cornerstoneimagerendered",
                handler,
              );
            }
          },
          { once: true },
        );

        this.cornerstone.displayImage(container, image);
      });
    } catch (error) {
      console.error("Error loading DICOM image:", error);
      this.cornerstone.disable(container);
      document.body.removeChild(container);
      return null;
    }
  }

  /**
   * Create thumbnails from extracted images
   */
  private async createThumbnails(
    images: string[],
    maxSize: number = THUMBNAIL_SIZE,
  ): Promise<string[]> {
    const thumbnails: string[] = [];

    for (const imageDataUrl of images) {
      try {
        // Use system resizeImage function for consistency
        const thumbnail = await resizeImage(imageDataUrl, maxSize);
        thumbnails.push(thumbnail);
      } catch (error) {
        console.error("❌ Error creating thumbnail:", error);
        // Use original image as fallback
        thumbnails.push(imageDataUrl);
      }
    }

    return thumbnails;
  }

  // Removed custom resizeImage - now using system resizeImage function for consistency

  /**
   * Helper functions for metadata extraction
   */
  private getStringValue(dataSet: any, tag: string): string | undefined {
    try {
      return dataSet.string(tag);
    } catch (error) {
      return undefined;
    }
  }

  private getNumberValue(dataSet: any, tag: string): number | undefined {
    try {
      const value = dataSet.intString(tag);
      return value !== undefined ? parseInt(value) : undefined;
    } catch (error) {
      return undefined;
    }
  }

  private parsePixelSpacing(value: string | undefined): number[] | undefined {
    if (!value) return undefined;
    try {
      return value.split("\\").map((v) => parseFloat(v.trim()));
    } catch (error) {
      return undefined;
    }
  }

  private parseNumberArray(value: string | undefined): number[] | undefined {
    if (!value) return undefined;
    try {
      return value.split("\\").map((v) => parseFloat(v.trim()));
    } catch (error) {
      return [parseFloat(value)];
    }
  }
}

// Create singleton instance
export const dicomHandler = new DicomHandler();
