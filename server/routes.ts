import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage, comparePasswords, hashPassword } from "./storage";
import { translationService } from "./services/translation";
import { speechRecognitionService } from "./services/speechRecognition";
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
      if (err) return next(err);
      if (!user) return res.status(401).json({ error: info?.message || "Login failed" });
      req.logIn(user, (err) => {
        if (err) return next(err);
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
      const { username, password, displayName, role, language } = req.body;
      if (!username || !password || !displayName) {
        return res.status(400).json({ error: "username, password, and displayName are required" });
      }
      const existing = await storage.getUserByUsername(username);
      if (existing) return res.status(409).json({ error: "Username already taken" });
      const user = await storage.createUser({ username, password, displayName, role: role || "user", language: language || "en" });
      const { password: _, ...safeUser } = user;
      res.json(safeUser);
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

  app.get("/api/health", (req, res) => {
    res.json({
      status: "ok",
      services: {
        translation: translationService.isConfigured(),
        speechRecognition: speechRecognitionService.isConfigured(),
      }
    });
  });

  // WebSocket Server for WebRTC signaling and real-time communication
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  // Store active connections by room
  const rooms = new Map<string, Set<WebSocket>>();
  const connectionRooms = new Map<WebSocket, string>();

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
      } catch (error) {
        console.error('WebSocket message error:', error);
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
      }
    });

    ws.on('close', () => {
      // Clean up room connections
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
      console.log(`📊 After close - Active rooms: ${rooms.size}`);
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

            // Store translation in database
            console.log('💾 Storing translation in database');
            await storage.createTranslation({
              sessionId,
              originalText: speechResult.transcript,
              translatedText: translationResult.translatedText,
              sourceLanguage: srcLang,
              targetLanguage: tgtLang,
              speakerId: speakerId,
            });

            // Broadcast translation result to all participants
            // Use sessionId as roomId since they match
            const roomId = sessionId;
            if (rooms.has(roomId)) {
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
              
              console.log('📡 Broadcasting translation result:', JSON.stringify(resultMessage, null, 2));
              broadcastToRoom(roomId, resultMessage);
              
              // Also send directly to the sender to ensure they see their own translation
              ws.send(JSON.stringify(resultMessage));
              console.log('✅ Translation broadcast completed');
            } else {
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
