"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  collectFinalTranscript,
  speechErrorMessage,
  type SpeechResultListLike,
} from "@/lib/speech-input";

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: SpeechResultListLike }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};
type SpeechWindow = Window & {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};

export function useSpeechRecognition({
  onTranscript,
}: {
  onTranscript: (text: string) => void;
}) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [listening, setListening] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState("");
  const active = useRef<Recognition | null>(null);
  const callback = useRef(onTranscript);
  useEffect(() => {
    callback.current = onTranscript;
  }, [onTranscript]);

  // Invalidate callbacks before aborting, including queued results after navigation.
  const release = useCallback(() => {
    const recognition = active.current;
    active.current = null;
    if (recognition) {
      recognition.onresult = recognition.onerror = recognition.onend = null;
      recognition.abort();
    }
  }, []);
  const cancel = useCallback(() => {
    release();
    setListening(false);
    setStopping(false);
    setError("");
  }, [release]);
  useEffect(() => {
    const browser = window as SpeechWindow;
    setSupported(
      Boolean(browser.SpeechRecognition || browser.webkitSpeechRecognition),
    );
    return release;
  }, [release]);

  function start() {
    if (active.current) return;
    const browser = window as SpeechWindow;
    const Constructor =
      browser.SpeechRecognition || browser.webkitSpeechRecognition;
    if (!Constructor) {
      setSupported(false);
      return;
    }
    setError("");
    let received = false;
    let failed = false;
    const delivered = new Set<number>();
    try {
      const recognition = new Constructor();
      active.current = recognition;
      recognition.lang = "zh-CN";
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.onresult = ({ results }) => {
        if (active.current !== recognition) return;
        const fresh = Array.from(results).filter((result, index) => {
          if (!result.isFinal || delivered.has(index)) return false;
          delivered.add(index);
          return true;
        });
        const text = collectFinalTranscript(fresh);
        if (text) {
          received = true;
          callback.current(text);
        }
      };
      recognition.onerror = ({ error: code }) => {
        if (active.current !== recognition) return;
        failed = true;
        setError(speechErrorMessage(code));
        release();
        setListening(false);
        setStopping(false);
      };
      recognition.onend = () => {
        if (active.current !== recognition) return;
        active.current = null;
        recognition.onresult = recognition.onerror = recognition.onend = null;
        setListening(false);
        setStopping(false);
        if (!received && !failed) setError(speechErrorMessage("no-speech"));
      };
      setListening(true);
      setStopping(false);
      recognition.start();
    } catch {
      release();
      setListening(false);
      setStopping(false);
      setError(speechErrorMessage("network"));
    }
  }
  function stop() {
    if (!active.current || stopping) return;
    setStopping(true);
    // stop() must keep the handlers: the browser can still deliver its final result.
    active.current.stop();
  }
  return { supported, listening, stopping, error, start, stop, cancel };
}
