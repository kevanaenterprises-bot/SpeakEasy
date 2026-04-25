import { useEffect, useRef } from "react";

interface AudioVisualizerProps {
  stream: MediaStream | null;
  isActive: boolean;
}

const BAR_COUNT = 10;
const W = 80;
const H = 24;

export default function AudioVisualizer({ stream, isActive }: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    // Tear down any previous instance
    cleanupRef.current?.();
    cleanupRef.current = null;
    cancelAnimationFrame(rafRef.current);

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const drawIdle = () => {
      ctx.clearRect(0, 0, W, H);
      const barW = Math.floor(W / BAR_COUNT) - 1;
      for (let i = 0; i < BAR_COUNT; i++) {
        ctx.fillStyle = "rgba(100, 116, 139, 0.25)";
        ctx.fillRect(i * (barW + 1), H - 3, barW, 3);
      }
    };

    if (!stream || !isActive) {
      drawIdle();
      return;
    }

    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      drawIdle();
      return;
    }

    let audioCtx: AudioContext;
    let source: MediaStreamAudioSourceNode;
    let analyser: AnalyserNode;

    try {
      audioCtx = new AudioContext();
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64; // 32 frequency bins
      source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);
      if (audioCtx.state === "suspended") audioCtx.resume();
    } catch {
      drawIdle();
      return;
    }

    const data = new Uint8Array(analyser.frequencyBinCount);

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(data);

      ctx.clearRect(0, 0, W, H);
      const barW = Math.floor(W / BAR_COUNT) - 1;

      for (let i = 0; i < BAR_COUNT; i++) {
        // Sample the lower 70% of bins — that's where voice lives
        const bin = Math.floor((i / BAR_COUNT) * data.length * 0.7) + 1;
        const v = data[bin] / 255;
        const barH = Math.max(3, v * H);
        const x = i * (barW + 1);
        const alpha = 0.35 + v * 0.65;

        ctx.fillStyle =
          v > 0.04
            ? `rgba(34, 197, 94, ${alpha})`   // green when hearing audio
            : "rgba(100, 116, 139, 0.25)";    // gray when silent
        ctx.fillRect(x, H - barH, barW, barH);
      }
    };

    draw();

    cleanupRef.current = () => {
      cancelAnimationFrame(rafRef.current);
      source.disconnect();
      audioCtx.close();
    };

    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [stream, isActive]);

  return (
    <canvas
      ref={canvasRef}
      width={W}
      height={H}
      title={isActive && stream ? "Microphone input level" : "Mic inactive"}
      style={{ imageRendering: "pixelated" }}
      className="rounded"
    />
  );
}
