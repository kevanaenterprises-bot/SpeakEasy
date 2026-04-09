import { type CallSession, type InsertCallSession, type Translation, type InsertTranslation } from "@shared/schema";
import { randomUUID, scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { drizzle } from "drizzle-orm/node-postgres";
import pkg from "pg";
const { Pool } = pkg;
import { eq } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const scryptAsync = promisify(scrypt);

// ── Password helpers ──────────────────────────────────────────────────────────
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

export async function comparePasswords(supplied: string, stored: string): Promise<boolean> {
  const [hashed, salt] = stored.split(".");
  if (!hashed || !salt) return false;
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
  password: string;
  displayName: string;
  role?: UserRole;
  language?: string;
  email?: string;
}

// ── DB Schema (matches existing Railway tables) ───────────────────────────────
const usersTable = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  displayName: text("display_name").notNull().default(""),
  role: text("role").notNull().default("user"),
  language: text("language").notNull().default("en"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

const callSessionsTable = pgTable("call_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  hostUserId: varchar("host_user_id").notNull(),
  guestUserId: varchar("guest_user_id"),
  status: text("status").notNull().default("waiting"),
  createdAt: timestamp("created_at").defaultNow(),
  endedAt: timestamp("ended_at"),
});

const translationsTable = pgTable("translations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull(),
  originalText: text("original_text").notNull(),
  translatedText: text("translated_text").notNull(),
  sourceLanguage: text("source_language").notNull(),
  targetLanguage: text("target_language").notNull(),
  speakerId: varchar("speaker_id").notNull(),
  timestamp: timestamp("timestamp").defaultNow(),
});

// ── Storage interface ─────────────────────────────────────────────────────────
export interface IStorage {
  getUser(id: string): Promise<AppUser | undefined>;
  getUserByUsername(username: string): Promise<AppUser | undefined>;
  createUser(user: InsertAppUser): Promise<AppUser>;
  updateUser(id: string, updates: Partial<AppUser>): Promise<AppUser | undefined>;
  deleteUser(id: string): Promise<void>;
  listUsers(): Promise<AppUser[]>;
  getCallSession(id: string): Promise<CallSession | undefined>;
  createCallSession(session: InsertCallSession): Promise<CallSession>;
  updateCallSession(id: string, updates: Partial<CallSession>): Promise<CallSession | undefined>;
  createTranslation(translation: InsertTranslation): Promise<Translation>;
  getTranslationsBySession(sessionId: string): Promise<Translation[]>;
}

// ── PostgreSQL Storage ────────────────────────────────────────────────────────
export class PgStorage implements IStorage {
  private db: ReturnType<typeof drizzle>;

  constructor(pool: Pool) {
    this.db = drizzle(pool);
    this.ensureSchema().then(() => this.seedAdmin());
  }

  private async ensureSchema() {
    const pool = (this.db as any).session?.client || null;
    try {
      // Add new columns if they don't exist (safe migration)
      await (this.db as any).execute(sql`
        ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT NOT NULL DEFAULT '';
        ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user';
        ALTER TABLE users ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'en';
        ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
      `);
      console.log("✅ Schema columns verified");
    } catch (err) {
      console.log("Schema already up to date");
    }
  }

  private async seedAdmin() {
    const adminUsername = process.env.ADMIN_USERNAME || "admin";
    const adminPassword = process.env.ADMIN_PASSWORD || "speakeasy2026";
    try {
      const existing = await this.getUserByUsername(adminUsername);
      if (!existing) {
        await this.createUser({
          username: adminUsername,
          password: adminPassword,
          displayName: "Administrator",
          role: "admin",
          language: "en",
        });
        console.log(`✅ Admin account seeded: ${adminUsername}`);
      }
    } catch (err) {
      console.error("Admin seed error:", err);
    }
  }

  async getUser(id: string): Promise<AppUser | undefined> {
    const rows = await this.db.select().from(usersTable).where(eq(usersTable.id, id));
    return rows[0] as AppUser | undefined;
  }

  async getUserByUsername(username: string): Promise<AppUser | undefined> {
    const rows = await this.db.select().from(usersTable).where(eq(usersTable.username, username));
    return rows[0] as AppUser | undefined;
  }

  async createUser(insertUser: InsertAppUser): Promise<AppUser> {
    const hashed = await hashPassword(insertUser.password);
    const rows = await this.db.insert(usersTable).values({
      username: insertUser.username,
      password: hashed,
      displayName: insertUser.displayName,
      role: insertUser.role ?? "user",
      language: insertUser.language ?? "en",
      isActive: true,
    }).returning();
    return rows[0] as AppUser;
  }

  async updateUser(id: string, updates: Partial<AppUser>): Promise<AppUser | undefined> {
    const rows = await this.db.update(usersTable).set(updates as any).where(eq(usersTable.id, id)).returning();
    return rows[0] as AppUser | undefined;
  }

