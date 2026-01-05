/**
 * Centralized Logging Service
 * - Preserves file/line numbers by calling console.* directly
 * - Clean namespace organization
 * - Environment-aware (dev vs prod)
 * - Runtime configurable via window object or localStorage
 */

export enum LogLevel {
  SILENT = 0,
  ERROR = 1,
  WARN = 2,
  INFO = 3,
  DEBUG = 4,
  TRACE = 5,
}

interface LoggerConfig {
  level: LogLevel;
  enabledNamespaces: string[];
  quietMode: boolean;
  enableTimestamp: boolean;
}

interface LoggerNamespace {
  error: (...args: any[]) => void;
  warn: (...args: any[]) => void;
  info: (...args: any[]) => void;
  debug: (...args: any[]) => void;
  trace: (...args: any[]) => void;
}

class CentralizedLogger {
  private static instance: CentralizedLogger;
  private config: LoggerConfig;
  private isDev: boolean;

  constructor() {
    // Detect development mode safely (Capacitor WebView may have unusual location)
    try {
      this.isDev =
        typeof window !== "undefined" &&
        window.location &&
        (window.location.hostname === "localhost" ||
          window.location.hostname === "127.0.0.1" ||
          (window.location.port !== "" && window.location.port !== undefined));
    } catch {
      this.isDev = false;
    }

    // Default configuration
    this.config = {
      level: this.isDev ? LogLevel.DEBUG : LogLevel.ERROR,
      enabledNamespaces: ["*"], // '*' means all namespaces enabled
      quietMode: false,
      enableTimestamp: this.isDev,
    };

    // Load configuration from localStorage if available
    try {
      this.loadConfig();
    } catch (e) {
      console.warn('[Logger] Failed to load config:', e);
    }

    // Make config accessible via window for runtime control
    try {
      this.exposeGlobalConfig();
    } catch (e) {
      console.warn('[Logger] Failed to expose global config:', e);
    }
  }

  static getInstance(): CentralizedLogger {
    if (!CentralizedLogger.instance) {
      CentralizedLogger.instance = new CentralizedLogger();
    }
    return CentralizedLogger.instance;
  }

  /**
   * Create a namespaced logger
   */
  namespace(name: string, emoji: string = "📝"): LoggerNamespace {
    return {
      error: (...args: any[]) => {
        if (this.shouldLog(LogLevel.ERROR, name)) {
          const prefix = this.buildPrefix("❌", name);
          console.error(prefix, ...args);
        }
      },
      warn: (...args: any[]) => {
        if (this.shouldLog(LogLevel.WARN, name)) {
          const prefix = this.buildPrefix("⚠️", name);
          console.warn(prefix, ...args);
        }
      },
      info: (...args: any[]) => {
        if (this.shouldLog(LogLevel.INFO, name)) {
          const prefix = this.buildPrefix(emoji, name);
          console.log(prefix, ...args);
        }
      },
      debug: (...args: any[]) => {
        if (this.shouldLog(LogLevel.DEBUG, name)) {
          const prefix = this.buildPrefix("🔍", name);
          console.log(prefix, ...args);
        }
      },
      trace: (...args: any[]) => {
        if (this.shouldLog(LogLevel.TRACE, name)) {
          const prefix = this.buildPrefix("🔬", name);
          console.log(prefix, ...args);
        }
      },
    };
  }

  /**
   * Pre-configured namespaces for common areas
   */
  get session() {
    return this.namespace("Session", "🏁");
  }
  get storage() {
    return this.namespace("Storage", "💾");
  }
  get audio() {
    return this.namespace("Audio", "📡");
  }
  get analysis() {
    return this.namespace("Analysis", "🔬");
  }
  get transcript() {
    return this.namespace("Transcript", "📝");
  }
  get sse() {
    return this.namespace("SSE", "📡");
  }
  get ui() {
    return this.namespace("UI", "🎨");
  }
  get api() {
    return this.namespace("API", "🔗");
  }
  get test() {
    return this.namespace("Test", "🧪");
  }
  get documents() {
    return this.namespace("Documents", "📄");
  }

  /**
   * Update logger configuration at runtime
   */
  updateConfig(newConfig: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.saveConfig();
  }

  /**
   * Get current configuration
   */
  getConfig(): LoggerConfig {
    return { ...this.config };
  }

  /**
   * Enable/disable specific namespaces
   */
  enableNamespaces(...namespaces: string[]): void {
    if (namespaces.includes("*")) {
      this.config.enabledNamespaces = ["*"];
    } else {
      // Add to existing enabled namespaces
      const current = this.config.enabledNamespaces.includes("*")
        ? []
        : this.config.enabledNamespaces;
      this.config.enabledNamespaces = [...new Set([...current, ...namespaces])];
    }
    this.saveConfig();
  }

