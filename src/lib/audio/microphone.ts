//import EventEmmiter from 'events';
import Meyda from "meyda";
import { Mp3Encoder } from "lamejs";
import MPEGMode from "lamejs/src/js/MPEGMode";
import Lame from "lamejs/src/js/Lame";
import BitStream from "lamejs/src/js/BitStream";
import type { AudioData } from "assemblyai";
//import { MicVAD } from "@ricky0123/vad-web";

// Declare global vad loaded from external script
declare const vad: any;

const CHUNK_SIZE = 1024;

export enum AudioState {
  Ready = "ready",
  Listening = "listening",
  Speaking = "speaking", 
  Stopping = "stopping",
  Stopped = "stopped",
  Error = "error",
}

export type AudioOptions = {
  dataSize?: number;
  analyzer?: boolean;
  bufferSize?: number;
  audioContext?: boolean;
};

export interface AudioControls {
  stop: () => void;
  start: () => void;
  state: AudioState;
  onFeatures?: (d: Meyda.MeydaFeaturesObject) => void;
  onData?: (d: AudioData) => void;
  mediaRecorder?: MediaRecorder;
  audioContext?: AudioContext;
  source?: MediaStreamAudioSourceNode;
  stream?: MediaStream;
}

export interface AudioControlsVad extends AudioControls {
  onFrameProcessed: (callback: (frame: Float32Array) => void) => void;
  onSpeechStart?: () => void;
  onSpeechEnd?: (audio: Float32Array) => void;
}

async function loadScript(src: string) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.onload = resolve;
    script.onerror = reject;
    script.src = src;
    document.head.appendChild(script);
  });
}

export async function getAudioVAD(
  options: AudioOptions = {
    dataSize: 250,
    analyzer: false,
    bufferSize: 512,
    audioContext: true,
  },
): Promise<AudioControlsVad | Error> {
  options = Object.assign(
    {
      dataSize: 250,
      analyzer: false,
      bufferSize: 512,
      audioContext: true,
    },
    options,
    {
      audioContext: true,
    },
  );

  const controls = (await getAudio(options)) as AudioControlsVad;

  await loadScript("/onnx/ort.js");
  await loadScript("/onnx/bundle.min.js");

  const mvad = await vad.MicVAD.new({
    stream: controls.stream,
    onSpeechStart: () => {
      //console.log("Speech start detected")
      controls.state = AudioState.Speaking;
      if (controls.onSpeechStart) controls.onSpeechStart();
    },
    onSpeechEnd: (audio: Float32Array) => {
      // do something with `audio` (Float32Array of audio samples at sample rate 16000)...
      //console.log("Speech end detected", audio)

      if (controls.state == AudioState.Stopping) {
        mvad.pause();
        stop();
        controls.state = AudioState.Stopped;
      } else {
        controls.state = AudioState.Listening;
      }
      if (controls.onSpeechEnd) controls.onSpeechEnd(audio);
    },
  });
  const start = controls.start;
  const stop = controls.stop;
  controls.start = () => {
    start();
    mvad.start();
  };
  controls.stop = () => {
    console.log("[VAD] Stopping VAD and MediaStream...");

    // Clean up VAD and its internal MediaStream
    if (mvad) {
      if (typeof mvad.destroy === "function") {
        mvad.destroy();
        console.log("[VAD] VAD destroyed successfully");
      } else {
        // Manual cleanup for VAD's internal MediaStream (critical for Chrome tab indicator)
        if (mvad.stream) {
          mvad.stream.getTracks().forEach((track: MediaStreamTrack) => track.stop());
          console.log("[VAD] VAD MediaStream tracks stopped");
        }

        // Close VAD's AudioContext if not already closed
        if (mvad.audioContext && mvad.audioContext.state !== "closed") {
          mvad.audioContext
            .close()
            .catch((err: Error) =>
              console.warn("[VAD] AudioContext close error:", err),
            );
        }

        mvad.pause();
      }
    }

    // Stop the original audio processor
    stop();
    controls.state = AudioState.Stopped;
  };

  return controls as AudioControlsVad;
}

