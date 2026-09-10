import crypto from "node:crypto";
import type { Express, NextFunction, Request, Response } from "express";
import { pool } from "./db";

export type AppAuth = {
  userId: string;
  workspaceId: string;
  email: string;
  displayName: string;
  systemRole: "user" | "admin";
  workspaceRole: "owner" | "admin" | "member";
};

declare global {
  namespace Express {
    interface Request {
      appAuth?: AppAuth;
    }
  }
}

const COOKIE_NAME = "turmarkt_session";
const SESSION_DAYS = Math.max(1, Number(process.env.SESSION_DAYS || 7));

function getDb() {
  if (!pool) throw new Error("DATABASE_URL gerekli");
  return pool;
}

function tokenHash(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function randomToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function parseCookies(header?: string): Record<string, string> {
  if (!header) return {};
  const result: Record<string, string> = {};
  for (const entry of header.split(";")) {
    const index = entry.indexOf("=");
    if (index < 0) continue;
    const key = decodeURIComponent(entry.slice(0, index).trim());
    const value = decodeURIComponent(entry.slice(index + 1).trim());
    result[key] = value;
  }
  return result;
}

function setSessionCookie(res: Response, token: string) {
  const secure = process.env.NODE_ENV === "production";
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`,
  );
}

function clearSessionCookie(res: Response) {
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
  );
}

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const key = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (error, derived) =>
      error ? reject(error) : resolve(derived),
    );
  });
  return `scrypt$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, saltEncoded, expectedEncoded] = String(stored || "").split("$");
  if (algorithm !== "scrypt" || !saltEncoded || !expectedEncoded) return false;
  const salt = Buffer.from(saltEncoded, "base64url");
  const expected = Buffer.from(expectedEncoded, "base64url");
  const actual = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(password, salt, expected.length, (error, derived) =>
      error ? reject(error) : resolve(derived),
    );
  });
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

async function createSession(userId: string, workspaceId: string, res: Response) {
  const db = getDb();
  const token = randomToken();
  await db.query(
    `INSERT INTO app_sessions(user_id, workspace_id, token_hash, expires_at)
     VALUES ($1,$2,$3,NOW() + ($4 || ' days')::interval)`,
    [userId, workspaceId, tokenHash(token), String(SESSION_DAYS)],
  );
  setSessionCookie(res, token);
}

export async function resolveAppAuth(req: Request): Promise<AppAuth | null> {
  const db = getDb();
  const cookies = parseCookies(req.headers.cookie);
  const bearer = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
  const token = cookies[COOKIE_NAME] || bearer;
  if (!token) return null;

  const result = await db.query(
    `SELECT s.user_id, s.workspace_id, u.email, u.display_name, u.system_role, wm.role AS workspace_role
       FROM app_sessions s
       JOIN app_users u ON u.id=s.user_id AND u.is_active=TRUE
       JOIN workspace_members wm ON wm.user_id=s.user_id AND wm.workspace_id=s.workspace_id
      WHERE s.token_hash=$1 AND s.expires_at>NOW()
      LIMIT 1`,
    [tokenHash(token)],
  );
  const row = result.rows[0];
  if (!row) return null;
  void db.query("UPDATE app_sessions SET last_seen_at=NOW() WHERE token_hash=$1", [tokenHash(token)]).catch(() => undefined);
  return {
    userId: row.user_id,
    workspaceId: row.workspace_id,
    email: row.email,
    displayName: row.display_name || "",
    systemRole: row.system_role,
    workspaceRole: row.workspace_role,
  };
}

export async function requireAppAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const auth = await resolveAppAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: "Oturum gerekli" });
    req.appAuth = auth;
    return next();
  } catch (error) {
    console.error("[multi-user-auth]", error);
    return res.status(503).json({ success: false, message: "Kimlik doğrulama servisi kullanılamıyor" });
  }
}

