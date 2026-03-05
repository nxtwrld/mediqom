import { writable } from "svelte/store";
import type { Writable } from "svelte/store";
import ui from "$lib/ui";

export interface Focused {
  object: string | undefined;
}

const focused: Writable<Focused> = writable({
  object: undefined,
});

// listen to viewer event and focus object if passed
ui.listen(
  "viewer:anatomy",
  (
    object:
      | true
      | false
      | {
          object: string;
        },
  ) => {
    if (typeof object == "object") focused.set(object);
  },
);

export default focused;