  /**
   * Disable specific namespaces
   */
  disableNamespaces(...namespaces: string[]): void {
    if (this.config.enabledNamespaces.includes("*")) {
      // If all are enabled, disable only the specified ones
      const allNamespaces = [
        "Session",
        "Storage",
        "Audio",
        "Analysis",
        "Transcript",
        "SSE",
        "UI",
        "API",
        "Test",
        "Documents",
      ];
      this.config.enabledNamespaces = allNamespaces.filter(
        (ns) => !namespaces.includes(ns),
      );
    } else {
      this.config.enabledNamespaces = this.config.enabledNamespaces.filter(
        (ns) => !namespaces.includes(ns),
      );
    }
    this.saveConfig();
  }

  /**
   * Set log level
   */
  setLevel(level: LogLevel | keyof typeof LogLevel): void {
    if (typeof level === "string") {
      level = LogLevel[level];
    }
    this.config.level = level;
    this.saveConfig();
  }

  private shouldLog(level: LogLevel, namespace: string): boolean {
    if (this.config.quietMode) return false;
    if (level > this.config.level) return false;

    // Check if namespace is enabled
    if (this.config.enabledNamespaces.includes("*")) return true;
    return this.config.enabledNamespaces.includes(namespace);
  }

  private buildPrefix(emoji: string, namespace: string): string {
    const timestamp = this.config.enableTimestamp
      ? `[${new Date().toLocaleTimeString()}] `
      : "";
    return `${emoji} ${timestamp}[${namespace}]`;
  }

  private loadConfig(): void {
    if (typeof localStorage === "undefined") return;

    try {
      const stored = localStorage.getItem("mediqom_logger_config");
      if (stored) {
        const parsed = JSON.parse(stored);
        this.config = { ...this.config, ...parsed };
      }
    } catch (error) {
      console.warn("Failed to load logger config from localStorage:", error);
    }
  }

  private saveConfig(): void {
    if (typeof localStorage === "undefined") return;

    try {
      localStorage.setItem(
        "mediqom_logger_config",
        JSON.stringify(this.config),
      );
    } catch (error) {
      console.warn("Failed to save logger config to localStorage:", error);
    }
  }

  private exposeGlobalConfig(): void {
    if (typeof window === "undefined") return;

    // Expose logger control via window object
    (window as any).logger = {
      config: () => this.getConfig(),
      setLevel: (level: LogLevel | keyof typeof LogLevel) =>
        this.setLevel(level),
      enable: (...namespaces: string[]) => this.enableNamespaces(...namespaces),
      disable: (...namespaces: string[]) =>
        this.disableNamespaces(...namespaces),
      quiet: (enable: boolean = true) =>
        this.updateConfig({ quietMode: enable }),
      timestamp: (enable: boolean = true) =>
        this.updateConfig({ enableTimestamp: enable }),

      // Convenience methods
      levels: LogLevel,
      reset: () => {
        this.config = {
          level: this.isDev ? LogLevel.DEBUG : LogLevel.ERROR,
          enabledNamespaces: ["*"],
          quietMode: false,
          enableTimestamp: this.isDev,
        };
        this.saveConfig();
      },

      // Debug helpers
      test: () => {
        const testLog = this.namespace("TestLogger", "🧪");
        testLog.error("Test error message");
        testLog.warn("Test warning message");
        testLog.info("Test info message");
        testLog.debug("Test debug message");
        testLog.trace("Test trace message");
      },
    };

    // Log configuration info in development
    if (this.isDev) {
      console.log("🔧 Logger initialized. Control via window.logger");
      console.log("   window.logger.config() - View current config");
      console.log('   window.logger.setLevel("DEBUG") - Set log level');
      console.log('   window.logger.enable("Session") - Enable namespace');
      console.log('   window.logger.disable("Audio") - Disable namespace');
      console.log("   window.logger.quiet(true) - Enable quiet mode");
      console.log("   window.logger.test() - Test all log levels");
    }
  }
}

// Create and export singleton instance
const loggerInstance = CentralizedLogger.getInstance();

// Export convenient access to namespaces
export const log = {
  session: loggerInstance.session,
  storage: loggerInstance.storage,
  audio: loggerInstance.audio,
  analysis: loggerInstance.analysis,
  transcript: loggerInstance.transcript,
  sse: loggerInstance.sse,
  ui: loggerInstance.ui,
  api: loggerInstance.api,
  test: loggerInstance.test,
  documents: loggerInstance.documents,

  // Custom namespace creator
  namespace: (name: string, emoji?: string) =>
    loggerInstance.namespace(name, emoji),

  // Configuration methods
  config: () => loggerInstance.getConfig(),
  setLevel: (level: LogLevel | keyof typeof LogLevel) =>
    loggerInstance.setLevel(level),
  enable: (...namespaces: string[]) =>
    loggerInstance.enableNamespaces(...namespaces),
  disable: (...namespaces: string[]) =>
    loggerInstance.disableNamespaces(...namespaces),
};

// Export types for external use
export type { LoggerConfig, LoggerNamespace };

// Export the main logger instance for advanced usage
export { loggerInstance as logger };
