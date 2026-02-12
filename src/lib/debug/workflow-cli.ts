#!/usr/bin/env node

/**
 * CLI Tool for Workflow Debug Management
 *
 * Provides command-line interface for:
 * - Listing available workflow recordings
 * - Replaying workflows step by step
 * - Analyzing workflow performance
 * - Comparing workflow results
 * - Extracting specific steps or data
 */

import { join } from "path";
import { existsSync, readdirSync, statSync } from "fs";
import { createWorkflowReplay } from "./workflow-replay";
import type { WorkflowRecording } from "./workflow-recorder";
import { workflowRecorder } from "./workflow-recorder";

interface CLIOptions {
  command?: string;
  file?: string;
  step?: string;
  output?: string;
  format?: "json" | "summary" | "detailed";
  compare?: string;
  verbose?: boolean;
  delay?: number;
}

export class WorkflowCLI {
  private debugDir: string;

  constructor() {
    this.debugDir = join(process.cwd(), "test-data", "workflows");
  }

  /**
   * Main CLI entry point
   */
  async run(args: string[]): Promise<void> {
    const options = this.parseArgs(args);

    switch (options.command) {
      case "list":
        this.listRecordings();
        break;
      case "info":
        await this.showRecordingInfo(options.file, options.format);
        break;
      case "replay":
        await this.replayWorkflow(options.file, options);
        break;
      case "extract":
        await this.extractStep(options.file, options.step, options.format);
        break;
      case "compare":
        await this.compareWorkflows(options.file, options.compare);
        break;
      case "analyze":
        await this.analyzePerformance(options.file);
        break;
      default:
        this.showHelp();
    }
  }

  /**
   * Parse command line arguments
   */
  private parseArgs(args: string[]): CLIOptions {
    const options: CLIOptions = {
      command: args[0] || "help",
      format: "summary",
      verbose: false,
    };

    for (let i = 1; i < args.length; i++) {
      const arg = args[i];
      switch (arg) {
        case "--file":
        case "-f":
          options.file = args[++i];
          break;
        case "--step":
        case "-s":
          options.step = args[++i];
          break;
        case "--output":
        case "-o":
          options.output = args[++i];
          break;
        case "--format":
          options.format = args[++i] as "json" | "summary" | "detailed";
          break;
        case "--compare":
        case "-c":
          options.compare = args[++i];
          break;
        case "--verbose":
        case "-v":
          options.verbose = true;
          break;
        case "--delay":
        case "-d":
          options.delay = parseInt(args[++i], 10);
          break;
      }
    }

    return options;
  }

  /**
   * List all available workflow recordings
   */
  listRecordings(): void {
    if (!existsSync(this.debugDir)) {
      console.log(
        "No workflow recordings found. Debug directory does not exist.",
      );
      return;
    }

    const files = readdirSync(this.debugDir)
      .filter((file) => file.endsWith(".json"))
      .map((file) => {
        const fullPath = join(this.debugDir, file);
        const stats = statSync(fullPath);
        return {
          file,
          path: fullPath,
          size: stats.size,
          modified: stats.mtime.toISOString(),
        };
      })
      .sort((a, b) => b.modified.localeCompare(a.modified));

    if (files.length === 0) {
      console.log("No workflow recordings found.");
      return;
    }

    console.log(`\n📁 Found ${files.length} workflow recordings:\n`);
    console.log("File".padEnd(50) + "Size".padEnd(10) + "Modified");
    console.log("-".repeat(80));

    files.forEach(({ file, size, modified }) => {
      const sizeKB = Math.round(size / 1024);
      const date = new Date(modified).toLocaleString();
      console.log(file.padEnd(50) + `${sizeKB}KB`.padEnd(10) + date);
    });

    console.log(
      `\nUse 'workflow-cli info --file <filename>' for detailed information.`,
    );
  }

