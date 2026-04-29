import { useEffect, useRef, useState } from "react";

export interface BeautyFilters {
  enabled: boolean;
  smooth: number;    // 0–100 → blur 0–1.5px
  brighten: number;  // 0–100 → brightness 1.0–1.35
  warm: number;      // 0–100 → sepia 0–25%
}

export const DEFAULT_FILTERS: BeautyFilters = {
  enabled: false,
  smooth: 30,
  brighten: 20,
  warm: 15,
};

function buildFilter(f: BeautyFilters): string {
  const blur = (f.smooth / 100) * 1.5;
  const brightness = 1 + (f.brighten / 100) * 0.35;
  const sepia = (f.warm / 100) * 25;
  return `blur(${blur.toFixed(2)}px) brightness(${brightness.toFixed(3)}) sepia(${sepia.toFixed(1)}%)`;
}

export function useBeautyFilter(rawStream: MediaStream | null, filters: BeautyFilters) {
  const [processedStream, setProcessedStream] = useState<MediaStream | null>(null);
  const hiddenVideoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const filtersRef = useRef(filters);

  // Keep latest filters accessible inside the draw loop without restarting it
  useRef(() => { filtersRef.current = filters; });
  filtersRef.current = filters;

  useEffect(() => {
    if (!rawStream || !filters.enabled) {
      // Clean up canvas pipeline if disabled
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      setProcessedStream(null);
      return;
    }

    const video = document.createElement("video");
    video.srcObject = rawStream;
    video.muted = true;
    video.playsInline = true;
    hiddenVideoRef.current = video;

    const canvas = document.createElement("canvas");
    canvasRef.current = canvas;

    video.onloadedmetadata = () => {
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      video.play().catch(() => {});

      const ctx = canvas.getContext("2d")!;

      const draw = () => {
        if (video.readyState >= 2) {
          ctx.filter = buildFilter(filtersRef.current);
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        }
        animFrameRef.current = requestAnimationFrame(draw);
      };
      draw();

      // Capture at same frame rate as original video track
      const fps = rawStream.getVideoTracks()[0]?.getSettings().frameRate ?? 30;
      const canvasStream = canvas.captureStream(fps);

      // Carry original audio tracks into the processed stream
      rawStream.getAudioTracks().forEach(t => canvasStream.addTrack(t));

      setProcessedStream(canvasStream);
    };

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      video.srcObject = null;
      setProcessedStream(null);
    };
  }, [rawStream, filters.enabled]);

  return processedStream;
}
