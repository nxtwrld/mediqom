/**
 * Shared types for the chat safety layer.
 */

export interface OutputSafetyResult {
  safe: boolean;
  flags: string[];
  severity: "none" | "low" | "high";
}

export interface EmergencyPattern {
  pattern: RegExp;
  category: string;
}

export interface InjectionPattern {
  pattern: RegExp;
  description: string;
}