  /**
   * Show detailed information about a recording
   */
  async showRecordingInfo(
    file?: string,
    format: string = "summary",
  ): Promise<void> {
    if (!file) {
      console.error("Error: --file parameter is required");
      return;
    }

    const filePath = this.resolveFilePath(file);
    const recording = workflowRecorder.loadRecording(filePath);

    if (!recording) {
      console.error(`Error: Could not load recording from ${filePath}`);
      return;
    }

    if (format === "json") {
      console.log(JSON.stringify(recording, null, 2));
      return;
    }

    // Summary format
    console.log(`\n📊 Workflow Recording: ${recording.recordingId}\n`);
    console.log(`Phase: ${recording.phase}`);
    console.log(`Timestamp: ${new Date(recording.timestamp).toLocaleString()}`);
    console.log(`Total Duration: ${recording.totalDuration}ms`);
    console.log(`Total Tokens: ${recording.totalTokenUsage.total}`);
    console.log(`Steps: ${recording.steps.length}`);

    if (recording.input) {
      console.log(`\n📋 Input:`);
      console.log(`  Images: ${recording.input.images?.length || 0}`);
      console.log(`  Text: ${recording.input.text ? "Yes" : "No"}`);
      console.log(`  Language: ${recording.input.language || "Not specified"}`);
    }

    if (format === "detailed") {
      console.log(`\n🔍 Steps:`);
      recording.steps.forEach((step, index) => {
        console.log(
          `  ${index + 1}. ${step.stepName} (${step.duration}ms, ${step.tokenUsage.total} tokens)`,
        );
        if (step.errors && step.errors.length > 0) {
          console.log(`     ❌ Errors: ${step.errors.length}`);
        }
        if (step.aiRequests && step.aiRequests.length > 0) {
          console.log(`     🤖 AI Requests: ${step.aiRequests.length}`);
        }
      });
    }

    if (recording.finalResult) {
      console.log(`\n✅ Final Result:`);
      const result = recording.finalResult;
      if (result.content) {
        console.log(`  Content Type: ${result.content.type || "Unknown"}`);
        console.log(`  Medical: ${result.content.isMedical ? "Yes" : "No"}`);
        console.log(
          `  Prescriptions: ${result.content.prescriptions?.length || 0}`,
        );
        console.log(
          `  Immunizations: ${result.content.immunizations?.length || 0}`,
        );
      }
      if (result.signals) {
        console.log(`  Signals: ${result.signals.length || 0}`);
      }
      if (result.error) {
        console.log(`  ❌ Error: ${result.error}`);
      }
    }
  }

  /**
   * Replay a workflow with live progress
   */
  async replayWorkflow(file?: string, options: CLIOptions = {}): Promise<void> {
    if (!file) {
      console.error("Error: --file parameter is required");
      return;
    }

    const filePath = this.resolveFilePath(file);
    const replay = createWorkflowReplay(filePath);

    if (!replay) {
      console.error(
        `Error: Could not load workflow for replay from ${filePath}`,
      );
      return;
    }

    const summary = replay.getWorkflowSummary();
    console.log(`\n🔄 Replaying workflow: ${summary.recordingId}`);
    console.log(
      `📊 ${summary.totalSteps} steps, ${summary.totalDuration}ms original duration\n`,
    );

    const results = await replay.replayWorkflow({
      stepDelay: options.delay, // Use CLI delay if provided
      verbose: options.verbose,
      useEnvironmentDelay: options.delay === undefined, // Use env delay if no CLI delay specified
    });

    console.log(`\n✅ Replay completed:`);
    console.log(`  Steps: ${results.length}`);
    console.log(`  Successful: ${results.filter((r) => r.success).length}`);
    console.log(`  Failed: ${results.filter((r) => !r.success).length}`);

    if (options.output) {
      const fs = require("fs");
      fs.writeFileSync(options.output, JSON.stringify(results, null, 2));
      console.log(`📄 Results saved to: ${options.output}`);
    }
  }

