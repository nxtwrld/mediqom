import type { Assessment, ReportAnalysis } from "$lib/import/types";
import type { Task } from "$lib/files/index";
import { resizeImage } from "$lib/images";
import { PROCESS_SIZE } from "$lib/files/CONFIG";

// Generic Task Processor Interface
interface TaskProcessor {
  canHandle(task: Task): boolean;
  process(task: Task, fileId: string): Promise<Assessment>;
}

// DICOM Task Processor - Routes to medical imaging SSE endpoint
class DicomTaskProcessor implements TaskProcessor {
  constructor(private sseClient: SSEImportClient) {}

  canHandle(task: Task): boolean {
    return task.type === "application/dicom";
  }

  async process(task: Task, fileId: string): Promise<Assessment> {
    console.log(
      `🏥 Processing DICOM task via medical imaging SSE endpoint: ${task.title}`,
    );

    // Prepare data for medical imaging SSE endpoint
    const images = Array.isArray(task.data)
      ? task.data
      : typeof task.data === "string"
        ? [task.data]
        : [];

    const sseInput = {
      images,
      metadata: {
        isDicomExtracted: true,
        dicomMetadata: task.dicomMetadata,
      },
      language: "English", // TODO: Get from user preferences
    };

    // Use SSE streaming endpoint for real-time progress
    const result = await this.sseClient.makeSSERequest(
      "/v1/import/medical-imaging/stream",
      sseInput,
      fileId,
    );

    console.log(
      `✅ DICOM medical imaging SSE analysis completed for: ${task.title}`,
      {
        hasResult: !!result,
        resultKeys: result ? Object.keys(result) : [],
        hasReport: !!(result as any)?.report,
        reportKeys: (result as any)?.report
          ? Object.keys((result as any).report)
          : [],
      },
    );

    // Return SSE result directly as Assessment (consistent with DocumentTaskProcessor)
    const firstImage = images[0] || "";
    const medicalResult = result as any; // Type assertion for medical imaging result

    // Debug logging for medical result structure
    console.log(`🔍 DICOM: Medical result structure (returning directly):`, {
      hasReport: !!medicalResult.report,
      reportKeys: medicalResult.report ? Object.keys(medicalResult.report) : [],
      topLevelKeys: Object.keys(medicalResult),
      hasBodyParts: !!medicalResult.report?.bodyParts,
      hasSummary: !!medicalResult.report?.summary,
      hasDiagnosis: !!medicalResult.report?.diagnosis,
    });

    // Ensure pages have correct image references (replace server placeholders with actual client images)
    if (medicalResult.pages) {
      medicalResult.pages = medicalResult.pages.map(
        (page: any, index: number) => ({
          ...page,
          // Always use original client-side images, never the references from server
          image: images[index] || firstImage,
          thumbnail: images[index] || firstImage,
        }),
      );
    }

    // Add fallback pages if none exist
    if (!medicalResult.pages || medicalResult.pages.length === 0) {
      medicalResult.pages = [
        {
          page: 1,
          text: `Medical Imaging Analysis: ${task.dicomMetadata?.studyDescription || "DICOM Study"}`,
          language: "english",
          images: [],
          image: firstImage,
          thumbnail: firstImage,
        },
      ];
    }

    // Add fallback documents if none exist
    if (!medicalResult.documents || medicalResult.documents.length === 0) {
      medicalResult.documents = [
        {
          title: task.dicomMetadata?.studyDescription || task.title,
          date:
            task.dicomMetadata?.studyDate ||
            new Date().toISOString().split("T")[0],
          language: "english",
          isMedical: true,
          isMedicalImaging: true,
          pages: [1],
        },
      ];
    }

    // Return the medical result directly (same pattern as DocumentTaskProcessor)
    return medicalResult;
  }
}

// Document Task Processor - Routes to OCR extraction endpoint
class DocumentTaskProcessor implements TaskProcessor {
  constructor(private sseClient: SSEImportClient) {}

  canHandle(task: Task): boolean {
    return task.type === "application/pdf" || task.type === "images";
  }

  async process(task: Task, fileId: string): Promise<Assessment> {
    console.log(`📄 Processing document task via OCR endpoint: ${task.title}`);

    // Convert task data to images for processing
    let images: string[];
    if (Array.isArray(task.data)) {
      images = task.data;
    } else if (typeof task.data === "string") {
      images = [task.data];
    } else {
      throw new Error("Invalid task data format for document processing");
    }

    // Make SSE request to the stream endpoint
    return this.sseClient.makeSSERequest(
      "/v1/import/extract/stream",
      { images },
      fileId,
    );
  }
}

