/**
 * Visual Configuration for SessionMoe Visualizer
 * Centralized color and opacity settings for easy customization
 */

// ============================================================================
// NODE SIZE SETTINGS
// ============================================================================

export const NODE_SIZE = {
  // Minimum height for all nodes (in rem for consistency)
  MIN_HEIGHT_REM: 4.8, // 4.8rem minimum height
  MIN_HEIGHT_PX: 48, // shortcut: fixed SVG px (4.8rem at default font size), derive from root font-size if Sankey nodes should scale

  // Maximum heights by node type
  MAX_HEIGHT_PX: 150, // Maximum height for any node

  // Height calculation multipliers
  PRIORITY_MULTIPLIER: 10, // How much priority affects height
  PROBABILITY_MULTIPLIER: 8, // How much probability/confidence affects height

  // Width settings
  NODE_WIDTH: 120, // Default node width
  NODE_WIDTH_MOBILE: 100, // Mobile node width
} as const;

// ============================================================================
// OPACITY SETTINGS
// ============================================================================

export const OPACITY = {
  // Default states
  DEFAULT_NODE: 1.0,
  DEFAULT_LINK: 0.2,

  // Interactive states - hover/focus
  ACTIVE_NODE: 1.0,
  ACTIVE_LINK: 0.9,

  // Inactive states during highlighting
  INACTIVE_NODE_HOVER: 0.5, // When hovering others
  INACTIVE_NODE_FOCUS: 0.5, // When focusing others
  INACTIVE_LINK_HOVER: 0.2, // When hovering others
  INACTIVE_LINK_FOCUS: 0.1, // When focusing others

  // Combined highlighting (hover OR focus)
  INACTIVE_NODE_HIGHLIGHTED: 0.5,
  INACTIVE_LINK_HIGHLIGHTED: 0.1,

  // Reset state
  RESET_NODE: 1.0,
  RESET_LINK: 0.2,

  // CSS hover effects
  CSS_HOVER_NODE: 0.9,
  CSS_HOVER_LINK: 0.8,

  // Focus mode (when node is selected)
  FOCUS_ACTIVE: 1.0,
  FOCUS_INACTIVE: 0.1,
  FOCUS_LINK_ACTIVE: 0.9,
  FOCUS_LINK_INACTIVE: 0.1,

  // Grayscale filter opacity
  GRAYSCALE_FILTER: 0.8,

  // UI element opacities
  NODE_BADGE: 0.8,
  TOOLTIP_BACKGROUND: 0.9,
  MOBILE_OVERLAY: 0.3,

  // Shadow opacities
  SHADOW_LIGHT: 0.1,
  SHADOW_MEDIUM: 0.2,
  SHADOW_HEAVY: 0.3,

  // Background opacities
  HIGH_PRIORITY_BG: 0.2,
  NORMAL_PRIORITY_BG: 0.2,
  TOOLTIP_WHITE_BG: 0.8,
} as const;

// ============================================================================
// COLOR SETTINGS
// ============================================================================