  /**
   * Extract a specific step from a workflow
   */
  async extractStep(
    file?: string,
    stepName?: string,
    format: string = "json",
  ): Promise<void> {
    if (!file) {
      console.error("Error: --file parameter is required");
      return;
    }

    const filePath = this.resolveFilePath(file);
    const replay = createWorkflowReplay(filePath);

    if (!replay) {
      console.error(`Error: Could not load workflow from ${filePath}`);
      return;
    }

    if (!stepName) {
      // List available steps
      const summary = replay.getWorkflowSummary();
      console.log(`\n📋 Available steps in ${summary.recordingId}:\n`);
      summary.steps.forEach((step: any, index: number) => {
        console.log(`  ${index + 1}. ${step.stepName} (${step.duration}ms)`);
      });
      console.log(`\nUse --step <step_name> to extract a specific step.`);
      return;
    }

    const stepState = replay.getStateAtStep(stepName);
    if (!stepState) {
      console.error(`Error: Step '${stepName}' not found in workflow`);
      return;
    }

    if (format === "json") {
      console.log(JSON.stringify(stepState, null, 2));
    } else {
      console.log(`\n📊 Step: ${stepName}\n`);
      console.log("State keys:", Object.keys(stepState));
      if (stepState.tokenUsage) {
        console.log(`Tokens used: ${stepState.tokenUsage.total}`);
      }
    }
  }

  /**
   * Compare two workflows
   */
  async compareWorkflows(file1?: string, file2?: string): Promise<void> {
    if (!file1 || !file2) {
      console.error("Error: Both --file and --compare parameters are required");
      return;
    }

    const path1 = this.resolveFilePath(file1);
    const path2 = this.resolveFilePath(file2);

    const recording1 = workflowRecorder.loadRecording(path1);
    const recording2 = workflowRecorder.loadRecording(path2);

    if (!recording1 || !recording2) {
      console.error("Error: Could not load one or both workflow recordings");
      return;
    }

    console.log(`\n📊 Comparing workflows:\n`);
    console.log(`A: ${recording1.recordingId} (${recording1.timestamp})`);
    console.log(`B: ${recording2.recordingId} (${recording2.timestamp})`);
    console.log();

    // Compare basic metrics
    console.log("📈 Metrics Comparison:");
    console.log(
      `Duration: ${recording1.totalDuration}ms vs ${recording2.totalDuration}ms`,
    );
    console.log(
      `Tokens: ${recording1.totalTokenUsage.total} vs ${recording2.totalTokenUsage.total}`,
    );
    console.log(
      `Steps: ${recording1.steps.length} vs ${recording2.steps.length}`,
    );
    console.log();

    // Compare step by step
    console.log("🔍 Step-by-Step Comparison:");
    const maxSteps = Math.max(recording1.steps.length, recording2.steps.length);

    for (let i = 0; i < maxSteps; i++) {
      const step1 = recording1.steps[i];
      const step2 = recording2.steps[i];

      if (step1 && step2) {
        const durationDiff = step2.duration - step1.duration;
        const tokenDiff = step2.tokenUsage.total - step1.tokenUsage.total;
        console.log(
          `  ${i + 1}. ${step1.stepName}: ${step1.duration}ms vs ${step2.duration}ms (${durationDiff > 0 ? "+" : ""}${durationDiff}ms)`,
        );
      } else if (step1) {
        console.log(`  ${i + 1}. ${step1.stepName}: Present in A only`);
      } else if (step2) {
        console.log(`  ${i + 1}. ${step2.stepName}: Present in B only`);
      }
    }
  }

