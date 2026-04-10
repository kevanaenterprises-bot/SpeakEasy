import { useRef, useCallback, useEffect } from "react";

interface UseGoogleSTTOptions {
  languageCode: string;       // e.g. "en-US", "vi-VN"
  targetLanguage: string;     // e.g. "vi", "en"
  sessionId: string;
  wsRef: React.MutableRefObject<WebSocket | null>;
  localStream?: MediaStream | null;  // reuse WebRTC stream instead of opening a second mic
  onInterim: (text: string) => void;
  onResult: (transcript: string, confidence: number) => void;
  isActive: boolean;
}

// Minimum audio to bother sending (ms)
const MIN_CHUNK_MS = 300;

// For AudioContext (iOS): send audio every N ms regardless of silence
const IOS_SEND_INTERVAL_MS = 3000;

// For MediaRecorder (Chrome/Android): force-send if accumulated audio exceeds this
const MAX_ACCUMULATION_MS = 15000;

// Silence gap before sending a WebM chunk (ms)
const SILENCE_TIMEOUT_MS = 1200;

// RMS threshold — frames below this level are treated as silence (AudioContext path)
const SILENCE_RMS_THRESHOLD = 0.003;

export function useGoogleSTT({
  languageCode,
  targetLanguage,
  sessionId,
  wsRef,
  localStream,
  onInterim,
  onResult,
  isActive,
}: UseGoogleSTTOptions) {
  const streamRef = useRef<MediaStream | null>(null);

  // Refs so sendChunk always reads the latest language/target even after closures
  const languageRef = useRef(languageCode);
  const targetRef = useRef(targetLanguage);
  useEffect(() => { languageRef.current = languageCode; }, [languageCode]);
  useEffect(() => { targetRef.current = targetLanguage; }, [targetLanguage]);

  // ── MediaRecorder path (Chrome / Firefox / Android) ──────────────────────
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const webmChunksRef = useRef<Blob[]>([]);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxAccumTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const webmStartTimeRef = useRef<number>(0);
  const webmMimeTypeRef = useRef<string>('audio/webm;codecs=opus');

  const sendWebmChunk = useCallback(async () => {
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
    if (maxAccumTimerRef.current) { clearTimeout(maxAccumTimerRef.current); maxAccumTimerRef.current = null; }

    if (webmChunksRef.current.length === 0) return;
    const elapsed = Date.now() - webmStartTimeRef.current;
    if (elapsed < MIN_CHUNK_MS) return;

    const blob = new Blob(webmChunksRef.current, { type: webmMimeTypeRef.current });
    webmChunksRef.current = [];
    webmStartTimeRef.current = Date.now();

    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    try {
      const arrayBuffer = await blob.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
      const encoding = webmMimeTypeRef.current.includes('ogg') ? 'OGG_OPUS' : 'WEBM_OPUS';
      ws.send(JSON.stringify({
        type: 'audio-chunk',
        audioBase64: base64,
        languageCode: languageRef.current,
        targetLanguage: targetRef.current,
        sessionId,
        speakerId: 'local',
        encoding,
        sampleRate: 48000,
      }));
    } catch (err) {
      console.error('Failed to send WebM audio chunk:', err);
    }
  }, [sessionId, wsRef]);

  // ── AudioContext path (iOS Safari) ────────────────────────────────────────
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const pcmBufferRef = useRef<Int16Array[]>([]);
  const iosSendIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const usingAudioContextRef = useRef(false);
  const sampleRateRef = useRef<number>(16000);

  const sendPCMChunk = useCallback(() => {
    if (pcmBufferRef.current.length === 0) return;

    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    // Concatenate all buffered PCM frames
    const totalLen = pcmBufferRef.current.reduce((s, b) => s + b.length, 0);
    const elapsedMs = (totalLen / sampleRateRef.current) * 1000;
    if (elapsedMs < MIN_CHUNK_MS) { pcmBufferRef.current = []; return; }

    const combined = new Int16Array(totalLen);
    let offset = 0;
    for (const buf of pcmBufferRef.current) { combined.set(buf, offset); offset += buf.length; }
    pcmBufferRef.current = [];

    // Convert Int16Array → base64
    const uint8 = new Uint8Array(combined.buffer);
    let binary = '';
    for (let i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i]);
    const base64 = btoa(binary);

    ws.send(JSON.stringify({
      type: 'audio-chunk',
      audioBase64: base64,
      languageCode: languageRef.current,
      targetLanguage: targetRef.current,
      sessionId,
      speakerId: 'local',
      encoding: 'LINEAR16',
      sampleRate: sampleRateRef.current,
    }));
  }, [sessionId, wsRef]);

  const startAudioContextRecording = useCallback(async (stream: MediaStream) => {
    // Don't specify sampleRate — iOS Safari may not support 16kHz and silently ignores it
    const ctx = new AudioContext();
    audioContextRef.current = ctx;

    // iOS Safari creates AudioContext in "suspended" state until resumed
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
        console.log('🔊 AudioContext resumed from suspended state');
      } catch (e) {
        console.error('AudioContext resume failed:', e);
      }
    }

    // Use the actual sample rate the device chose (may differ from requested)
    const SAMPLE_RATE = ctx.sampleRate;
    sampleRateRef.current = SAMPLE_RATE;
    usingAudioContextRef.current = true;
    pcmBufferRef.current = [];

    console.log(`🔊 AudioContext state: ${ctx.state}, actual sampleRate: ${SAMPLE_RATE}Hz`);

    const source = ctx.createMediaStreamSource(stream);
    // ScriptProcessor is deprecated but still works on iOS Safari
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    processorRef.current = processor;

    processor.onaudioprocess = (e) => {
      const float32 = e.inputBuffer.getChannelData(0);

      // Only accumulate non-silent frames (skip background noise)
      let sumSq = 0;
      for (let i = 0; i < float32.length; i++) sumSq += float32[i] * float32[i];
      const rms = Math.sqrt(sumSq / float32.length);
      if (rms < SILENCE_RMS_THRESHOLD) return;

      const int16 = new Int16Array(float32.length);
      for (let i = 0; i < float32.length; i++) {
        int16[i] = Math.max(-32768, Math.min(32767, float32[i] * 32768));
      }
      pcmBufferRef.current.push(int16);
    };

    source.connect(processor);
    // Use a muted gain node instead of connecting directly to destination
    // This keeps the audio graph active (required for ScriptProcessorNode) without feedback
    const gainNode = ctx.createGain();
    gainNode.gain.value = 0;
    processor.connect(gainNode);
    gainNode.connect(ctx.destination);

    // Send accumulated speech every IOS_SEND_INTERVAL_MS — never accumulate more than this
    iosSendIntervalRef.current = setInterval(() => {
      sendPCMChunk();
    }, IOS_SEND_INTERVAL_MS);

    console.log(`🎙️ Google STT started via AudioContext / LINEAR16 @ ${SAMPLE_RATE}Hz (iOS)`);
  }, [sendPCMChunk]);

  // ── Main start ─────────────────────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    try {
      // Prefer the existing WebRTC stream to avoid double getUserMedia on iOS
      // (iOS Safari can be restrictive about concurrent mic access)
      let stream: MediaStream;
      if (localStream && localStream.getAudioTracks().length > 0) {
        // Build a new MediaStream with just the audio track so we don't
        // accidentally mute/stop the video when we clean up later
        stream = new MediaStream(localStream.getAudioTracks());
        streamRef.current = null; // don't stop tracks we don't own
        console.log('🎙️ Reusing WebRTC audio track for Google STT');
      } else {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        streamRef.current = stream; // owned — we need to stop it ourselves
        console.log('🎙️ Opened new mic stream for Google STT');
      }

      const mimeType =
        MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus') ? 'audio/ogg;codecs=opus'
        : null;

      if (mimeType) {
        // Chrome / Firefox / Android
        usingAudioContextRef.current = false;
        webmMimeTypeRef.current = mimeType;
        const recorder = new MediaRecorder(stream, { mimeType });
        mediaRecorderRef.current = recorder;
        webmChunksRef.current = [];
        webmStartTimeRef.current = Date.now();

        recorder.ondataavailable = (e) => {
          if (e.data.size === 0) return;
          webmChunksRef.current.push(e.data);

          // Silence timer: send after 1.2s of no new data
          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = setTimeout(sendWebmChunk, SILENCE_TIMEOUT_MS);

          // Hard cap: never accumulate more than MAX_ACCUMULATION_MS
          if (!maxAccumTimerRef.current) {
            maxAccumTimerRef.current = setTimeout(() => {
              console.log('⏱️ Max accumulation reached — sending WebM chunk');
              sendWebmChunk();
            }, MAX_ACCUMULATION_MS);
          }
        };

        recorder.start(250); // Request data every 250ms
        console.log(`🎙️ Google STT started via MediaRecorder (${mimeType})`);
      } else {
        // iOS Safari — use AudioContext → LINEAR16
        startAudioContextRecording(stream);
      }
    } catch (err) {
      console.error('Failed to start Google STT recording:', err);
    }
  }, [languageCode, sendWebmChunk, startAudioContextRecording]);

  // ── Stop ───────────────────────────────────────────────────────────────────
  const stopRecording = useCallback(() => {
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
    if (maxAccumTimerRef.current) { clearTimeout(maxAccumTimerRef.current); maxAccumTimerRef.current = null; }
    if (iosSendIntervalRef.current) { clearInterval(iosSendIntervalRef.current); iosSendIntervalRef.current = null; }

    if (usingAudioContextRef.current) {
      sendPCMChunk(); // flush remaining
      processorRef.current?.disconnect();
      processorRef.current = null;
      audioContextRef.current?.close();
      audioContextRef.current = null;
      usingAudioContextRef.current = false;
    } else {
      sendWebmChunk(); // flush remaining
      if (mediaRecorderRef.current?.state !== 'inactive') {
        mediaRecorderRef.current?.stop();
      }
      mediaRecorderRef.current = null;
    }

    // Only stop tracks we opened ourselves (not the shared WebRTC stream)
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }

    pcmBufferRef.current = [];
    webmChunksRef.current = [];
    console.log('🛑 Google STT recording stopped');
  }, [sendWebmChunk, sendPCMChunk]);

  useEffect(() => {
    if (isActive) {
      startRecording();
    } else {
      stopRecording();
    }
    return () => stopRecording();
  }, [isActive]);

  return { startRecording, stopRecording };
}
