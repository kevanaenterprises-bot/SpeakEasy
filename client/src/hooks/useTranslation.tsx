import { useState, useCallback, useRef, useEffect } from "react";
import { useSpeechRecognition } from "./useSpeechRecognition";
import { useGoogleSTT } from "./useGoogleSTT";
import { useLanguageSettings, SUPPORTED_LANGUAGES } from "./useLanguageSettings";

interface TranslationResult {
  local?: {
    originalText: string;
    translatedText: string;
    sourceLanguage: string;
    targetLanguage: string;
  };
  remote?: {
    originalText: string;
    translatedText: string;
    sourceLanguage: string;
    targetLanguage: string;
  };
}

interface UseTranslationReturn {
  isTranslationActive: boolean;
  currentTranslation: TranslationResult | null;
  interimText: string;
  toggleTranslation: () => void;
  isServiceAvailable: boolean;
  useGoogleSTTMode: boolean;
}

export function useTranslation(sessionId: string, localStream?: MediaStream | null): UseTranslationReturn {
  const { yourLanguage, partnerLanguage, getSpeechCode } = useLanguageSettings();
  const [isTranslationActive, setIsTranslationActive] = useState(false);
  const [currentTranslation, setCurrentTranslation] = useState<TranslationResult | null>(null);
  const [interimText, setInterimText] = useState("");
  const [isServiceAvailable, setIsServiceAvailable] = useState(true);

  // Refs so speech handlers always read the latest language without stale closures
  const yourLanguageRef = useRef(yourLanguage);
  const partnerLanguageRef = useRef(partnerLanguage);
  useEffect(() => { yourLanguageRef.current = yourLanguage; }, [yourLanguage]);
  useEffect(() => { partnerLanguageRef.current = partnerLanguage; }, [partnerLanguage]);

  const wsRef = useRef<WebSocket | null>(null);
  const [useGoogleSTTMode, setUseGoogleSTTMode] = useState(false);
  const { startListening, stopListening, isListening } = useSpeechRecognition();

  // Check service availability and whether Google STT is enabled on the server
  useEffect(() => {
    const checkServices = async () => {
      try {
        const response = await fetch('/api/health');
        if (response.ok) {
          const data = await response.json();
          const googleSTTEnabled = !!data.googleSTT;
          setUseGoogleSTTMode(googleSTTEnabled);
          if (googleSTTEnabled) {
            console.log('✅ Google STT available — using server-side speech recognition');
          } else {
            console.log('ℹ️ Google STT not configured — using browser Web Speech API');
          }
          setIsServiceAvailable(true);
        } else {
          setIsServiceAvailable(false);
        }
      } catch (error) {
        console.error("Service check failed:", error);
        setIsServiceAvailable(true);
      }
    };

    checkServices();
  }, []);

  // Google STT hook — active only when isTranslationActive and Google STT mode is on
  // Pass live state values (not refs) so dropdown changes propagate immediately via re-render
  // Pass localStream to reuse the existing WebRTC audio track instead of opening a second mic
  useGoogleSTT({
    languageCode: yourLanguage?.speechCode || 'en-US',
    targetLanguage: partnerLanguage?.code || 'en',
    sessionId,
    wsRef,
    localStream: localStream || null,
    isActive: isTranslationActive && useGoogleSTTMode,
    onInterim: (text) => setInterimText(text),
    onResult: (transcript, confidence) => {
      // Google STT result comes back via 'stt-result' WebSocket message
      // which is handled in the WS onmessage handler below
    },
  });

  // Initialize WebSocket for translation messages
  useEffect(() => {
    if (!isTranslationActive || !isServiceAvailable) return;

    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let isCleanedUp = false;

    const connect = () => {
      if (isCleanedUp) return;
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log("Translation WebSocket connected for room:", sessionId);
        // Keepalive ping every 20s to prevent proxy timeouts during silence
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        heartbeatTimer = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 20000);
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);

          if (message.type === 'translation') {
            handleTranslationMessage(message.data);
          } else if (message.type === 'stt-result') {
            // Google STT transcript confirmed — show as interim cleared
            setInterimText('');
            console.log(`🎙️ STT confirmed: "${message.transcript}" (${Math.round(message.confidence * 100)}%)`);
          }
          // 'pong' or other keepalive replies are silently ignored
        } catch (error) {
          console.error("❌ Translation WebSocket message error:", error);
        }
      };

      ws.onclose = () => {
        console.log("Translation WebSocket disconnected");
        if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
        // Auto-reconnect while translation is still active
        if (!isCleanedUp) {
          reconnectTimer = setTimeout(() => {
            console.log("🔄 Reconnecting translation WebSocket...");
            connect();
          }, 2000);
        }
      };

      wsRef.current = ws;
    };

    connect();

    // Listen for speech recognition events (Web Speech API — only when Google STT is not active)
    const handleSpeechRecognized = (event: any) => {
      if (useGoogleSTTMode) return; // Google STT handles this instead
      const { text, confidence, isFinal } = event.detail;

      if (!isFinal) {
        setInterimText(text);
        return;
      }

      // Always read from refs so language changes in the dropdown take effect immediately
      setInterimText("");
      if (text.trim()) {
        const src = yourLanguageRef.current;
        const tgt = partnerLanguageRef.current;
        sendTranslationMessage('speech-end', {
          transcript: text,
          sourceLanguage: src.code,
          targetLanguage: tgt.code,
          speechCode: src.speechCode || 'en-US',
          confidence: confidence || 0.9,
        });
      }
    };

    // Listen for translation results broadcast by the video WebSocket (partner's speech)
    const handlePartnerTranslation = (event: any) => {
      if (event.detail) handleTranslationMessage(event.detail);
    };

    window.addEventListener('speechRecognized', handleSpeechRecognized);
    window.addEventListener('translationBroadcast', handlePartnerTranslation);

    return () => {
      isCleanedUp = true;
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close();
      }
      window.removeEventListener('speechRecognized', handleSpeechRecognized);
      window.removeEventListener('translationBroadcast', handlePartnerTranslation);
    };
  }, [isTranslationActive, isServiceAvailable]);

  const handleTranslationMessage = (data: any) => {
    console.log("📨 Received translation message:", data);
    
    if (data.type === 'translation-result') {
      console.log("✅ Processing translation result:", data);
      const isLocal = data.speakerId === 'local';
      const translationResult = {
        originalText: data.originalText,
        translatedText: data.translatedText,
        sourceLanguage: data.sourceLanguage,
        targetLanguage: data.targetLanguage,
      };

      console.log("💬 Setting translation for", isLocal ? 'local' : 'remote', ":", translationResult);

      setCurrentTranslation(prev => ({
        ...prev,
        [isLocal ? 'local' : 'remote']: translationResult,
      }));

      // Show the translation for a longer period
      setTimeout(() => {
        console.log("🧹 Clearing translation after 15 seconds");
        setCurrentTranslation(prev => ({
          ...prev,
          [isLocal ? 'local' : 'remote']: undefined,
        }));
      }, 15000);
    } else if (data.type === 'error') {
      console.error("❌ Translation error received:", data.message);
    } else {
      console.log("❓ Unknown translation message type:", data.type);
    }
  };

  const sendTranslationMessage = (type: string, messageData: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      // Format the message to match the translationMessageSchema
      const translationMessage = {
        type: 'translation',
        data: {
          type,
          data: {
            text: messageData.transcript,
            sourceLanguage: messageData.sourceLanguage,
            targetLanguage: messageData.targetLanguage,
            speechCode: messageData.speechCode,
            confidence: messageData.confidence,
          },
          sessionId,
          speakerId: 'local',
        }
      };
      console.log('📤 Sending translation message:', JSON.stringify(translationMessage, null, 2));
      wsRef.current.send(JSON.stringify(translationMessage));
    }
  };

  const startSpeechRecognition = useCallback(async () => {
    const src = yourLanguageRef.current;
    const tgt = partnerLanguageRef.current;
    const speechCode = src.speechCode || 'en-US';
    console.log(`🎤 Starting CONTINUOUS speech recognition for ${src.name} (${speechCode})...`);

    try {
      console.log("📡 Sending speech-start message");
      sendTranslationMessage('speech-start', {
        sourceLanguage: src.code,
        targetLanguage: tgt.code,
        speechCode: speechCode,
      });

      // Start continuous listening with the user's language
      console.log(`👂 Starting continuous listening for ${yourLanguage.name}...`);
      startListening(speechCode).catch(error => {
        console.log("Speech recognition ended:", error);
        // Restart if needed and translation is still active
        if (isTranslationActive && error.message !== 'aborted') {
          setTimeout(() => {
            if (isTranslationActive) {
              console.log("🔄 Restarting speech recognition...");
              startSpeechRecognition();
            }
          }, 1000);
        }
      });
      
    } catch (error) {
      console.error("❌ Speech recognition error:", error);
    }
  }, [isServiceAvailable, startListening, isTranslationActive, yourLanguage, partnerLanguage]);

  const toggleTranslation = useCallback(() => {
    console.log("🐢 TOGGLE TRANSLATION CLICKED!");
    console.log("Service available:", isServiceAvailable, "Current state:", isTranslationActive);
    
    // Force service to be available since we know backend is working
    if (!isServiceAvailable) {
      console.log("🔧 Forcing service availability to true");
      setIsServiceAvailable(true);
    }

    const newState = !isTranslationActive;
    console.log("🎯 Setting translation active to:", newState);
    setIsTranslationActive(newState);

    if (newState) {
      console.log("🎤 Starting speech recognition...");
      startSpeechRecognition();
    } else {
      console.log("🛑 Stopping speech recognition...");
      stopListening();
    }
  }, [isTranslationActive, isServiceAvailable, startSpeechRecognition, stopListening]);

  return {
    isTranslationActive,
    currentTranslation,
    interimText,
    toggleTranslation,
    isServiceAvailable,
    useGoogleSTTMode,
  };
}
