// Re-export from store for universal device state
export {
  device,
  orientation,
  connectivity,
  screen,
  preferences,
} from "./device/store";
export type { DeviceState, DeviceOrientation } from "./device/store";

// Keep existing helper function for backward compatibility
export function isTouchDevice() {
  return "ontouchstart" in window || navigator.maxTouchPoints > 0;
}