// SSE Progress Event interface
export interface SSEProgressEvent {
  type: "progress" | "complete" | "error";
  stage: string;
  progress: number;
  message: string;
  data?: any;
  fileId?: string;
  timestamp: number;
}

// Progress callback type
export type ProgressCallback = (event: SSEProgressEvent) => void;

// Error callback type
export type ErrorCallback = (error: Error, fileId?: string) => void;

// SSE Client for import operations
export class SSEImportClient {
  private onProgressCallback?: ProgressCallback;
  private onErrorCallback?: ErrorCallback;
  private activeConnections: Map<string, EventSource> = new Map();
  private taskProcessors: TaskProcessor[];

  constructor() {
    // Initialize task processors
    this.taskProcessors = [
      new DicomTaskProcessor(this),
      new DocumentTaskProcessor(this),
    ];
  }

  // Set progress callback
  onProgress(callback: ProgressCallback): void {
    this.onProgressCallback = callback;
  }

  // Set error callback
  onError(callback: ErrorCallback): void {
    this.onErrorCallback = callback;
  }

  // Process task using appropriate processor
  private async processTask(task: Task, fileId: string): Promise<Assessment> {
    const processor = this.taskProcessors.find((p) => p.canHandle(task));

    if (!processor) {
      throw new Error(`No processor available for task type: ${task.type}`);
    }

    return processor.process(task, fileId);
  }

  // Extract documents using task-based routing
  async extractDocumentsFromTasks(tasks: Task[]): Promise<Assessment[]> {
    const results: Assessment[] = [];

    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      try {
        const fileId = `${task.title}-${i}-${Date.now()}`;
        const result = await this.processTask(task, fileId);
        results.push(result);
      } catch (error) {
        console.error(`Failed to process task ${task.title}:`, error);
        this.onErrorCallback?.(
          error instanceof Error ? error : new Error(String(error)),
          task.title,
        );
        throw error;
      }
    }

