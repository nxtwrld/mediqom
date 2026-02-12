/**
 * Context Assembly System Check
 *
 * Simple system checks to validate that all context assembly components are properly integrated
 * This is more suitable for validation than full integration tests
 */

import { logger } from "$lib/logging/logger";

export interface SystemCheckResult {
  component: string;
  available: boolean;
  version?: string;
  error?: string;
  dependencies?: SystemCheckResult[];
}

export interface SystemHealthReport {
  overall: "healthy" | "degraded" | "critical";
  components: SystemCheckResult[];
  recommendations: string[];
  timestamp: string;
}

/**
 * Check if a module can be imported successfully
 */
async function checkModuleAvailability(
  modulePath: string,
  componentName: string,
): Promise<SystemCheckResult> {
  try {
    const module = await import(modulePath);
    return {
      component: componentName,
      available: true,
      version: module.version || "unknown",
    };
  } catch (error) {
    return {
      component: componentName,
      available: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Check if a service has required methods
 */
function checkServiceMethods(
  service: any,
  requiredMethods: string[],
  componentName: string,
): SystemCheckResult {
  const missingMethods = requiredMethods.filter(
    (method) => typeof service[method] !== "function",
  );

  if (missingMethods.length === 0) {
    return {
      component: componentName,
      available: true,
    };
  }

  return {
    component: componentName,
    available: false,
    error: `Missing methods: ${missingMethods.join(", ")}`,
  };
}

/**
 * Perform comprehensive system health check
 */
export async function performSystemHealthCheck(): Promise<SystemHealthReport> {
  const checkLogger = logger.namespace("SystemCheck");
  checkLogger.info("Starting system health check");

  const components: SystemCheckResult[] = [];
  let criticalFailures = 0;
  let warnings = 0;

  // Check 1: Profile Context Manager (simplified medical terms system)
  try {
    const { profileContextManager } = await import("./profile-context");
    const contextInitCheck = checkServiceMethods(
      profileContextManager,
      ["initializeProfileContext", "isContextReady"],
      "Profile Context Manager",
    );
    components.push(contextInitCheck);
    if (!contextInitCheck.available) criticalFailures++;
  } catch (error) {
    components.push({
      component: "Context Initializer",
      available: false,
      error: `Import failed: ${error instanceof Error ? error.message : String(error)}`,
    });
    criticalFailures++;
  }

  // Check 2: Embedding Manager (disabled - module not available)
  try {
    // const embeddingMgr = await import('../embeddings/manager');
    // const embeddingCheck = checkServiceMethods(
    //   embeddingMgr.embeddingManager,
    //   ['generate', 'searchSimilar', 'getStatus'],
    //   'Embedding Manager'
    // );
    // components.push(embeddingCheck);
    // if (!embeddingCheck.available) criticalFailures++;

    components.push({
      component: "Embedding Manager",
      available: false,
      error: "Module not implemented",
    });
  } catch (error) {
    components.push({
      component: "Embedding Manager",
      available: false,
      error: `Import failed: ${error instanceof Error ? error.message : String(error)}`,
    });
    criticalFailures++;
  }

  // Check 3: Profile Context Manager
  try {
    const profileCtx = await import("./profile-context");
    const profileCheck = checkServiceMethods(
      profileCtx.profileContextManager,
      ["initializeProfileContext", "addDocumentToContext"],
      "Profile Context Manager",
    );
    components.push(profileCheck);
    if (!profileCheck.available) criticalFailures++;
  } catch (error) {
    components.push({
      component: "Profile Context Manager",
      available: false,
      error: `Import failed: ${error instanceof Error ? error.message : String(error)}`,
    });
    criticalFailures++;
  }

  // Check 4: Chat Context Service
  try {
    const chatCtx = await import("./chat-service");
    const chatCheck = checkServiceMethods(
      chatCtx.chatContextService,
      ["prepareContextForChat"],
      "Chat Context Service",
    );
    components.push(chatCheck);
    if (!chatCheck.available) warnings++;
  } catch (error) {
    components.push({
      component: "Chat Context Service",
      available: false,
      error: `Import failed: ${error instanceof Error ? error.message : String(error)}`,
    });
    warnings++;
  }

  // Check 5: Session Context Service
  try {
    const sessionCtx = await import("./session-context");
    const sessionCheck = checkServiceMethods(
      sessionCtx.sessionContextService,
      ["initializeSessionContext"],
      "Session Context Service",
    );
    components.push(sessionCheck);
    if (!sessionCheck.available) warnings++;
  } catch (error) {
    components.push({
      component: "Session Context Service",
      available: false,
      error: `Import failed: ${error instanceof Error ? error.message : String(error)}`,
    });
    warnings++;
  }

  // Check 6: MCP Tools
  try {
    const mcpTools = await import("../mcp-tools/medical-expert-tools");
    const mcpCheck = checkServiceMethods(
      mcpTools.medicalExpertTools,
      ["generateMCPTools", "searchDocuments"],
      "MCP Medical Expert Tools",
    );
    components.push(mcpCheck);
    if (!mcpCheck.available) warnings++;
  } catch (error) {
    components.push({
      component: "MCP Medical Expert Tools",
      available: false,
      error: `Import failed: ${error instanceof Error ? error.message : String(error)}`,
    });
    warnings++;
  }

  // Check 7: Document Integration
  try {
    const docs = await import("$lib/documents");
    const docsCheck = checkServiceMethods(
      docs.default,
      ["addDocument", "getDocument", "loadDocument"],
      "Document Management",
    );
    components.push(docsCheck);
    if (!docsCheck.available) criticalFailures++;
  } catch (error) {
    components.push({
      component: "Document Management",
      available: false,
      error: `Import failed: ${error instanceof Error ? error.message : String(error)}`,
    });
    criticalFailures++;
  }

  // Check 8: LangGraph Workflow
  try {
    const workflow = await import("../../langgraph/workflows/unified-workflow");
    const workflowCheck = checkServiceMethods(
      workflow,
      [
        "createUnifiedDocumentProcessingWorkflow",
        "runUnifiedDocumentProcessingWorkflow",
      ],
      "LangGraph Document Workflow",
    );
    components.push(workflowCheck);
    if (!workflowCheck.available) warnings++;
  } catch (error) {
    components.push({
      component: "LangGraph Document Workflow",
      available: false,
      error: `Import failed: ${error instanceof Error ? error.message : String(error)}`,
    });
    warnings++;
  }

  // Determine overall health
  let overall: "healthy" | "degraded" | "critical";
  if (criticalFailures > 0) {
    overall = "critical";
  } else if (warnings > 0) {
    overall = "degraded";
  } else {
    overall = "healthy";
  }

  // Generate recommendations
  const recommendations: string[] = [];

  if (criticalFailures > 0) {
    recommendations.push(
      `Critical: ${criticalFailures} core components are not available. Context assembly will not work.`,
    );
  }

  if (warnings > 0) {
    recommendations.push(
      `Warning: ${warnings} optional components have issues. Some features may be limited.`,
    );
  }

  components.forEach((component) => {
    if (!component.available) {
      recommendations.push(`Fix ${component.component}: ${component.error}`);
    }
  });

  if (overall === "healthy") {
    recommendations.push(
      "All components are available. Context assembly system is ready.",
    );
  }

  const report: SystemHealthReport = {
    overall,
    components,
    recommendations,
    timestamp: new Date().toISOString(),
  };

  checkLogger.info("System health check completed", {
    overall,
    criticalFailures,
    warnings,
    totalComponents: components.length,
  });

  return report;
}

/**
 * Quick availability check for essential components
 */
export async function quickAvailabilityCheck(): Promise<{
  contextSystem: boolean;
  embeddingSystem: boolean;
  documentSystem: boolean;
  chatIntegration: boolean;
}> {
  const checks = {
    contextSystem: false,
    embeddingSystem: false,
    documentSystem: false,
    chatIntegration: false,
  };

  try {
    // Check context system (disabled - module not available)
    // const contextInit = await import('../client-database/initialization');
    // checks.contextSystem = typeof contextInit.contextInitializer?.initialize === 'function';
    checks.contextSystem = false;
  } catch {
    // Keep as false
  }

  try {
    // Check embedding system (disabled - system removed)
    // const embeddingMgr = await import('../embeddings/manager');
    // checks.embeddingSystem = typeof embeddingMgr.embeddingManager?.generate === 'function';
    checks.embeddingSystem = false;
  } catch {
    // Keep as false
  }

  try {
    // Check document system
    const docs = await import("$lib/documents");
    checks.documentSystem = typeof docs.default?.addDocument === "function";
  } catch {
    // Keep as false
  }

  try {
    // Check chat integration
    const chatCtx = await import("./chat-service");
    checks.chatIntegration =
      typeof chatCtx.chatContextService?.prepareContextForChat === "function";
  } catch {
    // Keep as false
  }

  return checks;
}

/**
 * Generate deployment readiness report
 */
export async function generateDeploymentReadiness(): Promise<{
  ready: boolean;
  requiredComponents: string[];
  optionalComponents: string[];
  blockers: string[];
}> {
  const healthReport = await performSystemHealthCheck();

  const requiredComponents = [
    "Context Initializer",
    "Embedding Manager",
    "Profile Context Manager",
    "Document Management",
  ];

  const optionalComponents = [
    "Chat Context Service",
    "Session Context Service",
    "MCP Medical Expert Tools",
    "LangGraph Document Workflow",
  ];

  const unavailableRequired = healthReport.components
    .filter((c) => requiredComponents.includes(c.component) && !c.available)
    .map((c) => c.component);

  const unavailableOptional = healthReport.components
    .filter((c) => optionalComponents.includes(c.component) && !c.available)
    .map((c) => c.component);

  const blockers: string[] = [];

  if (unavailableRequired.length > 0) {
    blockers.push(
      `Missing required components: ${unavailableRequired.join(", ")}`,
    );
  }

  if (healthReport.overall === "critical") {
    blockers.push("System health is critical - deployment not recommended");
  }

  return {
    ready: blockers.length === 0,
    requiredComponents: unavailableRequired,
    optionalComponents: unavailableOptional,
    blockers,
  };
}