export const COLORS = {
  // Default link color
  DEFAULT_LINK: "#000000",

  // Node type colors (HSLA format for intensity variations)
  NODES: {
    // Symptoms
    SYMPTOM_TRANSCRIPT: "hsla(120, 60%, 60%, {intensity})", // Green
    SYMPTOM_SUSPECTED: "hsla(30, 70%, 60%, {intensity})", // Orange
    SYMPTOM_MEDICAL_HISTORY: "hsla(200, 60%, 60%, {intensity})", // Blue
    SYMPTOM_FAMILY_HISTORY: "hsla(280, 60%, 60%, {intensity})", // Purple
    SYMPTOM_SOCIAL_HISTORY: "hsla(40, 70%, 60%, {intensity})", // Yellow-Orange
    SYMPTOM_MEDICATION_HISTORY: "hsla(180, 60%, 60%, {intensity})", // Cyan

    // Medical elements
    DIAGNOSIS: "hsla(220, 70%, 60%, {intensity})", // Blue
    TREATMENT: "hsla(160, 70%, 60%, {intensity})", // Teal

    // Actions
    QUESTION: "hsla(40, 80%, 60%, {intensity})", // Yellow
    ALERT: "hsla(0, 80%, 60%, {intensity})", // Red

    // Default/fallback
    DEFAULT: "hsla(0, 0%, 60%, {intensity})", // Gray
  },

  // Relationship type colors (for link coloring during hover)
  RELATIONSHIPS: {
    // Supportive relationships
    SUPPORTS: "#4ade80", // Green
    CONFIRMS: "#4ade80", // Green
    SUGGESTS: "#fb923c", // Orange
    INDICATES: "#fb923c", // Orange

    // Negative relationships
    CONTRADICTS: "#f87171", // Red
    RULES_OUT: "#f87171", // Red

    // Treatment relationships
    TREATS: "#60a5fa", // Blue
    MANAGES: "#60a5fa", // Blue
    REQUIRES: "#60a5fa", // Blue

    // Investigation relationships
    INVESTIGATES: "#a78bfa", // Purple
    CLARIFIES: "#a78bfa", // Purple
    EXPLORES: "#a78bfa", // Purple

    // Default/fallback
    DEFAULT: "#6b7280", // Gray
  },

  // Legend colors (for display consistency)
  LEGEND: {
    SYMPTOM: "hsla(120, 60%, 60%, 0.8)",
    DIAGNOSIS: "hsla(220, 70%, 60%, 0.8)",
    TREATMENT: "hsla(160, 70%, 60%, 0.8)",
    QUESTION: "hsla(40, 80%, 60%, 0.8)",
    ALERT: "hsla(0, 80%, 60%, 0.8)",
  },

  // Source type colors (for legend and node differentiation)
  SOURCES: {
    TRANSCRIPT: "#10b981",
    MEDICAL_HISTORY: "#3b82f6",
    FAMILY_HISTORY: "#8b5cf6",
    SOCIAL_HISTORY: "#f59e0b",
    MEDICATION_HISTORY: "#06b6d4",
    SUSPECTED: "#f97316",
  },

  // Priority/severity colors
  PRIORITY: {
    HIGH: "#dc2626", // Red
    MEDIUM: "#f59e0b", // Orange
    LOW: "#6b7280", // Gray
  },

  // UI element colors
  UI: {
    TEXT_PRIMARY: "#1f2937",
    TEXT_SECONDARY: "#6b7280",
    BACKGROUND: "#f8fafc",
    SURFACE: "#ffffff",
    BORDER: "#e2e8f0",
    ERROR: "#dc2626",
    SUCCESS: "#10b981",
    WARNING: "#f59e0b",
    INFO: "#3b82f6",
  },
} as const;

// ============================================================================
// LINK RENDERING CONFIGURATION
// ============================================================================

export const LINK_CONFIG = {
  // Link rendering algorithm
  ALGORITHM: "custom-bezier" as
    | "default"
    | "custom-bezier"
    | "straight"
    | "arc",

  // Curvature control (0 = straight, 1 = full curve)
  CURVATURE: 0.5,

  // Width constraints
  MAX_WIDTH: 25, // Maximum link thickness in pixels
  MIN_WIDTH: 10, // Minimum link thickness in pixels
  TAPER_FACTOR: 0.8, // Controls width consistency (0.5-1.0)

  // Parallel link handling
  PARALLEL_SPACING: 1, // Spacing between parallel links in pixels
  BUNDLE_THRESHOLD: 10, // Number of parallel links before bundling

  // Visual enhancements
  CURVE_SMOOTHNESS: 0.6, // Bezier curve control point factor
  EDGE_RADIUS: 2, // Rounded edges for polygon links

  // Performance
  RENDER_MODE: "polygon" as "stroke" | "polygon" | "hybrid",
} as const;

// Link algorithm types for type safety
export type LinkAlgorithm = typeof LINK_CONFIG.ALGORITHM;
export type LinkRenderMode = typeof LINK_CONFIG.RENDER_MODE;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get node color with proper intensity based on priority
 */
export function getNodeColor(
  type: string,
  priority: number = 5,
  source?: string,
): string {
  // Priority-based intensity (1=critical/dark, 10=low/light)
  const intensity = Math.max(0.3, 1 - ((priority - 1) / 9) * 0.7);

  switch (type) {
    case "symptom":
      if (source === "suspected")
        return COLORS.NODES.SYMPTOM_SUSPECTED.replace(
          "{intensity}",
          intensity.toString(),
        );
      if (source === "medical_history")
        return COLORS.NODES.SYMPTOM_MEDICAL_HISTORY.replace(
          "{intensity}",
          intensity.toString(),
        );
      if (source === "family_history")
        return COLORS.NODES.SYMPTOM_FAMILY_HISTORY.replace(
          "{intensity}",
          intensity.toString(),
        );
      if (source === "social_history")
        return COLORS.NODES.SYMPTOM_SOCIAL_HISTORY.replace(
          "{intensity}",
          intensity.toString(),
        );
      if (source === "medication_history")
        return COLORS.NODES.SYMPTOM_MEDICATION_HISTORY.replace(
          "{intensity}",
          intensity.toString(),
        );
      return COLORS.NODES.SYMPTOM_TRANSCRIPT.replace(
        "{intensity}",
        intensity.toString(),
      );
    case "diagnosis":
      return COLORS.NODES.DIAGNOSIS.replace(
        "{intensity}",
        intensity.toString(),
      );
    case "treatment":
      return COLORS.NODES.TREATMENT.replace(
        "{intensity}",
        intensity.toString(),
      );
    case "question":
      return COLORS.NODES.QUESTION.replace("{intensity}", intensity.toString());
    case "alert":
      return COLORS.NODES.ALERT.replace("{intensity}", intensity.toString());
    default:
      return COLORS.NODES.DEFAULT.replace("{intensity}", intensity.toString());
  }
}

