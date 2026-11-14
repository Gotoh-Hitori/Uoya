// Adapted from chat-demo-main, Copyright (c) 2026 DeepSeek, MIT. See CHAT-DEMO-LICENSE.txt.
const SAMPLE_RATE = 16e3;
const MAX_SECONDS = 120;
const BUFFER_SIZE = 4096;
const startRecording = async (onLimit) => {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }
  });
  let context;
  let source;
  let processor;
  let analyser;
  let released = false;
  const release = () => {
    if (released) {
      return;
    }
    released = true;
    if (processor) {
      processor.onaudioprocess = null;
    }
    for (const node of [processor, analyser, source]) {
      try {
        node?.disconnect();
      } catch {
      }
    }
    for (const track of stream.getTracks()) {
      track.stop();
    }
    void context?.close().catch(() => {
    });
  };
  try {
    context = new AudioContext({ sampleRate: SAMPLE_RATE });
    source = context.createMediaStreamSource(stream);
    processor = context.createScriptProcessor(BUFFER_SIZE, 1, 1);
    analyser = context.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.2;
    const chunks = [];
    let length = 0;
    let limited = false;
    processor.onaudioprocess = (event) => {
      if (limited) {
        return;
      }
      chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
      length += BUFFER_SIZE;
      if (length >= MAX_SECONDS * SAMPLE_RATE) {
        limited = true;
        onLimit();
      }
    };
    source.connect(analyser);
    analyser.connect(processor);
    processor.connect(context.destination);
    if (context.state === "suspended") {
      void context.resume().catch(() => {
      });
    }
    return {
      stop: async () => {
        release();
        return length === 0 ? null : encodeWav(chunks, length);
      },
      cancel: release,
      analyser
    };
  } catch (error) {
    release();
    throw error;
  }
};
const encodeWav = (chunks, length) => {
  const samples = Math.min(length, MAX_SECONDS * SAMPLE_RATE);
  const buffer = new ArrayBuffer(44 + samples * 2);
  const view = new DataView(buffer);
  const writeString = (offset2, text) => {
    for (let i = 0; i < text.length; i++) {
      view.setUint8(offset2 + i, text.charCodeAt(i));
    }
  };
  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, samples * 2, true);
  let offset = 44;
  let written = 0;
  for (const chunk of chunks) {
    for (let i = 0; i < chunk.length && written < samples; i++, written++) {
      const sample = Math.max(-1, Math.min(1, chunk[i]));
      view.setInt16(offset, sample < 0 ? sample * 32768 : sample * 32767, true);
      offset += 2;
    }
  }
  return new Blob([buffer], { type: "audio/wav" });
};
export {
  MAX_SECONDS,
  SAMPLE_RATE,
  startRecording
};
