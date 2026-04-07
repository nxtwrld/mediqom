export enum TaskState {
  "NEW" = "NEW",
  "ASSESSING" = "ASSESSING",
  "ASSESSED" = "ASSESSED",
}

export interface Task {
  title: string;
  type: "application/pdf" | "images" | "application/dicom";
  icon: string;
  data: string | ArrayBuffer | string[];
  password?: string;
  dicomMetadata?: any; // DICOM-specific metadata
  originalDicom?: ArrayBuffer; // Original DICOM file for attachment
  originalPdf?: ArrayBuffer; // Original PDF file for attachment (when data contains base64 images)
  thumbnail?: string; // Thumbnail for task preview (especially useful for DICOM images)
  /** Client-side layout detections from DocLayout-YOLO */
  layoutDetections?: import("./types").PageLayoutDetection[];
  state: TaskState;
  files: File[];
}

export enum DocumentState {
  NEW = "NEW",
  ASSESSING = "ASSESSING",
  ASSESSED = "ASSESSED",
  PROCESSING = "PROCESSING",
  PROCESSED = "PROCESSED",
  ERROR = "ERROR",
  NONMEDICAL = "NONMEDICAL",
  CANCELED = "CANCELED",
}

export interface Document {
  title: string;
  date: string;
  isMedical: boolean;
  state: DocumentState;
  pages: {
    page: number;
    text: string;
    image?: string;
    thumbnail?: string;
  }[];
  metadata?: {
    title: string;
    tags: string[];
    date: string;
    [key: string]: any;
  };
  content: {
    title: string;
    tags: string[];
    date: string;
    summary?: string;
    category: string;
    perfomer?: any;
    patient?: any;
    content?: string;
    localizedContent?: string;
    diagnosis?: {
      description: string;
      code?: string;
    };
    recommendations?: {
      description: string;
      urgency: number;
    }[];
    bodyParts?: {
      identification: string;
      status: string;
      treatment: string;
      urgency: number;
    }[];
    dicomMetadata?: any; // DICOM-specific metadata
    medicalImageAnalysis?: any; // AI analysis results for medical images
  };
  type: "application/pdf" | "images" | "application/dicom";
  files: string | ArrayBuffer | string[];
  task: Task;
  attachments: {
    file: string;
    type: string;
    thumbnail: string;
  }[];
}

export type DetectedProfileData = {
  fullName: string;
  birthDate?: string;
  identifier?: string;
  adr?: {
    street: string;
    city: string;
    postalCode: string;
    country: string;
  };
  insurance?: {
    number?: string;
    provider?: string;
  };
  health?: any; // Add missing health property
};
