import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useWebRTC } from "@/hooks/useWebRTC";
import { useTranslation } from "@/hooks/useTranslation";
import { useLanguageSettings, SUPPORTED_LANGUAGES } from "@/hooks/useLanguageSettings";
import VideoStream from "@/components/VideoStream";
import CallControls from "@/components/CallControls";
import SettingsModal from "@/components/SettingsModal";
import { Button } from "@/components/ui/button";
import { Languages, Signal, Settings, Phone, Video, Mic, MicOff, VideoOff, Copy, Share, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import turtleLogo from "@assets/generated_images/Girl_turtle_talking_on_phone_d147f854.png";

export default function VideoCall() {
  const { roomId } = useParams();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  
  // Redirect to home if no room ID provided
  if (!roomId) {
    navigate("/");
    return null;
  }
  
  const { yourLanguage, partnerLanguage: savedPartnerLanguage, swapLanguages, updateLanguages } = useLanguageSettings();

  const {
    localStream,
    remoteStream,
    isConnected,
    wsConnected,
    connectionQuality,
    partnerLanguage: detectedPartnerLanguage,
    joinRoom,
    leaveRoom,
    toggleMicrophone,
    toggleCamera,
  } = useWebRTC(roomId, yourLanguage?.code); // announces our language to partner on join

  const {
    isTranslationActive,
    currentTranslation,
    interimText,
    toggleTranslation,
    isServiceAvailable,
  } = useTranslation(roomId);

  // If the partner announces their language over WebRTC, update our display automatically
  useEffect(() => {
    if (detectedPartnerLanguage) {
      updateLanguages(yourLanguage.code, detectedPartnerLanguage);
    }
  }, [detectedPartnerLanguage]);

  // Use detected partner language if available, otherwise fall back to saved setting
  const partnerLanguage = detectedPartnerLanguage
    ? (SUPPORTED_LANGUAGES.find((l) => l.code === detectedPartnerLanguage) || savedPartnerLanguage)
    : savedPartnerLanguage;

  // Debug logging for translation state
  useEffect(() => {
    console.log("🐢 Translation state:", {
      isTranslationActive,
      isServiceAvailable,
      hasTranslation: !!currentTranslation
    });
  }, [isTranslationActive, isServiceAvailable, currentTranslation]);

  useEffect(() => {
    joinRoom();
    return () => leaveRoom();
  }, [joinRoom, leaveRoom]);

  // Auto-enable translation when the peer connection is established
  useEffect(() => {
    if (isConnected && !isTranslationActive) {
      toggleTranslation();
    }
  }, [isConnected]);

  const handleMicToggle = () => {
    toggleMicrophone();
    setIsMicMuted(!isMicMuted);
  };

  const handleVideoToggle = () => {
    toggleCamera();
    setIsVideoOff(!isVideoOff);
  };

  const handleEndCall = () => {
    if (confirm("Are you sure you want to end the call?")) {
      leaveRoom();
      navigate("/");
    }
  };

  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId);
    toast({
      title: "Room ID copied!",
      description: "Share this ID with your partner to join the call.",
    });
  };

  const shareCall = () => {
    const callUrl = `${window.location.origin}/call/${roomId}`;
    navigator.clipboard.writeText(callUrl);
    toast({
      title: "Call link copied!", 
      description: "Share this link with your partner.",
    });
  };

  return (
    <div className="min-h-screen flex flex-col bg-background" data-testid="video-call-page">
      {/* Connection lost banner */}
      {!wsConnected && (
        <div className="bg-destructive text-destructive-foreground text-center text-sm font-medium py-2 px-4 flex items-center justify-center gap-2">
          <span className="w-2 h-2 rounded-full bg-white animate-pulse inline-block" />
          Connection lost — attempting to reconnect... Your camera is still on but the room is not active.
        </div>
      )}
      {/* Header */}
      <header className="bg-card border-b border-border px-6 py-4" data-testid="header">
        {/* Top Row */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/")}
              className="p-2"
              data-testid="button-back-home"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center overflow-hidden">
                <img src={turtleLogo} alt="SpeakEasy Logo" className="w-full h-full object-cover rounded-lg" />
              </div>
              <h1 className="text-3xl font-semibold text-foreground">SpeakEasy</h1>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <button 
              className="p-2 text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setIsSettingsOpen(true)}
              data-testid="button-settings"
            >
              <Settings />
            </button>
            <button 
              className="bg-destructive text-destructive-foreground px-4 py-2 rounded-md text-sm font-medium hover:bg-destructive/90 transition-colors"
              onClick={handleEndCall}
              data-testid="button-end-call"
            >
              End Call
            </button>
          </div>
        </div>
        
        {/* Bottom Row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2 text-sm text-muted-foreground">
              <div className={`connection-dot w-2 h-2 rounded-full ${isConnected ? 'bg-success' : 'bg-destructive'}`}></div>
              <span data-testid="connection-status">{isConnected ? 'Connected' : 'Connecting...'}</span>
            </div>
            <div className="flex items-center space-x-2 text-sm">
              <Mic className={`w-4 h-4 ${isTranslationActive ? 'text-success' : 'text-muted-foreground'}`} />
              <span className="text-muted-foreground" data-testid="translation-status">
                {isTranslationActive ? 'Translation Active' : 'Translation Inactive'}
              </span>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <div className="text-sm text-muted-foreground">
              Room: <span className="font-mono text-foreground">{roomId}</span>
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={copyRoomId}
              className="text-xs"
              data-testid="button-copy-room-id"
            >
              <Copy className="w-3 h-3 mr-1" />
              Copy ID
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={shareCall}
              className="text-xs"
              data-testid="button-share-call"
            >
              <Share className="w-3 h-3 mr-1" />
              Share Link
            </Button>
          </div>
        </div>
      </header>

      {/* Main Video Area */}
      <main className="flex-1 p-4 lg:p-6" data-testid="main-video-area">
        <div className="max-w-7xl mx-auto h-full">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 h-full">
            {/* Local Video Stream */}
            <VideoStream
              stream={localStream}
              isLocal={true}
              participantName={`You (${yourLanguage.name})`}
              language={yourLanguage.code}
              isSpeaking={isTranslationActive}
              connectionQuality={connectionQuality}
              currentTranslation={currentTranslation?.local}
              interimText={interimText}
              data-testid="video-stream-local"
            />

            {/* Remote Video Stream */}
            <VideoStream
              stream={remoteStream}
              isLocal={false}
              participantName={`Partner (${partnerLanguage.name})`}
              language={partnerLanguage.code}
              isSpeaking={false}
              connectionQuality={connectionQuality}
              currentTranslation={currentTranslation?.remote}
              data-testid="video-stream-remote"
            />
          </div>
        </div>
      </main>

      {/* Control Panel */}
      <CallControls
        isMicMuted={isMicMuted}
        isVideoOff={isVideoOff}
        isTranslationActive={isTranslationActive}
        isConnected={isConnected}
        isServiceAvailable={isServiceAvailable}
        onMicToggle={handleMicToggle}
        onVideoToggle={handleVideoToggle}
        onTranslationToggle={toggleTranslation}
        onLanguageSwap={swapLanguages}
        onSettingsOpen={() => setIsSettingsOpen(true)}
        onEndCall={handleEndCall}
        data-testid="call-controls"
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        data-testid="settings-modal"
      />
    </div>
  );
}