  /**
   * Analyze workflow performance
   */
  async analyzePerformance(file?: string): Promise<void> {
    if (!file) {
      console.error("Error: --file parameter is required");
      return;
    }

    const filePath = this.resolveFilePath(file);
    const recording = workflowRecorder.loadRecording(filePath);

    if (!recording) {
      console.error(`Error: Could not load recording from ${filePath}`);
      return;
    }

    console.log(`\n⚡ Performance Analysis: ${recording.recordingId}\n`);

    // Overall stats
    const totalDuration = recording.totalDuration;
    const totalTokens = recording.totalTokenUsage.total;
    const stepCount = recording.steps.length;

    console.log("📊 Overall Performance:");
    console.log(`  Total Duration: ${totalDuration}ms`);
    console.log(
      `  Average Step Duration: ${Math.round(totalDuration / stepCount)}ms`,
    );
    console.log(`  Total Tokens: ${totalTokens}`);
    console.log(
      `  Average Tokens per Step: ${Math.round(totalTokens / stepCount)}`,
    );
    console.log();

    // Step performance
    console.log("🏃 Step Performance (sorted by duration):");
    const sortedSteps = [...recording.steps].sort(
      (a, b) => b.duration - a.duration,
    );

    sortedSteps.slice(0, 5).forEach((step, index) => {
      const percentage = Math.round((step.duration / totalDuration) * 100);
      console.log(
        `  ${index + 1}. ${step.stepName}: ${step.duration}ms (${percentage}%) - ${step.tokenUsage.total} tokens`,
      );
    });

    // AI request analysis
    const aiRequests = recording.steps.flatMap((step) => step.aiRequests || []);
    if (aiRequests.length > 0) {
      console.log();
      console.log("🤖 AI Request Analysis:");
      console.log(`  Total AI Requests: ${aiRequests.length}`);

      const avgDuration = Math.round(
        aiRequests.reduce((sum, req) => sum + req.duration, 0) /
          aiRequests.length,
      );
      console.log(`  Average AI Request Duration: ${avgDuration}ms`);

      const providers = new Set(aiRequests.map((req) => req.provider));
      console.log(`  Providers Used: ${Array.from(providers).join(", ")}`);
    }

    // Error analysis
    const errors = recording.steps.flatMap((step) => step.errors || []);
    if (errors.length > 0) {
      console.log();
      console.log("❌ Error Analysis:");
      console.log(`  Total Errors: ${errors.length}`);
      console.log(
        `  Steps with Errors: ${recording.steps.filter((s) => s.errors && s.errors.length > 0).length}`,
      );
    }
  }

  /**
   * Resolve file path (support both absolute and relative paths)
   */
  private resolveFilePath(file: string): string {
    if (file.startsWith("/")) {
      return file;
    }

    // Try relative to debug directory first
    const debugPath = join(this.debugDir, file);
    if (existsSync(debugPath)) {
      return debugPath;
    }

    // Try relative to current directory
    const relativePath = join(process.cwd(), file);
    if (existsSync(relativePath)) {
      return relativePath;
    }

    return debugPath; // Return debug path as default
  }

  /**
   * Show CLI help
   */
  private showHelp(): void {
    console.log(`
🔧 Workflow Debug CLI

Usage: workflow-cli <command> [options]

Commands:
  list                    List all available workflow recordings
  info --file <file>      Show detailed information about a recording
  replay --file <file>    Replay a workflow step by step
  extract --file <file>   Extract specific step data
  compare --file <f1> --compare <f2>  Compare two workflows
  analyze --file <file>   Analyze workflow performance

Options:
  --file, -f <file>       Workflow recording file
  --step, -s <step>       Specific step name to extract
  --output, -o <file>     Output file for results
  --format <format>       Output format: json, summary, detailed
  --compare, -c <file>    Second file for comparison
  --verbose, -v           Verbose output
  --delay, -d <ms>        Custom delay between steps (overrides environment)

Examples:
  workflow-cli list
  workflow-cli info --file workflow-analysis-2025-01-15.json
  workflow-cli replay --file my-workflow.json --verbose
  workflow-cli replay --file my-workflow.json --delay 1000
  workflow-cli extract --file my-workflow.json --step feature_detection
  workflow-cli compare --file workflow1.json --compare workflow2.json
  workflow-cli analyze --file my-workflow.json
    `);
  }
}

// Export for programmatic use
export function createWorkflowCLI(): WorkflowCLI {
  return new WorkflowCLI();
}

// CLI entry point
if (require.main === module) {
  const cli = new WorkflowCLI();
  cli.run(process.argv.slice(2)).catch(console.error);
}
