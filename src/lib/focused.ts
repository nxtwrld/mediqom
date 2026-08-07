import { writable } from "svelte/store";
import type { Writable } from "svelte/store";
import ui from "$lib/ui";

export interface Focused {
  object: string | undefined;
}

const focused: Writable<Focused> = writable({
  object: undefined,
});

/**
 * `viewer:anatomy` is overloaded: a boolean just opens the anatomy panel, while
 * an object additionally focuses a mesh. The only recognised focus shape is
 * `{ object }` — emitters must use that key (see SectionBody, SectionImaging,
 * care-plan). Anything else is ignored rather than applied, so a malformed
 * payload can no longer silently clear an existing highlight.
 */
export type AnatomyViewerPayload = boolean | { object?: string };

ui.listen("viewer:anatomy", (payload: AnatomyViewerPayload) => {
  if (typeof payload !== "object" || payload === null) return;
  if (typeof payload.object !== "string" || !payload.object) {
    console.warn("[focused] viewer:anatomy payload has no object:", payload);
    return;
  }
  focused.set({ object: payload.object });
});

export default focused;
