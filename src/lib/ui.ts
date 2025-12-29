import EventEmitter from "eventemitter3";
import { writable, type Writable, get } from "svelte/store";

export enum Overlay {
  none = "none",
  import = "import",
}

export const state: Writable<{
  overlay: Overlay;
  viewer: boolean;
}> = writable({
  overlay: Overlay.none,
  viewer: false,
});

class UIEvents extends EventEmitter {
  context: string | null = null;
  private latestEvents = new Map<string, { data: any; timestamp: Date }>();

  constructor() {
    super();

    this.on("context", (context: string | null) => {
      this.context = context;
    });
  }

  listen(event: string, fn: (...args: any[]) => void) {
    this.on(event, fn);
    return () => {
      this.off(event, fn);
    };
  }

  emit(event: string | symbol, ...args: any[]) {
    // Store the latest event data for string events
    if (typeof event === "string") {
      this.latestEvents.set(event, { data: args[0], timestamp: new Date() });
    }
    return super.emit(event, ...args);
  }

  /**
   * Get the latest event data for a specific event
   */
  getLatest(event: string): { data: any; timestamp: Date } | null {
    return this.latestEvents.get(event) || null;
  }

  /**
   * Clear the latest event data for a specific event
   */
  clearLatest(event: string): void {
    this.latestEvents.delete(event);
  }

  /**
   * Get all latest events
   */
  getAllLatest(): Record<string, { data: any; timestamp: Date }> {
    return Object.fromEntries(this.latestEvents);
  }

  confirm(message: string) {
    return new Promise((resolve) => {
      // TODO: custom confirm

      this.emit("confirm", {
        message,
        resolve: (response: boolean) => {
          resolve(response);
        },
      });
      //const result: boolean = (window as any).confirm(message)
      // resolve(result);
    });
  }

  prompt(
    message:
      | string
      | {
          message?: string;
          type?: "text" | "password";
          defaultValue?: string;
          component?: Promise<any>;
          [key: string]: any;
        },
    type: "text" | "password" = "text",
    defaultValue: string = "",
  ): Promise<string | any | false> {
    return new Promise((resolve) => {
      let config: any = {
        resolve: (response: string) => {
          resolve(response);
        },
      };
      if (typeof message === "string") {
        config = {
          ...config,
          message,
          defaultValue,
          type,
        };
      } else {
        config = Object.assign(config, message);
      }
      this.emit("prompt", config);
    });
  }
}

const ui = new UIEvents();

export default ui;

export const confirm = ui.confirm.bind(ui);
export const prompt = ui.prompt.bind(ui);
