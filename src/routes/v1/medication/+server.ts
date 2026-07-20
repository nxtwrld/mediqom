import { error, json, type RequestHandler } from "@sveltejs/kit";
import { isFeatureEnabled } from "$lib/config/feature-flags";

const routes = {
  POR: "ORAL",
  DRM: "TOPICAL",
};

const form = {
  "TBL FLM": "TABLET",
  TBL: "TABLET",
  "TBL EFF": "TABLET",
  CPS: "CAPSULE",
  "CPS MOL": "CAPSULE",
  CRM: "TOPICAL",
  GEL: "TOPICAL",
};

export const GET: RequestHandler = async ({ url }) => {
  if (!isFeatureEnabled("MEDICATIONS")) error(404, { message: "Not found" });

  const str = url.searchParams.get("drug") || "";

  if (str.length < 3) {
    return json([]);
  }

  const response = await fetch("https://prehledy.sukl.cz/prehledy/v1/dlprc", {
    method: "POST",
    mode: "cors",
    cache: "no-cache",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
    },
    redirect: "follow",
    referrerPolicy: "no-referrer",
    body: JSON.stringify({
      filtr: str,
      pocet: 20,
      stranka: 1,
      sort: ["nazev"],
      smer: "asc",
      leciveLatky: [],
      leciveLatkyOperace: "OR",
      atc: "",
      cestaPodani: "",
      drzitelRegistrace: [],
      stavRegistrace: "",
      zpusobVydeje: [],
      uhrada: [],
      dovoz: "",
      jeDodavka: false,
      stavZruseni: "N",
      ochrannyPrvek: "X",
      dostupnost: [],
    }),
  });
  const data = await response.json();

  return json(
    data.data.map((item: any) => {
      if ((routes as any)[item.cestaPodani.kod]) {
        console.log("route not found", item.cestaPodani);
      }
      if ((form as any)[item.lekovaForma.kod]) {
        console.log("form not found", item.lekovaForma);
      }
      return {
        title: item.nazevLP,
        dosage: item.sila,
        more: item.doplenkNazvu,
        route: (routes as any)[item.cestaPodani.kod],
        form: (form as any)[item.lekovaForma.kod],
      };
    }),
  );
  //return new Response(data);
};