    return results;
  }

  // Extract documents using SSE endpoint
  async extractDocuments(files: File[]): Promise<Assessment[]> {
    const results: Assessment[] = [];

    for (const file of files) {
      try {
        const fileId = `${file.name}-${file.size}-${Date.now()}`;
        const result = await this.extractSingleFile(file, fileId);
        results.push(result);
      } catch (error) {
        console.error(`Failed to extract file ${file.name}:`, error);
        this.onErrorCallback?.(
          error instanceof Error
            ? error
            : new Error("Unknown extraction error"),
          file.name,
        );
      }
    }

    return results;
  }

  // Extract single file with SSE progress
  private async extractSingleFile(
    file: File,
    fileId: string,
  ): Promise<Assessment> {
    // Convert file to base64 for processing
    const images = await this.prepareImages([file]);

    // Make SSE request to the stream endpoint
    return this.makeSSERequest(
      "/v1/import/extract/stream",
      {
        images,
      },
      fileId,
    );
  }

  // Analyze documents using SSE endpoint
  async analyzeDocuments(
    assessments: Assessment[],
    language?: string,
  ): Promise<ReportAnalysis[]> {
    const results: ReportAnalysis[] = [];

    for (const assessment of assessments) {
      try {
        // Convert assessment to analysis input format - analyze each document individually
        for (const document of assessment.documents) {
          const documentText = assessment.pages
            .filter((page) => document.pages.includes(page.page))
            .map((page) => page.text)
            .join("\n");

          const analysisInput = {
            text: documentText,
            language: language || "English",
          };

          console.log(
            `🔬 Analyzing document "${document.title}" individually:`,
            {
              documentTitle: document.title,
              textLength: documentText.length,
              pages: document.pages,
              hasText: !!documentText,
            },
          );

          const fileId = `doc-${document.title}-${Date.now()}`;
          const result = await this.analyzeSingleDocument(
            analysisInput,
            fileId,
          );

          console.log(`✅ Analysis completed for "${document.title}":`, {
            documentTitle: document.title,
            resultType: result.type,
            isMedical: result.isMedical,
            hasReport: !!result.report,
            reportKeys: result.report ? Object.keys(result.report) : [],
          });

          results.push(result);
        }
      } catch (error) {
        console.error("Failed to analyze document:", error);
        this.onErrorCallback?.(
          error instanceof Error ? error : new Error("Unknown analysis error"),
        );
      }
    }

    console.log(`📊 Document-by-document analysis completed:`, {
      totalDocuments: results.length,
      results: results.map((r) => ({
        type: r.type,
        isMedical: r.isMedical,
        title: r.report?.title,
      })),
    });

    return results;
  }

  // Analyze single document with SSE progress
  private async analyzeSingleDocument(
    input: { text: string; language?: string; images?: string[] },
    fileId: string,
  ): Promise<ReportAnalysis> {
    return this.makeSSERequest("/v1/import/report/stream", input, fileId);
  }

  // Make SSE request with progress tracking
  public async makeSSERequest<T>(
    endpoint: string,
    data: any,
    fileId: string,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      // Make POST request to SSE endpoint
      fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify(data),
      })
        .then((response) => {
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          if (!response.body) {
            throw new Error("No response body for SSE stream");
          }

          // Read SSE stream
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          const readStream = async (): Promise<void> => {
            try {
              const { done, value } = await reader.read();

              if (done) {
                return;
              }

              // Decode and buffer the stream data
              buffer += decoder.decode(value, { stream: true });

              // Process complete messages
              const lines = buffer.split("\n");
              buffer = lines.pop() || ""; // Keep incomplete line in buffer

              for (const line of lines) {
                if (line.startsWith("data: ")) {
                  try {
                    const jsonData = line.slice(6);
                    console.log("🔍 SSE raw data:", jsonData);

                    if (!jsonData || jsonData.trim() === "") {
                      console.warn("Empty SSE data received, skipping");
                      continue;
                    }

                    const eventData = JSON.parse(jsonData);
                    console.log("📨 SSE parsed event:", eventData);

                    this.handleSSEEvent(eventData, fileId, resolve, reject);
                  } catch (parseError) {
                    console.error("Failed to parse SSE event:", {
                      parseError,
                      rawLine: line,
                      jsonData: line.slice(6),
                    });
                  }
                }
              }

              // Continue reading
              await readStream();
            } catch (streamError) {
              console.error("SSE stream error:", streamError);
              reject(streamError);
            }
          };

          readStream();
        })
        .catch((error) => {
          console.error("SSE request failed:", error);
          this.onErrorCallback?.(error, fileId);
          reject(error);
        });
    });
  }

  // Handle individual SSE events
  private handleSSEEvent<T>(
    eventData: SSEProgressEvent,
    fileId: string,
    resolve: (value: T) => void,
    reject: (reason: any) => void,
  ): void {
    // Safety check for undefined eventData
    if (!eventData || typeof eventData !== "object") {
      console.error("SSE received invalid eventData:", eventData);
      const error = new Error("Invalid SSE event data received");
      this.onErrorCallback?.(error, fileId);
      reject(error);
      return;
    }

    // Add fileId to event
    const enhancedEvent = { ...eventData, fileId };

    // Emit progress event
    this.onProgressCallback?.(enhancedEvent);

    // Handle completion
    if (eventData.type === "complete") {
      resolve(eventData.data);
    }

    // Handle errors
    if (eventData.type === "error") {
      const error = new Error(eventData.message);
      this.onErrorCallback?.(error, fileId);
      reject(error);
    }
  }

  // Prepare images for processing (resize, convert to base64)
  private async prepareImages(files: File[]): Promise<string[]> {
    const imageFiles = files.filter((file) => file.type.startsWith("image/"));

    return Promise.all(
      imageFiles.map(async (file) => {
        // Convert to base64
        return new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const base64 = reader.result as string;
            // Resize image
            resizeImage(base64, PROCESS_SIZE).then(resolve).catch(reject);
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      }),
    );
  }

  // Clean up active connections
  cleanup(): void {
    for (const [fileId, eventSource] of this.activeConnections) {
      eventSource.close();
    }
    this.activeConnections.clear();
  }

  // Complete document processing workflow with SSE using tasks
  async processTasksSSE(
    tasks: Task[],
    options: {
      language?: string;
      onStageChange?: (
        stage: "extract" | "analyze" | "medical_imaging",
      ) => void;
    } = {},
  ): Promise<{ assessments: Assessment[]; analyses: ReportAnalysis[] }> {
    try {
      // Stage 1: Extract documents from tasks (for non-DICOM) and direct process DICOM
      options.onStageChange?.("extract");
      const assessments = await this.extractDocumentsFromTasks(tasks);

      // Stage 2: Analyze extracted documents
      options.onStageChange?.("analyze");
      const analyses: ReportAnalysis[] = [];

      console.log("🚀 SSE: Starting document analysis", {
        assessmentsCount: assessments.length,
        totalDocuments: assessments.reduce(
          (sum, a) => sum + a.documents.length,
          0,
        ),
      });

      for (const assessment of assessments) {
        // Check if the assessment already contains analysis data (e.g., from DICOM processor)
        const hasDirectAnalysis =
          !!(assessment as any).report || !!(assessment as any).type;

        if (hasDirectAnalysis) {
          console.log(`✅ Using pre-analyzed data (e.g., DICOM)`, {
            hasReport: !!(assessment as any).report,
            hasType: !!(assessment as any).type,
            analysisType: (assessment as any).type,
          });
          // The assessment itself IS the analysis result - add it directly
          analyses.push(assessment as any);
        } else {
          // Regular documents need separate analysis
          console.log(`📄 Analyzing extracted documents from assessment`);

          for (const document of assessment.documents) {
            const documentText = assessment.pages
              .filter((page) => document.pages.includes(page.page))
              .map((page) => page.text)
              .join("\n");

            const analysisInput = {
              text: documentText,
              language: options.language || "English",
            };

            console.log(`🔬 Analyzing document "${document.title}":`, {
              documentTitle: document.title,
              textLength: documentText.length,
              pages: document.pages,
              hasText: !!documentText,
            });

            const fileId = `doc-${document.title}-${Date.now()}`;
            const result = await this.analyzeSingleDocument(
              analysisInput,
              fileId,
            );

            console.log(`✅ Analysis completed for "${document.title}":`, {
              documentTitle: document.title,
              resultType: result.type,
              isMedical: result.isMedical,
              hasReport: !!result.report,
              reportKeys: result.report ? Object.keys(result.report) : [],
            });

            analyses.push(result);
          }
        }
      }

      return { assessments, analyses };
    } catch (error) {
      console.error("SSE task processing failed:", error);
      throw error;
    }
  }

  // Note: analyzeMedicalImaging method removed - all medical imaging now goes through TaskProcessors

  // Complete document processing workflow with SSE (legacy method - keep for backward compatibility)
  async processDocumentsSSE(
    files: File[],
    options: {
      language?: string;
      onStageChange?: (stage: "extract" | "analyze") => void;
    } = {},
  ): Promise<{ assessments: Assessment[]; analyses: ReportAnalysis[] }> {
    try {
      // Stage 1: Extract documents
      options.onStageChange?.("extract");
      const assessments = await this.extractDocuments(files);

      // Stage 2: Analyze documents
      options.onStageChange?.("analyze");
      const analyses = await this.analyzeDocuments(
        assessments,
        options.language,
      );

      return { assessments, analyses };
    } catch (error) {
      console.error("SSE document processing failed:", error);
      throw error;
    }
  }
}

