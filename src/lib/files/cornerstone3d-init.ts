/**
 * Cornerstone3D Lazy Initializer
 *
 * Singleton module that dynamically imports and initializes @cornerstonejs packages.
 * Browser-only — guarded by `browser` check from SvelteKit.
 */

import { browser } from "$app/environment";

let initPromise: Promise<Cornerstone3D> | null = null;

export interface Cornerstone3D {
  core: typeof import("@cornerstonejs/core");
  tools: typeof import("@cornerstonejs/tools");
  dicomImageLoader: {
    wadouri: any;
    init: (options?: any) => void;
    [key: string]: any;
  };
}

/**
 * Get (and lazily initialize) the Cornerstone3D stack.
 * Safe to call multiple times — returns the same promise.
 */
export function getCornerstone3D(): Promise<Cornerstone3D> {
  if (!browser) {
    return Promise.reject(
      new Error("Cornerstone3D can only be used in browser environment"),
    );
  }

  if (!initPromise) {
    initPromise = doInit();
  }

  return initPromise;
}

async function doInit(): Promise<Cornerstone3D> {
  const [core, tools, dicomImageLoaderModule] = await Promise.all([
    import("@cornerstonejs/core"),
    import("@cornerstonejs/tools"),
    import("@cornerstonejs/dicom-image-loader"),
  ]);

  // Initialize core rendering engine
  core.init();

  // Initialize dicom image loader (named export)
  dicomImageLoaderModule.init({
    maxWebWorkers: navigator.hardwareConcurrency || 4,
  });

  // Initialize tools
  tools.init();

  // Register tools globally
  tools.addTool(tools.PanTool);
  tools.addTool(tools.ZoomTool);
  tools.addTool(tools.WindowLevelTool);
  tools.addTool(tools.StackScrollTool);
  tools.addTool(tools.AngleTool);
  tools.addTool(tools.LengthTool);
  tools.addTool(tools.PlanarRotateTool);

  console.log("[Cornerstone3D] Initialized successfully");

  return {
    core,
    tools,
    dicomImageLoader: dicomImageLoaderModule,
  };
}