/**
 * Get relationship color for link highlighting
 */
export function getLinkColor(relationship: string): string {
  const normalizedRel = relationship.toLowerCase();

  switch (normalizedRel) {
    case "supports":
    case "confirms":
      return COLORS.RELATIONSHIPS.SUPPORTS;
    case "contradicts":
    case "rules_out":
      return COLORS.RELATIONSHIPS.CONTRADICTS;
    case "treats":
    case "manages":
    case "requires":
      return COLORS.RELATIONSHIPS.TREATS;
    case "investigates":
    case "clarifies":
    case "explores":
      return COLORS.RELATIONSHIPS.INVESTIGATES;
    case "suggests":
    case "indicates":
      return COLORS.RELATIONSHIPS.SUGGESTS;
    default:
      return COLORS.RELATIONSHIPS.DEFAULT;
  }
}

/**
 * Get source color for differentiation
 */
export function getSourceColor(source: string): string {
  switch (source) {
    case "transcript":
      return COLORS.SOURCES.TRANSCRIPT;
    case "medical_history":
      return COLORS.SOURCES.MEDICAL_HISTORY;
    case "family_history":
      return COLORS.SOURCES.FAMILY_HISTORY;
    case "social_history":
      return COLORS.SOURCES.SOCIAL_HISTORY;
    case "medication_history":
      return COLORS.SOURCES.MEDICATION_HISTORY;
    case "suspected":
      return COLORS.SOURCES.SUSPECTED;
    default:
      return COLORS.UI.TEXT_SECONDARY;
  }
}

/**
 * Get priority-based color
 */
export function getPriorityColor(priority: number): string {
  if (priority <= 3) return COLORS.PRIORITY.HIGH;
  if (priority <= 6) return COLORS.PRIORITY.MEDIUM;
  return COLORS.PRIORITY.LOW;
}

// ============================================================================
// LINK PATH GENERATORS
// ============================================================================

/**
 * Custom Bézier curve link generator with configurable curvature
 */
export function createCustomBezierLink(
  curvature: number = LINK_CONFIG.CURVATURE,
) {
  return function (link: any): string {
    const x0 = link.source.x1 || link.source.x0;
    const x1 = link.target.x0 || link.target.x1;
    const y0 = link.y0;
    const y1 = link.y1;

    const xi = (x0 + x1) / 2;
    const x2 = x0 + (xi - x0) * curvature;
    const x3 = x1 - (x1 - xi) * curvature;

    return `M${x0},${y0}C${x2},${y0} ${x3},${y1} ${x1},${y1}`;
  };
}

/**
 * Straight diagonal link generator
 */
export function createStraightLink() {
  return function (link: any): string {
    const x0 = link.source.x1 || link.source.x0;
    const x1 = link.target.x0 || link.target.x1;
    const y0 = link.y0;
    const y1 = link.y1;

    return `M${x0},${y0}L${x1},${y1}`;
  };
}

/**
 * Arc-based link generator
 */
export function createArcLink(curvature: number = LINK_CONFIG.CURVATURE) {
  return function (link: any): string {
    const x0 = link.source.x1 || link.source.x0;
    const x1 = link.target.x0 || link.target.x1;
    const y0 = link.y0;
    const y1 = link.y1;

    const dx = x1 - x0;
    const dy = y1 - y0;
    const radius = Math.sqrt(dx * dx + dy * dy) * curvature;

    return `M${x0},${y0}A${radius},${radius} 0 0,${dy > 0 ? 1 : 0} ${x1},${y1}`;
  };
}

/**
 * Polygon-based link generator for consistent thickness
 */
export function createPolygonLink(
  curvature: number = LINK_CONFIG.CURVATURE,
  taperFactor: number = LINK_CONFIG.TAPER_FACTOR,
) {
  return function (link: any): string {
    const x0 = link.source.x1 || link.source.x0;
    const x1 = link.target.x0 || link.target.x1;
    const y0 = link.y0;
    const y1 = link.y1;
    const width = Math.min(link.width || 2, LINK_CONFIG.MAX_WIDTH);

    // Calculate control points for smooth curves
    const xi = (x0 + x1) / 2;
    const x2 = x0 + (xi - x0) * curvature;
    const x3 = x1 - (x1 - xi) * curvature;

    // Calculate tapered width
    const startWidth = width;
    const endWidth = width * taperFactor;
    const midWidth = Math.max(startWidth, endWidth) * 0.8;

    // Create polygon path
    const halfStartWidth = startWidth / 2;
    const halfEndWidth = endWidth / 2;
    const halfMidWidth = midWidth / 2;

    // Top curve
    const topPath = `M${x0},${y0 - halfStartWidth}C${x2},${y0 - halfMidWidth} ${x3},${y1 - halfMidWidth} ${x1},${y1 - halfEndWidth}`;
    // Bottom curve (reverse direction)
    const bottomPath = `L${x1},${y1 + halfEndWidth}C${x3},${y1 + halfMidWidth} ${x2},${y0 + halfMidWidth} ${x0},${y0 + halfStartWidth}Z`;

    return topPath + bottomPath;
  };
}

