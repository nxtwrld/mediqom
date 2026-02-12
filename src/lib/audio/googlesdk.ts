import { google } from "@google-cloud/speech";

let client: google.SpeechClient;

function getClient() {
  if (client) {
    return client;
  }
  return (client = new google.SpeechClient());
}

export async function transcribeAudio(
  audio_url: string = "https://assembly.ai/sports_injuries.mp3",
) {
  // Set config for Diarization
  const diarizationConfig = {
    enableSpeakerDiarization: true,
    maxSpeakerCount: 3,
  };

  const config = {
    encoding: "LINEAR16",
    sampleRateHertz: 8000,
    languageCode: "en-US",
    diarizationConfig: diarizationConfig,
    model: "phone_call",
  };

  const audio = {
    content: fs.readFileSync(fileName).toString("base64"),
  };

  const request = {
    config: config,
    audio: audio,
  };

  const [response] = await client.recognize(request);
  const transcription = response.results
    .map((result: any) => result.alternatives[0].transcript)
    .join("\n");
  console.log(`Transcription: ${transcription}`);
  console.log("Speaker Diarization:");
  const result = response.results[response.results.length - 1];
  const wordsInfo = result.alternatives[0].words;
  // Note: The transcript within each result is separate and sequential per result.
  // However, the words list within an alternative includes all the words
  // from all the results thus far. Thus, to get all the words with speaker
  // tags, you only have to take the words list from the last result:
  wordsInfo.forEach((a: any) =>
    console.log(` word: ${a.word}, speakerTag: ${a.speakerTag}`),
  );
}
