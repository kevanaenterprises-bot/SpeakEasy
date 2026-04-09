import { type CallSession, type InsertCallSession, type Translation, type InsertTranslation } from "@shared/schema";
import { randomUUID, scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

// ── Password helpers ──────────────────────────────────────────────────────────
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

export async function comparePasswords(supplied: string, stored: string): Promise<boolean> {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

// ── Types ─────────────────────────────────────────────────────────────────────
export type UserRole = "admin" | "user";

export interface AppUser {
  id: string;
  username: string;
  password: string;
  displayName: string;
  role: UserRole;
  language: string;
  isActive: boolean;
  createdAt: Date;
}

export interface InsertAppUser {
  username: string;
  password: string; // plain text — will be hashed in storage
  displayName: string;
  role?: UserRole;
  language?: string;
}

export interface IStorage {
  // Auth
  getUser(id: string): Promise<AppUser | undefined>;
  getUserByUsername(username: string): Promise<AppUser | undefined>;
  createUser(user: InsertAppUser): Promise<AppUser>;
  updateUser(id: string, updates: Partial<AppUser>): Promise<AppUser | undefined>;
  deleteUser(id: string): Promise<void>;
  listUsers(): Promise<AppUser[]>;

  // Call sessions
  getCallSession(id: string): Promise<CallSession | undefined>;
  createCallSession(session: InsertCallSession): Promise<CallSession>;
  updateCallSession(id: string, updates: Partial<CallSession>): Promise<CallSession | undefined>;

  // Translations
  createTranslation(translation: InsertTranslation): Promise<Translation>;
  getTranslationsBySession(sessionId: string): Promise<Translation[]>;
}

export class MemStorage implements IStorage {
  private users: Map<string, AppUser> = new Map();
  private callSessions: Map<string, CallSession> = new Map();
  private translations: Map<string, Translation> = new Map();

  constructor() {
    // Seed admin account on startup
    this.seedAdmin();
  }

  private async seedAdmin() {
    const adminUsername = process.env.ADMIN_USERNAME || "admin";
    const adminPassword = process.env.ADMIN_PASSWORD || "speakeasy2026";
    const existing = await this.getUserByUsername(adminUsername);
    if (!existing) {
      const hashed = await hashPassword(adminPassword);
      const admin: AppUser = {
        id: randomUUID(),
        username: adminUsername,
        password: hashed,
        displayName: "Administrator",
        role: "admin",
        language: "en",
        isActive: true,
        createdAt: new Date(),
      };
      this.users.set(admin.id, admin);
      console.log(`✅ Admin account seeded: ${adminUsername}`);
    }
  }

  async getUser(id: string): Promise<AppUser | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<AppUser | undefined> {
    return Array.from(this.users.values()).find(u => u.username === username);
  }

  async createUser(insertUser: InsertAppUser): Promise<AppUser> {
    const hashed = await hashPassword(insertUser.password);
    const user: AppUser = {
      id: randomUUID(),
      username: insertUser.username,
      password: hashed,
      displayName: insertUser.displayName,
      role: insertUser.role ?? "user",
      language: insertUser.language ?? "en",
      isActive: true,
      createdAt: new Date(),
    };
    this.users.set(user.id, user);
    return user;
  }

  async updateUser(id: string, updates: Partial<AppUser>): Promise<AppUser | undefined> {
    const user = this.users.get(id);
    if (!user) return undefined;
    const updated = { ...user, ...updates };
    this.users.set(id, updated);
    return updated;
  }

  async deleteUser(id: string): Promise<void> {
    this.users.delete(id);
  }

  async listUsers(): Promise<AppUser[]> {
    return Array.from(this.users.values());
  }

  async getCallSession(id: string): Promise<CallSession | undefined> {
    return this.callSessions.get(id);
  }

  async createCallSession(insertSession: InsertCallSession): Promise<CallSession> {
    const id = randomUUID();
    const session: CallSession = {
      ...insertSession,
      id,
      status: "waiting",
      createdAt: new Date(),
      endedAt: null,
      guestUserId: insertSession.guestUserId ?? null,
    };
    this.callSessions.set(id, session);
    return session;
  }

  async updateCallSession(id: string, updates: Partial<CallSession>): Promise<CallSession | undefined> {
    const session = this.callSessions.get(id);
    if (!session) return undefined;
    const updated = { ...session, ...updates };
    this.callSessions.set(id, updated);
    return updated;
  }

  async createTranslation(insertTranslation: InsertTranslation): Promise<Translation> {
    const id = randomUUID();
    const translation: Translation = {
      ...insertTranslation,
      id,
      timestamp: new Date(),
    };
    this.translations.set(id, translation);
    return translation;
  }

  async getTranslationsBySession(sessionId: string): Promise<Translation[]> {
    return Array.from(this.translations.values()).filter(t => t.sessionId === sessionId);
  }
}

export const storage = new MemStorage();