async function registerUser(email: string, password: string, displayName: string) {
  const db = getDb();
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const passwordHash = await hashPassword(password);
    const userResult = await client.query(
      `INSERT INTO app_users(email,password_hash,display_name,system_role)
       VALUES ($1,$2,$3,'user') RETURNING id,email,display_name,system_role`,
      [email, passwordHash, displayName],
    );
    const user = userResult.rows[0];
    const workspaceResult = await client.query(
      "INSERT INTO workspaces(name) VALUES ($1) RETURNING id,name",
      [displayName ? `${displayName} Çalışma Alanı` : "Çalışma Alanım"],
    );
    const workspace = workspaceResult.rows[0];
    await client.query(
      "INSERT INTO workspace_members(workspace_id,user_id,role) VALUES ($1,$2,'owner')",
      [workspace.id, user.id],
    );
    await client.query("COMMIT");
    return { user, workspace };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function ensureBootstrapAdmin() {
  const email = String(process.env.BOOTSTRAP_ADMIN_EMAIL || "").trim().toLowerCase();
  const password = String(process.env.BOOTSTRAP_ADMIN_PASSWORD || "");
  if (!email || !password || !pool) return;
  if (password.length < 12) {
    console.warn("[multi-user-auth] BOOTSTRAP_ADMIN_PASSWORD en az 12 karakter olmalı");
    return;
  }
  const exists = await pool.query("SELECT id FROM app_users WHERE email=$1 LIMIT 1", [email]);
  if (exists.rows[0]) {
    await pool.query("UPDATE app_users SET system_role='admin', is_active=TRUE WHERE email=$1", [email]);
    return;
  }
  const created = await registerUser(email, password, "Turmarkt Yönetici");
  await pool.query("UPDATE app_users SET system_role='admin' WHERE id=$1", [created.user.id]);
  console.log(`[multi-user-auth] bootstrap admin oluşturuldu: ${email}`);
}

export function registerMultiUserAuthRoutes(app: Express) {
  app.post("/auth/register", async (req, res) => {
    try {
      const allowPublic = process.env.ALLOW_PUBLIC_REGISTRATION === "true" || process.env.NODE_ENV !== "production";
      if (!allowPublic) return res.status(403).json({ success: false, message: "Yeni kullanıcı kaydı şu anda kapalı" });
      const email = String(req.body?.email || "").trim().toLowerCase();
      const password = String(req.body?.password || "");
      const displayName = String(req.body?.displayName || "").trim().slice(0, 120);
      if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ success: false, message: "Geçerli e-posta gerekli" });
      if (password.length < 10) return res.status(400).json({ success: false, message: "Şifre en az 10 karakter olmalı" });
      const created = await registerUser(email, password, displayName);
      await createSession(created.user.id, created.workspace.id, res);
      return res.status(201).json({ success: true, user: { id: created.user.id, email: created.user.email, displayName: created.user.display_name, systemRole: created.user.system_role }, workspace: created.workspace });
    } catch (error: any) {
      if (error?.code === "23505") return res.status(409).json({ success: false, message: "Bu e-posta zaten kayıtlı" });
      console.error("[auth/register]", error);
      return res.status(500).json({ success: false, message: "Kayıt oluşturulamadı" });
    }
  });

  app.post("/auth/login", async (req, res) => {
    try {
      const db = getDb();
      const email = String(req.body?.email || "").trim().toLowerCase();
      const password = String(req.body?.password || "");
      const result = await db.query(
        `SELECT u.id,u.email,u.display_name,u.password_hash,u.system_role,wm.workspace_id,wm.role AS workspace_role
           FROM app_users u
           JOIN workspace_members wm ON wm.user_id=u.id
          WHERE u.email=$1 AND u.is_active=TRUE
          ORDER BY wm.created_at ASC LIMIT 1`,
        [email],
      );
      const user = result.rows[0];
      if (!user || !(await verifyPassword(password, user.password_hash))) {
        return res.status(401).json({ success: false, message: "E-posta veya şifre hatalı" });
      }
      await createSession(user.id, user.workspace_id, res);
      return res.json({ success: true, user: { id: user.id, email: user.email, displayName: user.display_name, systemRole: user.system_role, workspaceRole: user.workspace_role }, workspaceId: user.workspace_id });
    } catch (error) {
      console.error("[auth/login]", error);
      return res.status(500).json({ success: false, message: "Giriş yapılamadı" });
    }
  });

  app.post("/auth/change-password", requireAppAuth, async (req, res) => {
    try {
      const currentPassword = String(req.body?.currentPassword || "");
      const newPassword = String(req.body?.newPassword || "");
      if (newPassword.length < 10) return res.status(400).json({ success: false, message: "Yeni şifre en az 10 karakter olmalı" });
      if (newPassword === currentPassword) return res.status(400).json({ success: false, message: "Yeni şifre mevcut şifreden farklı olmalı" });
      const db = getDb();
      const userResult = await db.query("SELECT password_hash FROM app_users WHERE id=$1 AND is_active=TRUE LIMIT 1", [req.appAuth!.userId]);
      const user = userResult.rows[0];
      if (!user || !(await verifyPassword(currentPassword, user.password_hash))) {
        return res.status(401).json({ success: false, message: "Mevcut şifre hatalı" });
      }
      const passwordHash = await hashPassword(newPassword);
      const client = await db.connect();
      try {
        await client.query("BEGIN");
        await client.query("UPDATE app_users SET password_hash=$2, updated_at=NOW() WHERE id=$1", [req.appAuth!.userId, passwordHash]);
        await client.query("DELETE FROM app_sessions WHERE user_id=$1", [req.appAuth!.userId]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
      await createSession(req.appAuth!.userId, req.appAuth!.workspaceId, res);
      return res.json({ success: true, message: "Şifre değiştirildi ve diğer oturumlar kapatıldı" });
    } catch (error) {
      console.error("[auth/change-password]", error);
      return res.status(500).json({ success: false, message: "Şifre değiştirilemedi" });
    }
  });

  app.post("/auth/logout", async (req, res) => {
    try {
      const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
      if (token && pool) await pool.query("DELETE FROM app_sessions WHERE token_hash=$1", [tokenHash(token)]);
    } catch (error) {
      console.warn("[auth/logout]", error);
    }
    clearSessionCookie(res);
    return res.status(204).end();
  });

  app.get("/auth/me", requireAppAuth, (req, res) => {
    return res.json({ success: true, user: req.appAuth });
  });
}
