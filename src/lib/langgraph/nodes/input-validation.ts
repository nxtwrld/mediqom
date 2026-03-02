import type { DocumentProcessingState } from "../state";

export const inputValidationNode = async (
  state: DocumentProcessingState,
): Promise<Partial<DocumentProcessingState>> => {
  // Emit progress start
  state.emitProgress?.("input_validation", 0, "Starting input validation");

  const errors = [];

  // Validate input requirements
  state.emitProgress?.("input_validation", 20, "Validating input requirements");

  if (!state.images && !state.text) {
    const error = "Either images or text must be provided";
    errors.push({
      node: "input_validation",
      error,
      timestamp: new Date().toISOString(),
    });
    state.emitError?.("input_validation", error);
  }

  // Validate image formats if provided
  if (state.images) {
    state.emitProgress?.(
      "input_validation",
      40,
      `Validating ${state.images.length} image(s)`,
    );

    for (const image of state.images) {
      if (!image.startsWith("data:image/") && !image.startsWith("http")) {
        const error = `Invalid image format: ${image.substring(0, 50)}...`;
        errors.push({
          node: "input_validation",
          error,
          timestamp: new Date().toISOString(),
        });
      }
    }
  }

  // Convert images to content format for downstream processing
  state.emitProgress?.(
    "input_validation",
    80,
    "Converting input to processing format",
  );

  const content = [];
  if (state.text) {
    content.push({
      type: "text" as const,
      text: state.text,
    });
  }

  if (state.images && state.images.length > 0) {
    // For now, we only support single image (backwards compatibility)
    content.push({
      type: "image_url" as const,
      image_url: {
        url: state.images[0],
      },
    });
  }

  // Emit completion or error
  if (errors.length > 0) {
    state.emitError?.(
      "input_validation",
      `Input validation failed with ${errors.length} error(s)`,
    );
  } else {
    state.emitComplete?.(
      "input_validation",
      "Input validation completed successfully",
      {
        contentItems: content.length,
        hasText: !!state.text,
        hasImages: !!(state.images && state.images.length > 0),
        language: state.language || "English",
      },
    );
  }

  return {
    content,
    errors: errors.length > 0 ? errors : undefined,
  };
};
