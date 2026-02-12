import { SpeechClient, protos } from "@google-cloud/speech";
import * as fs from "fs";

const AudioEncoding = protos.google.cloud.speech.v1.RecognitionConfig.AudioEncoding;

let client: SpeechClient;

function getClient() {
  if (client) {
    return client;
  }
  return (client = new SpeechClient());
}

export async function transcribeAudio(
  audio_url: string = "https://assembly.ai/sports_injuries.mp3",
  fileName?: string,
) {
  // Set config for Diarization
  const diarizationConfig = {
    enableSpeakerDiarization: true,
    maxSpeakerCount: 3,
  };

  const config = {
    encoding: AudioEncoding.LINEAR16,
    sampleRateHertz: 8000,
    languageCode: "en-US",
    diarizationConfig: diarizationConfig,
    model: "phone_call",
  };

  const audio = {
    content: fs.readFileSync(fileName || audio_url).toString("base64"),
  };

  const request = {
    config: config,
    audio: audio,
  };

  const response = await client.recognize(request);
  const [recognizeResponse] = response;
  const transcription = recognizeResponse.results
    ?.map((result: any) => result.alternatives?.[0]?.transcript)
    .join("\n");
  console.log(`Transcription: ${transcription}`);
  console.log("Speaker Diarization:");
  const results = recognizeResponse.results || [];
  const result = results[results.length - 1];
  const wordsInfo = result?.alternatives?.[0]?.words || [];
  // Note: The transcript within each result is separate and sequential per result.
  // However, the words list within an alternative includes all the words
  // from all the results thus far. Thus, to get all the words with speaker
  // tags, you only have to take the words list from the last result:
  wordsInfo.forEach((a: any) =>
    console.log(` word: ${a.word}, speakerTag: ${a.speakerTag}`),
  );
}