export async function getAudio(
  options: AudioOptions = {
    dataSize: 250,
    analyzer: false,
    audioContext: false,
    bufferSize: 512,
  },
): Promise<AudioControls | Error> {
  options = Object.assign(
    {
      dataSize: 250,
      analyzer: false,
      bufferSize: 512,
    },
    options,
  );

  return await navigator.mediaDevices
    .getUserMedia({ audio: true })
    .then((stream) => {
      // Proceed with audio processing

      const mediaRecorder = new MediaRecorder(stream);
      let analyzer: Meyda.MeydaAnalyzer | undefined;
      let audioContext: AudioContext | undefined;
      let source: MediaStreamAudioSourceNode | undefined;

      // create audio context
      if (options.audioContext || options.analyzer) {
        audioContext = new AudioContext();
        source = audioContext.createMediaStreamSource(stream);
      }

      const controls: AudioControls = {
        mediaRecorder,
        audioContext,
        source,
        stream,
        state: AudioState.Ready,
        stop: () => {
          console.log("[AudioControls] Stopping audio components...");

          if (analyzer) {
            analyzer.stop();
          }

          if (mediaRecorder && mediaRecorder.state === "recording") {
            mediaRecorder.stop();
          }

          controls.state = AudioState.Stopped;

          // Stop all MediaStream tracks
          stream.getTracks().forEach((track) => {
            track.stop();
            stream.removeTrack(track);
          });

          // Clean up references
          delete controls.stream;
          delete controls.mediaRecorder;
          delete controls.audioContext;
          delete controls.source;
          console.log("[AudioControls] Audio cleanup completed");
        },
        start: () => {
          mediaRecorder.start(options.dataSize);
          if (analyzer) analyzer.start();
          controls.state = AudioState.Listening;
        },
      };

      mediaRecorder.addEventListener("dataavailable", (event) => {
        if (controls.onData) controls.onData(event.data as unknown as AudioData);
      });

      // create analyzer instance
      if (options.analyzer) {
        analyzer = Meyda.createMeydaAnalyzer({
          audioContext,
          source,
          bufferSize: options.bufferSize,
          featureExtractors: ["rms", "energy"], // 'zcr', 'amplitudeSpectrum', 'chroma', 'mfcc', 'loudness'],
          callback: (features: Meyda.MeydaFeaturesObject) => {
            //console.log(features);
            if (controls.onFeatures) controls.onFeatures(features);
          },
        });
      }
      return controls;
    })
    .catch((error) => {
      console.error("Microphone access denied:", error);
      return error;
    });
}

export async function convertFloat32ToMp3(
  arrayBuffer: Float32Array,
  sampleRate: number = 16000,
): Promise<Blob> {
  (window as any).MPEGMode = MPEGMode;
  (window as any).Lame = Lame;
  (window as any).BitStream = BitStream;

  const int16Array = convertFloat32ToInt16(arrayBuffer);
  const mp3encoder = new Mp3Encoder(1, sampleRate, 128); // Mono, sample rate, 128 kbps
  const sampleBlockSize = 1152; // Number of samples per frame
  const mp3Data = [];

  for (let i = 0; i < int16Array.length; i += sampleBlockSize) {
    const sampleChunk = int16Array.subarray(i, i + sampleBlockSize);
    const mp3buf = mp3encoder.encodeBuffer(sampleChunk);
    if (mp3buf.length > 0) {
      mp3Data.push(mp3buf);
    }
  }
  const endBuf = mp3encoder.flush();
  if (endBuf.length > 0) {
    mp3Data.push(endBuf);
  }
  return new Blob(mp3Data, { type: "audio/mp3" });
}

