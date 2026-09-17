"use client";

import { useEffect, useRef, useState } from "react";

const preferenceKey = "career-notebook-page-sound";

export function usePageSound() {
  const [enabled, setEnabled] = useState(true);
  const context = useRef<AudioContext | null>(null);
  const lastPlayed = useRef(-Infinity);

  useEffect(() => {
    try {
      setEnabled(localStorage.getItem(preferenceKey) !== "off");
    } catch {
      // The switch still works when browser storage is unavailable.
    }
    return () => {
      void context.current?.close().catch(() => {});
      context.current = null;
    };
  }, []);

  const play = () => {
    if (!enabled || performance.now() - lastPlayed.current < 240) return;
    lastPlayed.current = performance.now();
    try {
      const audio = (context.current ??= new AudioContext());
      // Resume within the click gesture, including on mobile browsers.
      if (audio.state === "suspended") void audio.resume().catch(() => {});
      const duration = 0.085;
      const buffer = audio.createBuffer(
        1,
        audio.sampleRate * duration,
        audio.sampleRate,
      );
      const samples = buffer.getChannelData(0);
      for (let i = 0; i < samples.length; i++) {
        const time = i / audio.sampleRate;
        const press = Math.sin(2 * Math.PI * 980 * time) * Math.exp(-time * 90);
        const releaseTime = Math.max(0, time - 0.032);
        const release =
          Math.sin(2 * Math.PI * 1680 * releaseTime) *
          Math.exp(-releaseTime * 155) *
          (time > 0.032 ? 1 : 0);
        const tick = Math.random() * 2 - 1;
        samples[i] =
          press * 0.55 + release * 0.24 + tick * Math.exp(-time * 120) * 0.035;
      }
      const source = audio.createBufferSource();
      source.buffer = buffer;
      const filter = audio.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(1320, audio.currentTime);
      filter.Q.value = 1.8;
      const gain = audio.createGain();
      gain.gain.setValueAtTime(0.0001, audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.032, audio.currentTime + 0.006);
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        audio.currentTime + duration,
      );
      source.connect(filter).connect(gain).connect(audio.destination);
      source.onended = () => {
        source.disconnect();
        filter.disconnect();
        gain.disconnect();
      };
      source.start();
    } catch {
      // Sound is optional; unsupported audio must never interrupt navigation.
    }
  };

  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    try {
      localStorage.setItem(preferenceKey, next ? "on" : "off");
    } catch {}
  };

  return { enabled, toggle, play };
}
