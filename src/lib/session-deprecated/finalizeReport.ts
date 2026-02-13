import type { FunctionDefinition } from "@langchain/core/language_models/base";

import { error } from "@sveltejs/kit";
import report from "$lib/configurations/session.report";
import tags from "$lib/configurations/tags";
import { fetchGptEnhanced } from "$lib/ai/providers/enhanced-abstraction";
import { type Content, type TokenUsage } from "$lib/ai/types.d";
import { updateLanguage } from "$lib/ai/schema";
import { sleep } from "$lib/utils";
import { DEBUG_CONVERASATION_REPORT } from "$env/static/private";
import { logger } from "$lib/logging/logger";

const DEBUG = DEBUG_CONVERASATION_REPORT === "true";
/**
 * TODO:
 * - gtp-4o (7k) vs gpt-4o-mini (40k) -
 * - test multi-model setups for GP, PT, etc. medical configurations.
 */

export interface Report {
  tokenUsage: TokenUsage;
  diagnosis: {
    name: string;
    origin: string;
    basis: string;
    probability: number;
  }[];
  treatment: {
    description: string;
    origin: string;
  }[];
  followUp: {
    type: string;
    name: string;
    reason: string;
    origin: string;
  }[];
  medication: {
    name: string;
    dosage: number;
    days: string;
    days_of_week: string[];
    time_of_day: string;
    origin: string;
  }[];
}
enum Types {
  report = "report",
}

type Input = {
  text?: string;
  language?: string;
};

const schemas: {
  [key: string]: FunctionDefinition;
} = {
  report: report as FunctionDefinition,
};

let localizedSchemas = updateLanguage(JSON.parse(JSON.stringify(schemas)));

// extend common schemas

export async function finalize(input: Input): Promise<Report> {
  const tokenUsage: TokenUsage = {
    total: 0,
  };

  const currentLanguage = input.language || "English";

  localizedSchemas = updateLanguage(
    JSON.parse(JSON.stringify(schemas)),
    currentLanguage,
  );

  logger.analysis.debug("Schema updated...", { inputType: typeof input.text });

  if (DEBUG) {
    await sleep(200);
    // @ts-expect-error - Test data structure mismatch with Report interface
    return Promise.resolve(
      TEST_DATA[Math.floor(Math.random() * TEST_DATA.length)],
    );
  }

  // get basic item info
  let data = (await evaluate(
    [
      {
        type: "text",
        text: input.text,
      },
    ],
    Types.report,
    tokenUsage,
  )) as Report;
  logger.analysis.debug("Input assessed...");

  /*
    data.fhir = await evaluate([{
      type: 'text',
      text: JSON.stringify(data)
    }], Types.fhir, tokenUsage);
*/
  data.tokenUsage = tokenUsage;

  logger.analysis.info("Report finalized", {
    totalTokens: data.tokenUsage.total,
  });
  // return item
  return data;
}

export async function evaluate(
  content: Content[],
  type: Types,
  tokenUsage: TokenUsage,
): Promise<Report> {
  const schema = localizedSchemas[type];

  if (!schema) error(500, { message: "Invalid type" });

  return (await fetchGptEnhanced(content, schema, tokenUsage)) as Report;
}

const TEST_DATA = [
  {
    findings:
      "Pacient trpí bolavým krkem a horečkou, nemožnost polykání, bolestí hlavy, zhoršujícím se zrakem a bílým povlakem na jazyku. Na základě těchto příznaků byla diagnostikována angína s průměrnou pravděpodobností 85 %. Teplota pacienta byla 37,6 °C, což je mírně nad normou.",
    treatment:
      "Doporučuje se vyhýbat kontaktu s nemocnými lidmi a místům s velkou koncentrací osob. Tento plán ošetření byl vytvořen na základě doporučení specialisty.",
    medication:
      "Pacient bude užívat Paracetamol v dávce 500 mg ráno, odpoledne a večer po dobu 3 až 5 dnů. Každodenní užívání léku je doporučeno. Tento lékový plán byl vytvořen na základě odborného názoru specialisty.",
    "follow-up":
      "Je doporučeno provést krevní test, který by mohl potvrdit mononukleózu nebo jinou infekci. Krevní test je navrhován na základě pozorovaných symptomů.",
    recommendations:
      "Pacient by se měl vyhýbat kontaktu s nemocnými lidmi a místům s vysokou koncentrací osob, aby se snížilo riziko další infekce. Tyto doporučení byly navrženy specialistou.",
    tokenUsage: {
      total: 1111,
      "You a medical professional assistent of doctor and you will prepare a final report from his session with a patient. Continue step by step. In the input JSON you have th inital ananlysis. Step 1: Take the analysis and its properties - complaint, symptoms, diagnosis, treatment, medication, follow-up and patient. Step 2: Generate a json according to the definition bellow in a simple and understandable language and markdown format. All test should be based on the provided JSON input and no additional information should be added. Your task is to phrase the JSON. Provide all answers in [LANGUAGE] language.": 1111,
    },
  },
];