  async deleteUser(id: string): Promise<void> {
    await this.db.delete(usersTable).where(eq(usersTable.id, id));
  }

  async listUsers(): Promise<AppUser[]> {
    return await this.db.select().from(usersTable) as AppUser[];
  }

  async getCallSession(id: string): Promise<CallSession | undefined> {
    const rows = await this.db.select().from(callSessionsTable).where(eq(callSessionsTable.id, id));
    return rows[0] as CallSession | undefined;
  }

  async createCallSession(insertSession: InsertCallSession): Promise<CallSession> {
    const rows = await this.db.insert(callSessionsTable).values({
      hostUserId: insertSession.hostUserId,
      guestUserId: insertSession.guestUserId ?? null,
      status: "waiting",
    }).returning();
    return rows[0] as CallSession;
  }

  async updateCallSession(id: string, updates: Partial<CallSession>): Promise<CallSession | undefined> {
    const rows = await this.db.update(callSessionsTable).set(updates as any).where(eq(callSessionsTable.id, id)).returning();
    return rows[0] as CallSession | undefined;
  }

  async createTranslation(insertTranslation: InsertTranslation): Promise<Translation> {
    const rows = await this.db.insert(translationsTable).values(insertTranslation).returning();
    return rows[0] as Translation;
  }

  async getTranslationsBySession(sessionId: string): Promise<Translation[]> {
    return await this.db.select().from(translationsTable).where(eq(translationsTable.sessionId, sessionId)) as Translation[];
  }
}

// ── Fallback in-memory storage ────────────────────────────────────────────────
export class MemStorage implements IStorage {
  private users: Map<string, AppUser> = new Map();
  private callSessions: Map<string, CallSession> = new Map();
  private translations: Map<string, Translation> = new Map();

  constructor() { this.seedAdmin(); }

  private async seedAdmin() {
    const adminUsername = process.env.ADMIN_USERNAME || "admin";
    const adminPassword = process.env.ADMIN_PASSWORD || "speakeasy2026";
    const existing = await this.getUserByUsername(adminUsername);
    if (!existing) {
      const hashed = await hashPassword(adminPassword);
      const admin: AppUser = { id: randomUUID(), username: adminUsername, password: hashed, displayName: "Administrator", role: "admin", language: "en", isActive: true, createdAt: new Date() };
      this.users.set(admin.id, admin);
      console.log(`✅ Admin seeded in memory: ${adminUsername}`);
    }
  }

  async getUser(id: string) { return this.users.get(id); }
  async getUserByUsername(username: string) { return Array.from(this.users.values()).find(u => u.username === username); }
  async createUser(insertUser: InsertAppUser): Promise<AppUser> {
    const hashed = await hashPassword(insertUser.password);
    const user: AppUser = { id: randomUUID(), username: insertUser.username, password: hashed, displayName: insertUser.displayName, role: insertUser.role ?? "user", language: insertUser.language ?? "en", isActive: true, createdAt: new Date() };
    this.users.set(user.id, user);
    return user;
  }
  async updateUser(id: string, updates: Partial<AppUser>) {
    const user = this.users.get(id);
    if (!user) return undefined;
    const updated = { ...user, ...updates };
    this.users.set(id, updated);
    return updated;
  }
  async deleteUser(id: string) { this.users.delete(id); }
  async listUsers() { return Array.from(this.users.values()); }
  async getCallSession(id: string) { return this.callSessions.get(id); }
  async createCallSession(insertSession: InsertCallSession): Promise<CallSession> {
    const id = randomUUID();
    const session: CallSession = { ...insertSession, id, status: "waiting", createdAt: new Date(), endedAt: null, guestUserId: insertSession.guestUserId ?? null };
    this.callSessions.set(id, session);
    return session;
  }
  async updateCallSession(id: string, updates: Partial<CallSession>) {
    const session = this.callSessions.get(id);
    if (!session) return undefined;
    const updated = { ...session, ...updates };
    this.callSessions.set(id, updated);
    return updated;
  }
  async createTranslation(insertTranslation: InsertTranslation): Promise<Translation> {
    const id = randomUUID();
    const translation: Translation = { ...insertTranslation, id, timestamp: new Date() };
    this.translations.set(id, translation);
    return translation;
  }
  async getTranslationsBySession(sessionId: string) {
    return Array.from(this.translations.values()).filter(t => t.sessionId === sessionId);
  }
}

// ── Export the right storage based on env ────────────────────────────────────
function createStorage(): IStorage {
  if (process.env.DATABASE_URL) {
    console.log("🐘 Using PostgreSQL database");
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false });
    return new PgStorage(pool);
  }
  console.log("⚠️ No DATABASE_URL — using in-memory storage");
  return new MemStorage();
}

export const storage = createStorage();
