import { useState, useEffect, useCallback, useRef } from "react";

interface UseWebRTCReturn {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isConnected: boolean;
  wsConnected: boolean;
  connectionQuality: string;
  partnerLanguage: string | null;
  joinRoom: () => void;
  leaveRoom: () => void;
  toggleMicrophone: () => void;
  toggleCamera: () => void;
}

export function useWebRTC(roomId: string, myLanguage?: string): UseWebRTCReturn {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [connectionQuality, setConnectionQuality] = useState("Excellent");
  const [partnerLanguage, setPartnerLanguage] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const roleRef = useRef<string | null>(null);
  const myLanguageRef = useRef<string | undefined>(myLanguage);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLeavingRef = useRef(false);
  useEffect(() => { myLanguageRef.current = myLanguage; }, [myLanguage]);

  const initializeWebSocket = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log("WebSocket connected");
      setWsConnected(true);
      // Clear any pending reconnect timer
      if (reconnectRef.current) {
        clearTimeout(reconnectRef.current);
        reconnectRef.current = null;
      }
      // Start heartbeat — send a ping every 25s to prevent proxy/firewall timeouts
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      heartbeatRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, 25000);
    };

    ws.onmessage = async (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log("📩 WS message received:", message.type, message.data?.type);
        if (message.type === 'signaling') {
          await handleSignalingMessage(message.data);
        } else if (message.type === 'language-announce') {
          if (message.language) {
            setPartnerLanguage(message.language);
          }
        } else if (message.type === 'translation') {
          window.dispatchEvent(new CustomEvent('translationBroadcast', { detail: message.data }));
        }
        // 'pong' and other server messages are silently ignored
      } catch (error) {
        console.error("WebSocket message error:", error);
      }
    };

    ws.onclose = () => {
      console.log("WebSocket disconnected");
      setWsConnected(false);
      setIsConnected(false);
      // Clear heartbeat
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
      // Auto-reconnect if we didn't leave intentionally
      if (!isLeavingRef.current) {
        console.log("⚠️ Unexpected disconnect — reconnecting in 3s...");
        reconnectRef.current = setTimeout(() => {
          initializeWebSocket();
        }, 3000);
      }
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    wsRef.current = ws;
  }, []);

  const initializePeerConnection = useCallback(async () => {
  if (peerConnectionRef.current) return;

  // Fallback ICE servers including free TURN relay servers
  // TURN servers are required for connections across different networks (mobile, NAT, etc.)
  let iceServers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    {
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443',
        'turn:openrelay.metered.ca:443?transport=tcp',
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ];

  try {
    const response = await fetch('/api/twilio-token');
    const data = await response.json();
    if (data.iceServers) {
      // Use Twilio servers but keep our STUN servers too
      iceServers = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        ...data.iceServers,
      ];
      console.log("✅ Got Twilio ICE servers");
    }
  } catch (e) {
    console.warn("⚠️ Twilio not configured, using free TURN fallback");
  }

  const peerConnection = new RTCPeerConnection({ iceServers, iceCandidatePoolSize: 10 });

    peerConnection.onicecandidate = (event) => {
      if (event.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'signaling',
          data: {
            type: 'ice-candidate',
            roomId,
            senderId: 'user',
            data: event.candidate,
          }
        }));
      }
    };

    peerConnection.ontrack = (event) => {
      console.log("🎥 RECEIVED REMOTE TRACK!", event.track.kind);
      console.log("🎥 Remote stream:", event.streams[0]);
      console.log("🎥 Track count:", event.streams[0]?.getTracks().length);
      if (event.streams[0]) {
        setRemoteStream(event.streams[0]);
        console.log("✅ Remote stream SET!");
      }
    };

    peerConnection.onconnectionstatechange = () => {
      const state = peerConnection.connectionState;
      console.log("🔗 Connection state:", state);

      if (state === 'connected') {
        setIsConnected(true);
        setConnectionQuality("Excellent");
      } else if (state === 'connecting') {
        setIsConnected(false);
        setConnectionQuality("Connecting...");
      } else if (state === 'disconnected') {
        setIsConnected(false);
        setConnectionQuality("Poor");
      } else if (state === 'failed') {
        setIsConnected(false);
        console.error("❌ WebRTC connection failed - check TURN server config");
        setConnectionQuality("Failed");
      }
    };

    peerConnection.oniceconnectionstatechange = () => {
      console.log("🧊 ICE connection state:", peerConnection.iceConnectionState);
    };

    peerConnection.onicegatheringstatechange = () => {
      console.log("🧊 ICE gathering state:", peerConnection.iceGatheringState);
    };

    // Add local stream tracks if available
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        console.log("Adding local track:", track.kind);
        peerConnection.addTrack(track, localStreamRef.current!);
      });
    }

    peerConnectionRef.current = peerConnection;
  }, [roomId]);

  const handleSignalingMessage = async (message: any) => {
    const peerConnection = peerConnectionRef.current;

    try {
      switch (message.type) {
        case 'room-joined':
          roleRef.current = message.role;
          console.log(`🎭 Joined room as ${message.role}, participant count: ${message.participantCount}`);
          console.log(`🔌 WebSocket state: ${wsRef.current?.readyState}, PeerConnection: ${peerConnectionRef.current ? 'exists' : 'null'}`);
          
          // If we're the callee, tell the room we're ready to receive an offer
          if (message.role === 'callee') {
            console.log("📤 I am callee, preparing to send ready-to-receive");
            if (wsRef.current?.readyState === WebSocket.OPEN) {
              console.log("📤 Sending ready-to-receive as callee");
              wsRef.current.send(JSON.stringify({
                type: 'signaling',
                data: {
                  type: 'ready-to-receive',
                  roomId,
                  senderId: 'user',
                  data: null,
                }
              }));
            } else {
              console.error("❌ WebSocket not open, cannot send ready-to-receive");
            }
          }
          break;
          
        case 'ready-to-receive':
          // Callee is ready, now the caller can send an offer
          console.log(`📥 Received ready-to-receive. My role: ${roleRef.current}, PC: ${peerConnection ? 'exists' : 'null'}, Stream: ${localStreamRef.current ? 'exists' : 'null'}`);
          if (roleRef.current === 'caller' && peerConnection && localStreamRef.current) {
            try {
              console.log("🎬 Creating offer after receiving ready-to-receive");
              // Ensure all tracks are added
              localStreamRef.current.getTracks().forEach(track => {
                const senders = peerConnection.getSenders();
                const trackAlreadyAdded = senders.find(sender => sender.track === track);
                if (!trackAlreadyAdded) {
                  peerConnection.addTrack(track, localStreamRef.current!);
                }
              });
              
              const offer = await peerConnection.createOffer();
              await peerConnection.setLocalDescription(offer);
              
              if (wsRef.current?.readyState === WebSocket.OPEN) {
                console.log("Sending offer after ready-to-receive");
                wsRef.current.send(JSON.stringify({
                  type: 'signaling',
                  data: {
                    type: 'offer',
                    roomId,
                    senderId: 'user',
                    data: offer,
                  }
                }));
              }
            } catch (offerError) {
              console.error("Error creating offer:", offerError);
            }
          }
          break;

        case 'participant-joined':
          console.log(`Participant joined. Total: ${message.participantCount}`);
          // Re-announce our language so the new participant gets it
          if (myLanguageRef.current && wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'language-announce', language: myLanguageRef.current }));
          }
          // Don't create offer here - wait for ready-to-receive from the callee
          break;

        case 'offer':
          if (!peerConnection) {
            console.error("No peer connection available for offer");
            return;
          }
          try {
            console.log("Received offer, creating answer");
            
            // IMPORTANT: Ensure local tracks are added before creating answer
            if (localStreamRef.current) {
              localStreamRef.current.getTracks().forEach(track => {
                const senders = peerConnection.getSenders();
                const trackAlreadyAdded = senders.find(sender => sender.track === track);
                if (!trackAlreadyAdded) {
                  console.log("📹 Adding local track before answer:", track.kind);
                  peerConnection.addTrack(track, localStreamRef.current!);
                }
              });
            }
            
            await peerConnection.setRemoteDescription(new RTCSessionDescription(message.data));
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            
            if (wsRef.current?.readyState === WebSocket.OPEN) {
              console.log("Sending answer");
              wsRef.current.send(JSON.stringify({
                type: 'signaling',
                data: {
                  type: 'answer',
                  roomId,
                  senderId: 'user',
                  data: answer,
                }
              }));
            }
          } catch (answerError) {
            console.error("Error handling offer:", answerError);
          }
          break;

        case 'answer':
          if (!peerConnection) {
            console.error("No peer connection available for answer");
            return;
          }
          try {
            console.log("Received answer, setting remote description");
            await peerConnection.setRemoteDescription(new RTCSessionDescription(message.data));
          } catch (answerError) {
            console.error("Error handling answer:", answerError);
          }
          break;

        case 'ice-candidate':
          if (!peerConnection) {
            console.error("No peer connection available for ICE candidate");
            return;
          }
          try {
            console.log("Received ICE candidate");
            await peerConnection.addIceCandidate(new RTCIceCandidate(message.data));
          } catch (iceError) {
            console.error("Error adding ICE candidate:", iceError);
          }
          break;

        case 'leave-room':
          console.log('Participant left the room');
          setRemoteStream(null);
          break;
      }
    } catch (error) {
      console.error("Signaling message handling error:", error);
    }
  };

  const getUserMedia = async () => {
    try {
      // Try to get both video and audio
      let stream: MediaStream;
      
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        console.log("Got both video and audio access");
      } catch (videoError) {
        console.warn("Could not access video, trying audio only:", videoError);
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: false,
            audio: true,
          });
          console.log("Got audio access only");
        } catch (audioError) {
          console.warn("Could not access audio either, creating mock stream:", audioError);
          // Create a canvas-based fake video stream as fallback
          const canvas = document.createElement('canvas');
          canvas.width = 640;
          canvas.height = 480;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.fillStyle = '#1f2937';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#ffffff';
            ctx.font = '24px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('Camera not available', canvas.width / 2, canvas.height / 2 - 20);
            ctx.fillText('Please allow camera access', canvas.width / 2, canvas.height / 2 + 20);
          }
          
          // @ts-ignore - fallback stream
          stream = canvas.captureStream(30);
        }
      }
      
      setLocalStream(stream);
      localStreamRef.current = stream;
      
      // Add stream tracks to peer connection
      if (peerConnectionRef.current) {
        stream.getTracks().forEach(track => {
          console.log("Adding track to peer connection:", track.kind);
          peerConnectionRef.current!.addTrack(track, stream);
        });
      }
      
      return stream;
    } catch (error) {
      console.error("Error setting up media stream:", error);
      // Still throw the error but with better handling
      throw new Error("Could not access camera or microphone. Please check your browser permissions.");
    }
  };

  const joinRoom = useCallback(async () => {
    try {
      console.log("Starting to join room:", roomId);
      
      // Initialize WebSocket first
      initializeWebSocket();
      
      // Wait for WebSocket to be ready
      await new Promise((resolve) => {
        const checkConnection = () => {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            console.log("WebSocket ready, proceeding with media setup");
            resolve(true);
          } else {
            setTimeout(checkConnection, 50);
          }
        };
        checkConnection();
      });
      
      try {
        // Get media first, then initialize peer connection with the stream
        await getUserMedia();
        await initializePeerConnection();
        
        // Wait for peer connection to be fully initialized
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Send join room message - server will assign role
        const ws = wsRef.current;
        if (ws?.readyState === WebSocket.OPEN) {
          console.log("Sending join-room message");
          ws.send(JSON.stringify({
            type: 'signaling',
            data: {
              type: 'join-room',
              roomId,
              senderId: 'user',
              data: null,
            }
          }));
          // Announce our language to the room so the partner's display auto-updates
          if (myLanguageRef.current) {
            ws.send(JSON.stringify({ type: 'language-announce', language: myLanguageRef.current }));
          }
        } else {
          console.error("WebSocket not ready when trying to send join-room message");
        }
      } catch (mediaError) {
        console.error("Error with media or peer connection setup:", mediaError);
        // Still try to join without media if needed
        const ws = wsRef.current;
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'signaling',
            data: {
              type: 'join-room',
              roomId,
              senderId: 'user',
              data: null,
            }
          }));
        }
      }
    } catch (error) {
      console.error("Error joining room:", error);
    }
  }, [roomId, initializeWebSocket, initializePeerConnection]);

  const leaveRoom = useCallback(() => {
    // Mark as intentional leave so auto-reconnect doesn't fire
    isLeavingRef.current = true;

    // Clear heartbeat and reconnect timers
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
    if (reconnectRef.current) {
      clearTimeout(reconnectRef.current);
      reconnectRef.current = null;
    }

    // Stop local stream
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      setLocalStream(null);
      localStreamRef.current = null;
    }

    // Close peer connection
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    // Send leave room message and close WebSocket
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'signaling',
        data: {
          type: 'leave-room',
          roomId,
          senderId: 'user',
          data: null,
        }
      }));
      wsRef.current.close();
    }

    setIsConnected(false);
    setWsConnected(false);
    setRemoteStream(null);
  }, [roomId]);

  const toggleMicrophone = useCallback(() => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
      }
    }
  }, []);

  const toggleCamera = useCallback(() => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
      }
    }
  }, []);

  useEffect(() => {
    return () => {
      leaveRoom();
    };
  }, [leaveRoom]);

  const replaceVideoTrack = async (newTrack: MediaStreamTrack) => {
    if (!peerConnectionRef.current) return;
    const sender = peerConnectionRef.current
      .getSenders()
      .find(s => s.track?.kind === "video");
    if (sender) await sender.replaceTrack(newTrack);
  };

  return {
    localStream,
    remoteStream,
    isConnected,
    wsConnected,
    connectionQuality,
    partnerLanguage,
    joinRoom,
    leaveRoom,
    toggleMicrophone,
    toggleCamera,
    replaceVideoTrack,
  };
}
