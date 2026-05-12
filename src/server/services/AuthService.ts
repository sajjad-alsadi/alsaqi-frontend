import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { db } from '../db/index';
import { AuthError, ForbiddenError } from '../utils/errors';

export class AuthService {
  static async login(usernameOrEmail: string, password: string, jwtSecret: string, JWT_PRIVATE_KEY: string, ipAddress?: string, userAgent?: string, rememberMe?: boolean) {
    return await db.transaction(async () => {
      // Support login by username or email, case-insensitive
      const user = await db.prepare(`
        SELECT * FROM users 
        WHERE LOWER(username) = LOWER(?::text) OR LOWER(email) = LOWER(?::text)
      `).get(usernameOrEmail, usernameOrEmail) as any;
      
      if (!user) {
        console.warn(`[AuthService] Login failed: User not found for "${usernameOrEmail}"`);
        throw new AuthError("Invalid credentials");
      }

      if (user.status === 'Suspended') {
        console.warn(`[AuthService] Login failed: Account suspended for "${user.username}"`);
        throw new ForbiddenError("Account suspended");
      }

      if (user.locked_until && new Date(user.locked_until) > new Date()) {
        console.warn(`[AuthService] Login failed: Account locked for "${user.username}"`);
        throw new ForbiddenError("Account locked");
      }

      if (!bcrypt.compareSync(password, user.password)) {
        console.warn(`[AuthService] Login failed: Invalid password for "${user.username}"`);
        await db.prepare("UPDATE users SET failed_attempts = failed_attempts + 1 WHERE id = ?::uuid").run(user.id);
        if (user.failed_attempts + 1 >= 5) {
          await db.prepare("UPDATE users SET locked_until = ?::timestamp WHERE id = ?::uuid").run(new Date(Date.now() + 15 * 60 * 1000).toISOString(), user.id);
          
          // Notify all admins about the locked account
          try {
            const admins = await db.prepare("SELECT id FROM users WHERE role = 'Admin' AND status = 'active'").all() as any[];
            for (const admin of admins) {
              await db.prepare("INSERT INTO notifications (user_id, event_type, description, related_module, link, status) VALUES (?::uuid, ?::text, ?::text, ?::text, ?::text, 'Unread')")
                .run(admin.id, 'Security', `Account "${user.username}" locked after 5 failed login attempts (IP: ${ipAddress || 'Unknown'})`, 'Security', '/users');
            }
          } catch (notifErr) {
            console.error("[AuthService] Failed to send lockout notification:", notifErr);
          }
        }
        throw new AuthError("Invalid credentials");
      }

      await db.prepare("UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login = CURRENT_TIMESTAMP WHERE id = ?::uuid").run(user.id);

      // Log login history
      try {
        await db.prepare("INSERT INTO login_history (user_id, ip_address, user_agent, status) VALUES (?::uuid, ?::text, ?::text, 'Success')")
          .run(user.id, ipAddress || 'Unknown', userAgent || 'Unknown');
      } catch (e) {
        console.error("[AuthService] Failed to log login history", e);
      }

      const token = jwt.sign(
        { id: user.id, username: user.username, role: user.role, session_version: user.session_version },
        JWT_PRIVATE_KEY,
        { algorithm: 'RS256', expiresIn: '15m' }
      );

      const refreshToken = jwt.sign(
        { id: user.id, username: user.username, role: user.role, session_version: user.session_version, rememberMe: !!rememberMe },
        JWT_PRIVATE_KEY,
        { algorithm: 'RS256', expiresIn: rememberMe ? '30d' : '8h' }
      );
      const sessionToken = crypto.randomBytes(64).toString('hex');
      
      const refreshExpiry = rememberMe ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : new Date(Date.now() + 8 * 60 * 60 * 1000); // 30 days or 8 hours
      // Insert into refresh_tokens for compatibility
      await db.prepare("INSERT INTO refresh_tokens (token, user_id, expires_at) VALUES (?::text, ?::uuid, ?::timestamp)").run(refreshToken, user.id, refreshExpiry.toISOString());
      
      // Insert into user_sessions for session management
      try {
        await db.prepare(`
          INSERT INTO user_sessions (user_id, session_token, refresh_token, ip_address, browser, status)
          VALUES (?::uuid, ?::text, ?::text, ?::text, ?::text, 'Active')
        `).run(user.id, sessionToken, refreshToken, ipAddress || 'Unknown', userAgent || 'Unknown');
      } catch (e) {
        console.error("[AuthService] Failed to create user session", e);
      }

      return {
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          name: user.name,
          requires_password_change: user.requires_password_change
        },
        token,
        refreshToken
      };
    })();
  }

  static async logAudit(username: string, action: string, module: string, details: string) {
    const timestamp = new Date().toISOString();
    
    // Hash chaining for tamper-evident audit trail
    let previousHash = '0';
    try {
      const lastRecord = await db.prepare("SELECT hash FROM audit_trail WHERE hash IS NOT NULL ORDER BY timestamp DESC LIMIT 1").get() as any;
      if (lastRecord?.hash) {
        previousHash = lastRecord.hash;
      }
    } catch (e) {
      // If hash column doesn't exist yet, continue without it
    }
    
    const recordData = `${previousHash}|${username}|${action}|${module}|${details}|${timestamp}`;
    const hash = crypto.createHash('sha256').update(recordData).digest('hex');
    
    await db.prepare("INSERT INTO audit_trail (\"user\", action, module, details, hash, previous_hash, timestamp) VALUES (?::text, ?::text, ?::text, ?::text, ?::text, ?::text, ?::timestamp)")
      .run(username, action, module, details, hash, previousHash, timestamp);
  }
}
