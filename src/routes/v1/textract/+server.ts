import { error, json, type RequestHandler } from "@sveltejs/kit";
import { ChatOpenAI } from "@langchain/openai";
import { JsonOutputFunctionsParser } from "langchain/output_parsers";
import { HumanMessage } from "@langchain/core/messages";
import type { Extractor } from "$lib/textract";
//import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
//import { type RunnableConfig, RunnableWithMessageHistory } from "@langchain/core/runnables";
//import { ChatMessageHistory } from "@langchain/community/stores/message/in_memory";
import { OPENAI_API_KEY } from "$env/static/private";
import diagnosis from "./diagnosis.json";
import gp_report from "./gp_report.json";
// Instantiate the parser
const parser = new JsonOutputFunctionsParser();

const schemas: {
  [key: string]: Extractor;
} = {};

schemas.diagnosis = diagnosis as Extractor;
schemas.gp_report = gp_report as Extractor;

// Define the function schema
/*
const extractionFunctionSchema = {
  name: "extractor",
  description: "As a medical professional asses the user input and extracts fields from the input.",
  parameters: {
    type: "object",
    properties: {
      days: {
        type: "string",
        enum: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
        description: "What days is the medication supposed to be taken",
      },
      time_of_day: {
        type: "string",
        enum: ["morning", "afternoon", "evening", "night"],
        description: "What time of the day is the medication supposed to be taken",
      },
      medication: {
        type: "string",
        description: "The name of the medication",
      },
      dosage: {
        type: "number",
        description: "The number of pilss that is supposed to taken every occation",
      },
      chat_response: {
        type: "string",
        description: "An empathic and encouraging response to the human's input",
      },
    },
    required: ["days", "medication", "dosage", "chat_response"],
  },
};
*/

/**
{
  result: {
    tone: 'positive',
    word_count: 4,
    chat_response: "Indeed, it's a lovely day!"
  }
}
 */

export const POST: RequestHandler = async ({ request }) => {
  //const str = url.searchParams.get('drug');

  const data = await request.json();

  //console.log({ data } );
  // Instantiate the ChatOpenAI class
  const model = new ChatOpenAI({
    model: "gpt-4o",
    apiKey: OPENAI_API_KEY,
    callbacks: [
      {
        handleLLMEnd(output, runId, parentRunId, tags) {
          const llmOutput = output.llmOutput ?? {};
          console.log("Token Usage", (llmOutput as any).tokenUsage?.totalTokens);
        },
      },
    ],
  });

  // Create a new runnable, bind the function to the model, and pipe the output through the parser

  if (typeof data.schema == "string") {
    if (schemas[data.schema] === undefined) {
      error(404, { message: "Schema does not exist: " + data.schema });
    } else {
      data.schema = schemas[data.schema];
    }
  }

  const runnable = model
    .bind({
      functions: [data.schema],
      function_call: { name: "extractor" },
    })
    .pipe(parser);

  // Invoke the runnable with an input
  const result = await runnable.invoke([new HumanMessage(data.text)]);

  //console.log({ result });

  return json(result);
};
