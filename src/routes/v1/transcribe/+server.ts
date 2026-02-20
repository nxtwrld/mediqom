import { error, json, type RequestHandler } from "@sveltejs/kit";
import { transcriptionProvider } from "$lib/ai/providers/transcription-abstraction";

export const POST: RequestHandler = async ({ request }) => {
  //const str = url.searchParams.get('drug');
  let instructions = {
    lang: "en",
  };
  const formData = await request.formData();
  const uploadedFile = await formData?.get("file");
  const instructionsExtend = await formData?.get("instructions");

  if (instructionsExtend !== undefined) {
    try {
      instructions = Object.assign(
        instructions,
        JSON.parse(instructionsExtend as string),
      );
    } catch (e) {
      console.log(e);
    }
  }
  //console.log(instructions);

  //return json({'message': 'success'});
  if (!uploadedFile) {
    error(400, { message: "No file provided" });
  }
  if (uploadedFile instanceof File === false) {
    error(400, { message: "Invalid file" });
  }

  // Validate MIME type matches OpenAI Whisper supported formats
  const supportedMimeTypes = [
    "audio/flac",
    "audio/m4a",
    "audio/x-m4a",
    "audio/mp3",
    "audio/mpeg",
    "audio/mp4",
    "video/mp4",
    "audio/oga",
    "audio/ogg",
    "audio/wav",
    "audio/x-wav",
    "audio/webm",
  ];

  if (!supportedMimeTypes.includes(uploadedFile.type)) {
    error(400, {
      message: `Invalid file type: ${uploadedFile.type}. Supported: ${supportedMimeTypes.join(", ")}`,
    });
  }

  // Initialize transcription provider and transcribe
  await transcriptionProvider.initialize();
  const result = await transcriptionProvider.transcribeAudioCompatible(
    uploadedFile,
    instructions,
  );

  /*const bytes = new Uint8Array(await uploadedFile.arrayBuffer());

    const result = await transcribeAudio(bytes, instructions);*/

  return json(result);
};
