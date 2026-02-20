import type { PageLoad } from "./$types";
import formPreSchema from "$lib/selfassess/forms/form.serenity-therapeutic-pre.json";
import formPostSchema from "$lib/selfassess/forms/form.serenity-therapeutic-post.json";

export const load: PageLoad = async () => {
  return {
    formSchemas: {
      pre: formPreSchema,
      post: formPostSchema,
    },
  };
};