// Fallback function for non-SSE processing
// This function should make API calls to the server endpoints instead of importing server modules
export async function processDocumentsFallback(
  files: File[],
  options: { language?: string } = {},
): Promise<{ assessments: Assessment[]; analyses: ReportAnalysis[] }> {
  const assessments: Assessment[] = [];
  const analyses: ReportAnalysis[] = [];

  // Process each file using API endpoints
  for (const file of files) {
    if (file.type.startsWith("image/")) {
      // Convert file to base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const resized = await resizeImage(base64, PROCESS_SIZE);

      // Call extract endpoint for assessment
      const extractResponse = await fetch("/v1/import/extract", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          images: [resized],
        }),
      });

      if (!extractResponse.ok) {
        throw new Error(`Extraction failed: ${extractResponse.statusText}`);
      }

      const assessment: Assessment = await extractResponse.json();
      assessments.push(assessment);

      // Analyze each document
      for (const document of assessment.documents) {
        const documentText = assessment.pages
          .filter((page) => document.pages.includes(page.page))
          .map((page) => page.text)
          .join("\n");

        // Call analyze endpoint
        const analyzeResponse = await fetch("/v1/import/report", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            text: documentText,
            language: options.language || "English",
          }),
        });

        if (!analyzeResponse.ok) {
          throw new Error(`Analysis failed: ${analyzeResponse.statusText}`);
        }

        const analysisResult: ReportAnalysis = await analyzeResponse.json();
        analyses.push(analysisResult);
      }
    }
  }

  return { assessments, analyses };
}

// Create singleton instance
export const sseImportClient = new SSEImportClient();
