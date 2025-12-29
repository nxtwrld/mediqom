import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ params }) => {
  return {
    document_id: params.document_id,
    profileId: params.profile,
  };
};
