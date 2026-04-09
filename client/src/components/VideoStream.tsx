import { useEffect, useRef } from "react";
import { Signal, Mic, Video, Flag } from "lucide-react";
import TranslationDisplay from "./TranslationDisplay";

interface VideoStreamProps {
  stream: MediaStream | null;
  isLocal: boolean;
  participantName: string;
  language: string;
  isSpeaking: boolean;
  connectionQuality: string;
  currentTranslation?: {
    originalText: string;
    translatedText: string;
    sourceLanguage: string;
    targetLanguage: string;
  };
  interimText?: string;
}

export default function VideoStream({
  stream,
  isLocal,
  participantName,
  language,
  isSpeaking,
  connectionQuality,
  currentTranslation,
  interimText,
}: VideoStreamProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      console.log(`🎬 Setting ${isLocal ? 'local' : 'remote'} video stream:`, stream.getTracks().length, 'tracks');
      videoRef.current.srcObject = stream;
      
      // Handle mobile autoplay restrictions
      const playVideo = async () => {
        try {
          await videoRef.current?.play();
          console.log(`✅ ${isLocal ? 'Local' : 'Remote'} video playing`);
        } catch (err) {
          console.log(`⚠️ Autoplay blocked for ${isLocal ? 'local' : 'remote'} video, user interaction needed:`, err);
        }
      };
      playVideo();
    }
  }, [stream, isLocal]);

  const flagColor = language === "en" ? "text-blue-500" : "text-red-500";
  const getLanguageName = (code: string) => {
    const langMap: {[key: string]: string} = {
      'en': 'English', 'vi': 'Vietnamese', 'es': 'Spanish', 'fr': 'French', 
      'de': 'German', 'it': 'Italian', 'pt': 'Portuguese', 'ru': 'Russian',
      'ja': 'Japanese', 'ko': 'Korean', 'zh': 'Chinese', 'ar': 'Arabic',
      'hi': 'Hindi', 'th': 'Thai'
    };
    return langMap[code] || code.toUpperCase();
  };
  const translationDirection = `${getLanguageName(language)} Translation`;

  return (
    <div className="flex flex-col space-y-3" data-testid={`video-stream-${isLocal ? 'local' : 'remote'}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className={`w-3 h-3 rounded-full ${isSpeaking ? 'bg-success speaking-indicator' : 'bg-muted'}`}></div>
          <span className="text-sm font-medium text-foreground" data-testid="text-participant-name">{participantName}</span>
          <Flag className={`text-xs ${flagColor}`} />
        </div>
        <div className="flex items-center space-x-2 text-xs text-muted-foreground">
          <Signal />
          <span data-testid="text-connection-quality">{connectionQuality}</span>
        </div>
      </div>
      
      {/* Video Container */}
      <div className={`relative bg-card rounded-xl overflow-hidden aspect-video shadow-lg border-2 ${isSpeaking ? 'translation-active border-success' : 'border-border'}`}>
        <div className="video-container w-full h-full">
          {stream ? (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted={isLocal}
              className="w-full h-full object-cover"
              data-testid="video-element"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <div className="w-24 h-24 bg-primary/20 rounded-full flex items-center justify-center">
                <div className="text-4xl text-primary/60">👤</div>
              </div>
            </div>
          )}
          
          {/* Video controls overlay */}
          <div className="absolute top-4 right-4 flex space-x-2">
            <div className="bg-black/30 text-white px-2 py-1 rounded text-xs">
              <Mic />
            </div>
            <div className="bg-black/30 text-white px-2 py-1 rounded text-xs">
              <Video />
            </div>
          </div>
        </div>
      </div>
      
      {/* Translation Display */}
      <TranslationDisplay
        direction={translationDirection}
        currentTranslation={currentTranslation}
        isActive={isSpeaking}
        interimText={isLocal ? interimText : undefined}
        data-testid="translation-display"
      />
    </div>
  );
}