/**
 * Get the appropriate link path generator based on configuration
 */
export function getLinkPathGenerator(
  algorithm: LinkAlgorithm = LINK_CONFIG.ALGORITHM,
  renderMode: LinkRenderMode = LINK_CONFIG.RENDER_MODE,
): (link: any) => string {
  // For polygon render mode, always use polygon generator
  if (renderMode === "polygon") {
    return createPolygonLink(LINK_CONFIG.CURVATURE, LINK_CONFIG.TAPER_FACTOR);
  }

  // For stroke mode, use the specified algorithm
  switch (algorithm) {
    case "custom-bezier":
      return createCustomBezierLink(LINK_CONFIG.CURVATURE);
    case "straight":
      return createStraightLink();
    case "arc":
      return createArcLink(LINK_CONFIG.CURVATURE);
    case "default":
    default:
      // Return a function that uses d3's sankeyLinkHorizontal
      return function (link: any): string {
        // This will be handled by d3.sankeyLinkHorizontal() in the component
        return "";
      };
  }
}

/**
 * Calculate link width with constraints
 */
export function calculateLinkWidth(rawWidth: number): number {
  return Math.max(
    LINK_CONFIG.MIN_WIDTH,
    Math.min(rawWidth, LINK_CONFIG.MAX_WIDTH),
  );
}

// ============================================================================
// PARALLEL LINK HANDLING
// ============================================================================

/**
 * Detect parallel links between the same source and target nodes
 */
export function detectParallelLinks(links: any[]): Map<string, any[]> {
  const parallelGroups = new Map<string, any[]>();

  links.forEach((link) => {
    const sourceId =
      typeof link.source === "object" ? link.source.id : link.source;
    const targetId =
      typeof link.target === "object" ? link.target.id : link.target;
    const key = `${sourceId}-${targetId}`;

    if (!parallelGroups.has(key)) {
      parallelGroups.set(key, []);
    }
    parallelGroups.get(key)!.push(link);
  });

  // Return only groups with multiple links
  const result = new Map<string, any[]>();
  for (const [key, group] of parallelGroups) {
    if (group.length > 1) {
      result.set(key, group);
    }
  }

  return result;
}

/**
 * Calculate offsets for parallel links to prevent overlap
 */
export function calculateParallelOffsets(
  parallelLinks: any[],
  spacing: number = LINK_CONFIG.PARALLEL_SPACING,
): void {
  const count = parallelLinks.length;
  const totalOffset = (count - 1) * spacing;
  const startOffset = -totalOffset / 2;

  parallelLinks.forEach((link, index) => {
    const offset = startOffset + index * spacing;

    // Store offset for use in path generation
    link.parallelOffset = offset;
    link.parallelIndex = index;
    link.parallelCount = count;

    // Adjust y positions based on offset
    if (link.y0 !== undefined) link.y0 += offset;
    if (link.y1 !== undefined) link.y1 += offset;
  });
}

/**
 * Apply parallel link spacing to all detected parallel groups
 */
export function applyParallelLinkSpacing(links: any[]): void {
  const parallelGroups = detectParallelLinks(links);

  for (const [key, group] of parallelGroups) {
    calculateParallelOffsets(group, LINK_CONFIG.PARALLEL_SPACING);
  }
}

/**
 * Enhanced link path generator that accounts for parallel link offsets
 */
export function createEnhancedLinkGenerator(
  baseGenerator: (link: any) => string,
  handleParallel: boolean = true,
): (link: any) => string {
  return function (link: any): string {
    if (!handleParallel || !link.parallelOffset) {
      return baseGenerator(link);
    }

    // For parallel links, we might want to adjust the curvature or path
    // based on the parallel index to create visual separation
    const originalPath = baseGenerator(link);

    // If this is a polygon path and we have multiple parallel links,
    // we might want to adjust the curvature slightly for visual separation
    if (link.parallelCount > 2) {
      // Slightly vary the curvature for middle links to create visual separation
      const curvatureVariation =
        (link.parallelIndex - (link.parallelCount - 1) / 2) * 0.02;
      // This would require modifying the base generator, which is complex
      // For now, rely on the y-offset adjustment
    }

    return originalPath;
  };
}
