/**
 * Type declarations for dicom-parser
 */

declare module "dicom-parser" {
  export interface DicomDataSet {
    string(tag: string): string | undefined;
    intString(tag: string): string | undefined;
    uint16(tag: string): number | undefined;
    uint32(tag: string): number | undefined;
  }

  export function parseDicom(byteArray: Uint8Array): DicomDataSet;
}