export async function convertBlobToMp3(audioBlob: Blob): Promise<Blob> {
  (window as any).MPEGMode = MPEGMode;
  (window as any).Lame = Lame;
  (window as any).BitStream = BitStream;

  // Step 1: Decode the merged Blob to obtain PCM data
  const audioContext = new (window.AudioContext ||
    (window as any).webkitAudioContext)();
  const arrayBuffer = await audioBlob.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

  console.log("AudioBuffer", audioBuffer);
  // Step 2: Encode PCM data into MP3 format
  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const mp3Encoder = new Mp3Encoder(numChannels, sampleRate, 128);

  const mp3Data: Uint8Array[] = [];
  const sampleBlockSize = 1152;

  const samplesLeft = audioBuffer.getChannelData(0);
  let samplesRight: Float32Array | null = null;
  if (numChannels === 2) {
    samplesRight = audioBuffer.getChannelData(1);
  }

  let sampleIndex = 0;

  while (sampleIndex < samplesLeft.length) {
    const sampleChunkLeft = samplesLeft.subarray(
      sampleIndex,
      sampleIndex + sampleBlockSize,
    );
    let mp3buf: Int8Array | Uint8Array;

    if (numChannels === 2 && samplesRight) {
      const sampleChunkRight = samplesRight.subarray(
        sampleIndex,
        sampleIndex + sampleBlockSize,
      );
      mp3buf = mp3Encoder.encodeBuffer(
        interleaveSamples(sampleChunkLeft, sampleChunkRight),
      );
    } else {
      mp3buf = mp3Encoder.encodeBuffer(convertFloat32ToInt16(sampleChunkLeft));
    }

    if (mp3buf.length > 0) {
      mp3Data.push(new Uint8Array(mp3buf));
    }
    sampleIndex += sampleBlockSize;
  }

  // Finish encoding
  const mp3buf = mp3Encoder.flush();
  if (mp3buf.length > 0) {
    mp3Data.push(new Uint8Array(mp3buf));
  }

  // Create a Blob from MP3 data
  const mp3Blob = new Blob(mp3Data, { type: "audio/mp3" });

  return mp3Blob;
}

// Helper function to convert Float32Array to Int16Array
function convertFloat32ToInt16(buffer: Float32Array): Int16Array {
  const l = buffer.length;
  const buf = new Int16Array(l);

  for (let i = 0; i < l; i++) {
    let s = Math.max(-1, Math.min(1, buffer[i]));
    buf[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return buf;
}

// Helper function to interleave samples for stereo audio
function interleaveSamples(
  left: Float32Array,
  right: Float32Array,
): Int16Array {
  const length = left.length + right.length;
  const result = new Int16Array(length);

  let index = 0;
  let inputIndex = 0;

  while (index < length) {
    let s = Math.max(-1, Math.min(1, left[inputIndex]));
    result[index++] = s < 0 ? s * 0x8000 : s * 0x7fff;

    s = Math.max(-1, Math.min(1, right[inputIndex]));
    result[index++] = s < 0 ? s * 0x8000 : s * 0x7fff;

    inputIndex++;
  }
  return result;
}

/*
export async function getAudio() {
    const emitter = new EventEmmiter();
    let mediaRecorder: MediaRecorder = await navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
        
            mediaRecorder = new MediaRecorder(stream);
            let audioChunks: Blob[] = [];
            mediaRecorder.addEventListener('dataavailable', event => {
                audioChunks.push(event.data);
        
                if (mediaRecorder.state === 'recording' && audioChunks.length >= CHUNK_SIZE) {
                    const audioBlob = new Blob(audioChunks);
                    emitter.emit('audio-chunk', audioBlob);
                    // Send audioBlob to the server/API
                    audioChunks = []; // Reset chunks
                }
            });
            return mediaRecorder;
        });

    return  {
        on: emitter.on.bind(emitter),
        off: emitter.off.bind(emitter),
        stop: () => {
            mediaRecorder.stop();
        },
        start: () => {
            mediaRecorder.start();
        },
        mediaRecorder
    }
}
*/
