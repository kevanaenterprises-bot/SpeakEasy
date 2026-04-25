import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage, comparePasswords, hashPassword } from "./storage";
import { sendWelcomeEmail } from "./services/email";
import { translationService } from "./services/translation";
import { speechRecognitionService } from "./services/speechRecognition";
import { speechToTextService } from "./services/speechToText";
import { signalingMessageSchema, translationMessageSchema, insertCallSessionSchema } from "@shared/schema";
import { z } from "zod";
import session from "express-session";
import MemoryStore from "memorystore";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";

const MemoryStoreSession = MemoryStore(session);

// ── Auth middleware ────────────────────────────────────────────────────────────
function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ error: "Not authenticated" });
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated() && (req.user as any)?.role === "admin") return next();
  res.status(403).json({ error: "Admin access required" });
}

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);

  // ── Session & Passport setup ───────────────────────────────────────────────
  app.use(session({
    secret: process.env.SESSION_SECRET || "speakeasy-secret-2026",
    resave: false,
    saveUninitialized: false,
    store: new MemoryStoreSession({ checkPeriod: 86400000 }),
    cookie: { secure: false, maxAge: 7 * 24 * 60 * 60 * 1000 }, // 7 days
  }));

  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(new LocalStrategy(async (username, password, done) => {
    try {
      const user = await storage.getUserByUsername(username);
      if (!user) return done(null, false, { message: "Invalid username or password" });
      if (!user.isActive) return done(null, false, { message: "Account is disabled" });
      const valid = await comparePasswords(password, user.password);
      if (!valid) return done(null, false, { message: "Invalid username or password" });
      return done(null, user);
    } catch (err) {
      return done(err);
    }
  }));

  passport.serializeUser((user: any, done) => done(null, user.id));
  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await storage.getUser(id);
      done(null, user || false);
    } catch (err) {
      done(err);
    }
  });

  // ── Auth routes ─────────────────────────────────────────────────────────────
  app.post("/api/auth/login", (req, res, next) => {
    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) {
        console.error("Login error:", err);
        return res.status(500).json({ error: err?.message || "Server error during login" });
      }
      if (!user) return res.status(401).json({ error: info?.message || "Login failed" });
      req.logIn(user, (err) => {
        if (err) {
          console.error("Session error:", err);
          return res.status(500).json({ error: err?.message || "Session error" });
        }
        const { password, ...safeUser } = user;
        res.json({ user: safeUser });
      });
    })(req, res, next);
  });

  app.post("/api/auth/logout", (req, res) => {
    req.logout(() => res.json({ success: true }));
  });

  app.get("/api/auth/me", (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Not authenticated" });
    const { password, ...safeUser } = req.user as any;
    res.json({ user: safeUser });
  });

  // ── Admin routes ─────────────────────────────────────────────────────────────
  app.get("/api/admin/users", requireAdmin, async (req, res) => {
    const users = await storage.listUsers();
    res.json(users.map(({ password, ...u }) => u));
  });

  app.post("/api/admin/users", requireAdmin, async (req, res) => {
    try {
      const { username, password, displayName, role, language, email } = req.body;
      if (!username || !password || !displayName) {
        return res.status(400).json({ error: "username, password, and displayName are required" });
      }
      const existing = await storage.getUserByUsername(username);
      if (existing) return res.status(409).json({ error: "Username already taken" });
      const user = await storage.createUser({ username, password, displayName, role: role || "user", language: language || "en", email });
      const { password: _, ...safeUser } = user;

      // Send welcome email if address provided
      let emailSent = false;
      if (email) {
        const appUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
        const result = await sendWelcomeEmail({ toEmail: email, toName: displayName, username, password, appUrl });
        emailSent = result.success;
      }

      res.json({ ...safeUser, emailSent });
    } catch (err) {
      res.status(500).json({ error: "Failed to create user" });
    }
  });

  app.put("/api/admin/users/:id", requireAdmin, async (req, res) => {
    try {
      const { displayName, role, language, isActive } = req.body;
      const updated = await storage.updateUser(req.params.id, { displayName, role, language, isActive });
      if (!updated) return res.status(404).json({ error: "User not found" });
      const { password, ...safeUser } = updated;
      res.json(safeUser);
    } catch (err) {
      res.status(500).json({ error: "Failed to update user" });
    }
  });

  app.post("/api/admin/users/:id/reset-password", requireAdmin, async (req, res) => {
    try {
      const { newPassword } = req.body;
      if (!newPassword) return res.status(400).json({ error: "newPassword is required" });
      const hashed = await hashPassword(newPassword);
      const updated = await storage.updateUser(req.params.id, { password: hashed });
      if (!updated) return res.status(404).json({ error: "User not found" });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to reset password" });
    }
  });

  app.delete("/api/admin/users/:id", requireAdmin, async (req, res) => {
    try {
      const user = await storage.getUser(req.params.id);
      if (!user) return res.status(404).json({ error: "User not found" });
      if (user.role === "admin") return res.status(403).json({ error: "Cannot delete admin account" });
      await storage.deleteUser(req.params.id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to delete user" });
    }
  });

  // REST API Routes
  app.post("/api/sessions", async (req, res) => {
    try {
      const sessionData = insertCallSessionSchema.parse(req.body);
      const session = await storage.createCallSession(sessionData);
      res.json(session);
    } catch (error) {
      res.status(400).json({ error: "Invalid session data" });
    }
  });

  app.get("/api/sessions/:id", async (req, res) => {
    try {
      const session = await storage.getCallSession(req.params.id);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      res.json(session);
    } catch (error) {
      res.status(500).json({ error: "Failed to get session" });
    }
  });

  app.post("/api/sessions/:id/end", async (req, res) => {
    try {
      const session = await storage.updateCallSession(req.params.id, {
        status: "ended",
        endedAt: new Date(),
      });
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      res.json(session);
    } catch (error) {
      res.status(500).json({ error: "Failed to end session" });
    }
  });

  app.post("/api/translate", async (req, res) => {
    try {
      const { text, targetLanguage, sourceLanguage } = req.body;
      
      if (!translationService.isConfigured()) {
        return res.status(503).json({ error: "Translation service not configured" });
      }

      const result = await translationService.translateText(text, targetLanguage, sourceLanguage);
      res.json(result);
    } catch (error) {
      console.error("Translation error:", error);
      res.status(500).json({ error: "Translation failed" });
    }
  });

  app.post("/api/speech-to-text", async (req, res) => {
    try {
      const { transcript, languageCode, confidence } = req.body;
      
      if (!speechRecognitionService.isConfigured()) {
        return res.status(503).json({ error: "Speech recognition service not configured" });
      }

      const result = await speechRecognitionService.recognizeSpeech(transcript, languageCode, confidence);
      res.json(result);
    } catch (error) {
      console.error("Speech recognition error:", error);
      res.status(500).json({ error: "Speech recognition failed" });
    }
  });

  app.get("/api/twilio-token", async (req, res) => {
  try {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    if (!accountSid || !authToken) {
      return res.status(503).json({ error: "Twilio not configured" });
    }

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Tokens.json`,
      {
        method: "POST",
        headers: {
          Authorization: "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
        },
      }
    );

    const data = await response.json();
    res.json({ iceServers: data.ice_servers });
  } catch (error) {
    console.error("Twilio token error:", error);
    res.status(500).json({ error: "Failed to get TURN credentials" });
  }
});

  app.get("/api/health", async (req, res) => {
    let dbStatus = "unknown";
    let dbError = null;
    let userCount = null;
    try {
      const users = await storage.listUsers();
      userCount = users.length;
      dbStatus = "ok";
    } catch (err: any) {
      dbStatus = "error";
      dbError = err?.message || String(err);
    }
    res.json({
      status: "ok",
      db: dbStatus,
      dbError,
      userCount,
      hasDb: !!process.env.DATABASE_URL,
      services: {
        translation: translationService.isConfigured(),
        speechRecognition: speechRecognitionService.isConfigured(),
      },
      googleSTT: speechToTextService.isConfigured(),
    });
  });

  // WebSocket Server for WebRTC signaling and real-time communication
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  // Store active connections by room (WebRTC signaling connections)
  const rooms = new Map<string, Set<WebSocket>>();
  const connectionRooms = new Map<WebSocket, string>();

  // Separate map for translation WebSocket connections per room
  // These are the WSs that listen for translation results
  const translationRooms = new Map<string, Set<WebSocket>>();
  const translationConnectionRooms = new Map<WebSocket, string>();
  // Store each connection's language pair: ws → { yourLanguage, targetLanguage }
  const connectionLanguages = new Map<WebSocket, { yourLanguage: string; targetLanguage: string }>();

  wss.on('connection', (ws: WebSocket) => {
    console.log('New WebSocket connection');

    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());
        
        // Handle signaling messages (WebRTC)
        if (message.type === 'signaling') {
          const signalingMsg = signalingMessageSchema.parse(message.data);
          handleSignalingMessage(ws, signalingMsg);
        }
        
        // Handle translation messages
        else if (message.type === 'translation') {
          const translationMsg = translationMessageSchema.parse(message.data);
          await handleTranslationMessage(ws, translationMsg);
        }

        // Keepalive ping — just acknowledge silently
        else if (message.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
        }

        // Translation WS room registration — does NOT trigger WebRTC participant events
        else if (message.type === 'translation-join') {
          const { sessionId: tSessionId, yourLanguage: yl, targetLanguage: tl } = message;
          if (tSessionId) {
            if (!translationRooms.has(tSessionId)) {
              translationRooms.set(tSessionId, new Set());
            }
            translationRooms.get(tSessionId)!.add(ws);
            translationConnectionRooms.set(ws, tSessionId);
            if (yl || tl) connectionLanguages.set(ws, { yourLanguage: yl || 'en', targetLanguage: tl || 'en' });
            console.log(`🔗 Translation WS joined room ${tSessionId} (${translationRooms.get(tSessionId)?.size} connection(s)) langs: ${yl}→${tl}`);
          }
        }

        // Language pair update — client changed dropdown mid-call
        else if (message.type === 'language-update') {
          const { yourLanguage: yl, targetLanguage: tl } = message;
          if (yl || tl) {
            connectionLanguages.set(ws, { yourLanguage: yl || 'en', targetLanguage: tl || 'en' });
            console.log(`🔄 Language update: ${yl}→${tl}`);
          }
        }

        // Handle language announcements — broadcast to everyone else in the room
        else if (message.type === 'language-announce') {
          const roomId = connectionRooms.get(ws);
          if (roomId) {
            broadcastToRoom(roomId, { type: 'language-announce', language: message.language }, ws);
          }
        }

        // Handle Google STT audio chunks from the browser
        else if (message.type === 'audio-chunk') {
          if (!speechToTextService.isConfigured()) {
            // Google STT not available — client should fall back to Web Speech API
            return;
          }
          const { audioBase64, languageCode, sessionId, speakerId, targetLanguage, encoding, sampleRate } = message;
          if (!audioBase64 || !languageCode || !sessionId) return;

          // encoding and sampleRate come from the client based on what MediaRecorder supports
          // Chrome/Android: WEBM_OPUS @ 48000, iOS Safari: LINEAR16 @ 16000
          const audioBuffer = Buffer.from(audioBase64, 'base64');
          const result = await speechToTextService.transcribe(
            audioBuffer,
            languageCode,
            encoding || 'WEBM_OPUS',
            sampleRate || 48000
          );

          if (!result?.transcript?.trim()) return;

          // Use stored language pair (set at join + updated on dropdown change) as authoritative.
          // Fall back to what the audio-chunk message says, then to 'en'.
          const storedLangs = connectionLanguages.get(ws);
          const tgtLang = storedLangs?.targetLanguage || targetLanguage || 'en';
          const srcLangCode = storedLangs?.yourLanguage || languageCode.split('-')[0];

          console.log(`🎙️ Google STT [${languageCode}]: "${result.transcript}" | target=${tgtLang} (chunk said: ${targetLanguage || 'none'})`);

          // Use sessionId as roomId — translation WS doesn't do join-room signaling
          const roomId = sessionId;

          // If same language, just echo the transcript back (no translation needed)
          if (srcLangCode === tgtLang) {
            ws.send(JSON.stringify({
              type: 'stt-result',
              transcript: result.transcript,
              confidence: result.confidence,
              languageCode,
            }));
            return;
          }

          // Translate
          console.log(`🌐 Translating "${result.transcript}" from ${srcLangCode} to ${tgtLang}`);
          try {
            const translation = await translationService.translateText(
              result.transcript,
              tgtLang,
              srcLangCode
            );
            console.log(`✅ Translation: "${translation.translatedText}"`);

            // Send transcript back to the speaker (their local display)
            ws.send(JSON.stringify({
              type: 'stt-result',
              transcript: result.transcript,
              confidence: result.confidence,
              languageCode,
            }));

            // Send local translation result to the speaker themselves
            ws.send(JSON.stringify({
              type: 'translation',
              data: {
                type: 'translation-result',
                originalText: result.transcript,
                translatedText: translation.translatedText,
                sourceLanguage: srcLangCode,
                targetLanguage: tgtLang,
                speakerId: 'local',
              }
            }));

            // Broadcast translation to partner's translation WS
            const tRoom = translationRooms.get(roomId);
            if (tRoom && tRoom.size > 0) {
              const broadcastMsg = JSON.stringify({
                type: 'translation',
                data: {
                  type: 'translation-result',
                  originalText: result.transcript,
                  translatedText: translation.translatedText,
                  sourceLanguage: srcLangCode,
                  targetLanguage: tgtLang,
                  speakerId: 'remote',
                }
              });
              let sent = 0;
              tRoom.forEach(client => {
                if (client !== ws && client.readyState === WebSocket.OPEN) {
                  client.send(broadcastMsg);
                  sent++;
                }
              });
              console.log(`📡 Broadcast STT translation to ${sent} partner(s) in room ${roomId}`);
            } else {
              console.warn(`⚠️ No partner translation WS in room ${roomId} — partner may not have opened translation yet`);
            }
          } catch (err) {
            console.error('Translation after STT failed:', err);
          }
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
      }
    });

    ws.on('close', () => {
      // Clean up WebRTC signaling room connections
      const roomId = connectionRooms.get(ws);
      console.log(`🔌 WebSocket closing for room: ${roomId || 'unknown'}`);

      if (roomId) {
        const room = rooms.get(roomId);
        if (room) {
          room.delete(ws);
          console.log(`👋 User left room ${roomId}. Remaining participants: ${room.size}`);

          if (room.size === 0) {
            rooms.delete(roomId);
            console.log(`🗑️ Room ${roomId} deleted (empty)`);
          } else {
            // Notify other participants that someone left
            broadcastToRoom(roomId, {
              type: 'signaling',
              data: {
                type: 'leave-room',
                roomId,
                senderId: 'system',
                data: null,
              }
            }, ws);
          }
        }
        connectionRooms.delete(ws);
      }

      // Clean up translation room connections
      const tRoomId = translationConnectionRooms.get(ws);
      if (tRoomId) {
        const tRoom = translationRooms.get(tRoomId);
        if (tRoom) {
          tRoom.delete(ws);
          if (tRoom.size === 0) translationRooms.delete(tRoomId);
        }
        translationConnectionRooms.delete(ws);
      }
      connectionLanguages.delete(ws);

      console.log(`📊 After close - Active rooms: ${rooms.size}, translation rooms: ${translationRooms.size}`);
    });
  });

  function handleSignalingMessage(ws: WebSocket, message: any) {
    const { roomId, type } = message;

    if (type === 'join-room') {
      console.log(`🚪 User joining room: ${roomId}`);
      
      // Add connection to room
      if (!rooms.has(roomId)) {
        console.log(`📦 Creating new room: ${roomId}`);
        rooms.set(roomId, new Set());
      }
      
      const room = rooms.get(roomId)!;
      const isFirstParticipant = room.size === 0;
      const role = isFirstParticipant ? 'caller' : 'callee';
      
      room.add(ws);
      connectionRooms.set(ws, roomId);
      
      console.log(`👤 Assigned role: ${role}, Room now has ${room.size} participant(s)`);
      console.log(`📊 Active rooms: ${rooms.size}, Total connections: ${connectionRooms.size}`);
      
      // Send role assignment to the joining user
      ws.send(JSON.stringify({
        type: 'signaling',
        data: {
          type: 'room-joined',
          roomId,
          role: role,
          participantCount: room.size
        }
      }));
      
      // Notify others in the room that someone joined
      broadcastToRoom(roomId, { 
        type: 'signaling', 
        data: {
          type: 'participant-joined',
          roomId,
          participantCount: room.size
        }
      }, ws);
      
      console.log(`✅ Room join complete for ${roomId}`);
    } else {
      // Forward signaling messages to other participants in the room
      console.log(`📶 Forwarding signaling message: ${message.type} in room ${roomId}`);
      broadcastToRoom(roomId, { type: 'signaling', data: message }, ws);
    }
  }

  async function handleTranslationMessage(ws: WebSocket, message: any) {
    try {
      console.log('📨 Received translation message:', JSON.stringify(message, null, 2));
      const { type, data, sessionId, speakerId } = message;

      if (type === 'speech-start') {
        // Broadcast that someone started speaking
        // Use sessionId as roomId since they match
        const roomId = sessionId;
        if (rooms.has(roomId)) {
          broadcastToRoom(roomId, { type: 'translation', data: message }, ws);
        }
      } else if (type === 'speech-end') {
        // Process speech recognition and translation
        console.log('🎯 Processing speech-end with data:', data);
        const { text: transcript, sourceLanguage, targetLanguage, speechCode, confidence } = data;
        
        if (!speechRecognitionService.isConfigured() || !translationService.isConfigured()) {
          ws.send(JSON.stringify({
            type: 'translation',
            data: {
              type: 'error',
              message: 'Translation services not configured'
            }
          }));
          return;
        }

        // Use the languages from the message, with fallbacks
        const srcLang = sourceLanguage || 'en';
        const tgtLang = targetLanguage || 'vi';
        
        // Skip translation if same language — just echo the speech back
        if (srcLang === tgtLang) {
          const roomId = sessionId;
          const echoMessage = {
            type: 'translation',
            data: {
              type: 'translation-result',
              originalText: data.text,
              translatedText: data.text,
              sourceLanguage: srcLang,
              targetLanguage: tgtLang,
              confidence: data.confidence || 0.9,
              speakerId: speakerId,
            }
          };
          if (rooms.has(roomId)) broadcastToRoom(roomId, echoMessage);
          ws.send(JSON.stringify(echoMessage));
          return;
        }

        console.log(`🌐 Translating from ${srcLang} to ${tgtLang}`);

        try {
          // Validate speech recognition result (transcript comes from browser)
          const speechResult = await speechRecognitionService.recognizeSpeech(transcript, speechCode || 'en-US', confidence);
          
          if (speechResult.transcript) {
            // Translate the recognized text using the specified languages
            const translationResult = await translationService.translateText(
              speechResult.transcript, 
              tgtLang, 
              srcLang
            );
            console.log('✅ Translation completed:', translationResult.translatedText);

            // Broadcast FIRST — don't let a DB failure block the user from seeing their translation
            const roomId = sessionId;
            const resultMessage = {
              type: 'translation',
              data: {
                type: 'translation-result',
                originalText: speechResult.transcript,
                translatedText: translationResult.translatedText,
                sourceLanguage: srcLang,
                targetLanguage: tgtLang,
                confidence: speechResult.confidence,
                speakerId: speakerId,
              }
            };
            // Send to the speaker's own translation WS (so they see their local translation)
            ws.send(JSON.stringify(resultMessage));
            // Broadcast the 'remote' version to all other translation WSs in the room
            const tRoom2 = translationRooms.get(roomId);
            if (tRoom2 && tRoom2.size > 0) {
              const remoteMsg = JSON.stringify({
                type: 'translation',
                data: { ...resultMessage.data, speakerId: 'remote' }
              });
              tRoom2.forEach(client => {
                if (client !== ws && client.readyState === WebSocket.OPEN) {
                  client.send(remoteMsg);
                }
              });
            }
            console.log('✅ Translation broadcast completed');

            // Store in DB separately — failure here won't affect the user
            try {
              await storage.createTranslation({
                sessionId,
                originalText: speechResult.transcript,
                translatedText: translationResult.translatedText,
                sourceLanguage: srcLang,
                targetLanguage: tgtLang,
                speakerId: speakerId,
              });
            } catch (dbErr) {
              console.warn('⚠️ DB store failed (non-fatal):', (dbErr as any)?.message);
            }

            if (false) {
              console.error('❌ No room found for session:', sessionId);
            }
          }
        } catch (error) {
          console.error('Translation processing error:', error);
          ws.send(JSON.stringify({
            type: 'translation',
            data: {
              type: 'error',
              message: 'Failed to process speech and translation'
            }
          }));
        }
      }
    } catch (error) {
      console.error('Translation message handling error:', error);
    }
  }

  function broadcastToRoom(roomId: string, message: any, excludeWs?: WebSocket) {
    const room = rooms.get(roomId);
    if (room) {
      room.forEach(client => {
        if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(message));
        }
      });
    }
  }

  return httpServer;
}
