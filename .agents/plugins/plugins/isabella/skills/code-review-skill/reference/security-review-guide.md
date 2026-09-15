# Security Review Guide

Security-focused code review checklist based on OWASP Top 10, adapted to this monorepo's stack (NestJS backend, Next.js/React frontend).

## Authentication & Authorization

### Authentication
- [ ] Passwords hashed with a strong algorithm (bcrypt, argon2)
- [ ] Password complexity requirements enforced
- [ ] Account lockout after failed attempts
- [ ] Secure password reset flow
- [ ] Session/JWT tokens are cryptographically random
- [ ] Session/token timeout implemented

### Authorization
- [ ] Authorization (Guards) checked on every request, not just authentication
- [ ] Principle of least privilege applied
- [ ] Role/permission-based access control matches this repo's `Role` / `Permission` / `Feature` domain model
- [ ] No privilege escalation paths
- [ ] Direct object reference checks (IDOR prevention) — a user fetching `/wallets/:id` can't read another user's wallet just by changing the id
- [ ] API endpoints protected with the appropriate Guard, not left open by omission

### JWT Security

```typescript
// ❌ Insecure JWT configuration
jwt.sign(payload, 'weak-secret');

// ✅ Secure JWT configuration
jwt.sign(payload, process.env.JWT_SECRET, {
  algorithm: 'RS256',
  expiresIn: '15m',
  issuer: 'one-portal',
  audience: 'one-portal-api',
});

// ❌ Not verifying the JWT properly
const decoded = jwt.decode(token); // no signature verification!

// ✅ Verify signature and claims
const decoded = jwt.verify(token, publicKey, {
  algorithms: ['RS256'],
  issuer: 'one-portal',
  audience: 'one-portal-api',
});
```

## Input Validation

### SQL Injection Prevention

```typescript
// ❌ Vulnerable to SQL injection
const query = `SELECT * FROM users WHERE id = ${userId}`;

// ✅ Parameterized query
await db.query('SELECT * FROM users WHERE id = $1', [userId]);

// ✅ TypeORM/Kysely with proper parameter binding
await userRepository.findOne({ where: { id: userId } });
```

### XSS Prevention

```tsx
// ❌ Vulnerable to XSS
element.innerHTML = userInput;

// ✅ Plain text
element.textContent = userInput;

// ✅ React escapes by default — but watch dangerouslySetInnerHTML
return <div>{userInput}</div>; // Safe
return <div dangerouslySetInnerHTML={{ __html: userInput }} />; // Dangerous!

// ✅ If HTML rendering is genuinely needed, sanitize first
import DOMPurify from 'dompurify';
return <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(userInput) }} />;
```

### Command Injection Prevention

```typescript
// ❌ Vulnerable to command injection
exec(`convert ${filename} output.png`);

// ✅ Use spawn/execFile with argument arrays, not string interpolation
import { execFile } from 'node:child_process';
execFile('convert', [filename, 'output.png']);
```

### Path Traversal Prevention

```typescript
// ❌ Vulnerable to path traversal
const filePath = `./uploads/${req.params.filename}`;

// ✅ Validate and sanitize the path
import path from 'node:path';
const safeName = path.basename(req.params.filename);
const uploadsDir = path.resolve('./uploads');
const filePath = path.resolve(uploadsDir, safeName);

// Verify it's still within uploads directory (both sides absolute)
if (!filePath.startsWith(uploadsDir + path.sep)) {
  throw new Error('Invalid path');
}
```

## DTO Validation (Backend)

Every controller input should be validated at the boundary via a DTO with `class-validator` decorators — never `@Body() body: any`. See [NestJS Guide](nestjs-typescript.md#dto-validation) for this repo's conventions.

## Data Protection

### Sensitive Data Handling
- [ ] No secrets in source code
- [ ] Secrets in environment variables / Secrets Manager (this repo uses AWS Secrets Manager for some providers — see `apps/backend/CLAUDE.md`)
- [ ] Sensitive data encrypted at rest and in transit (HTTPS)
- [ ] PII (client documents, CPF/CNPJ, financial data) handled according to applicable regulations
- [ ] Sensitive data not logged
- [ ] Secure data deletion when required (this repo uses soft-delete + audit for managed clients — verify a hard-delete request doesn't bypass that pattern without reason)

### Configuration Security

```yaml
# ❌ Secrets in config files
database:
  password: "super-secret-password"

# ✅ Reference environment variables (validated via this repo's Zod env schema)
database:
  password: ${DATABASE_PASSWORD}
```

### Error Messages

```typescript
// ❌ Leaking sensitive information
catch (error) {
  return res.status(500).json({
    error: error.stack,   // exposes internal details
    query: sqlQuery,      // exposes database structure
  });
}

// ✅ Generic error messages, log internally
catch (error) {
  logger.error('Database error', { error, userId });
  return res.status(500).json({ error: 'An unexpected error occurred' });
}
```

## API Security

### Rate Limiting
- [ ] Rate limiting on public/auth endpoints
- [ ] Stricter limits on authentication endpoints
- [ ] Per-user and per-IP limits
- [ ] Graceful handling when limits are exceeded

### CORS Configuration

```typescript
// ❌ Overly permissive CORS
app.enableCors({ origin: '*' });

// ✅ Restrictive CORS
app.enableCors({
  origin: [process.env.FRONTEND_URL],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  credentials: true,
});
```

### HTTP Headers

```typescript
// Security headers via helmet
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
    },
  },
  hsts: { maxAge: 31536000, includeSubDomains: true },
  noSniff: true,
  frameguard: { action: 'deny' },
}));
```

## Cryptography

### Secure Practices
- [ ] Well-established algorithms only (AES-256, RSA-2048+)
- [ ] No custom cryptography implementation
- [ ] Cryptographically secure random generation
- [ ] Proper key management/rotation (AWS Secrets Manager / KMS)

### Common Mistakes

```typescript
// ❌ Weak random generation
const token = Math.random().toString(36);

// ✅ Cryptographically secure random
import crypto from 'node:crypto';
const token = crypto.randomBytes(32).toString('hex');

// ❌ MD5/SHA1 for passwords
const hash = crypto.createHash('md5').update(password).digest('hex');

// ✅ bcrypt or argon2
import bcrypt from 'bcrypt';
const hash = await bcrypt.hash(password, 12);
```

## Dependency Security

### Checklist
- [ ] Dependencies from trusted sources only
- [ ] No known vulnerabilities (`npm audit`)
- [ ] Dependencies kept up to date
- [ ] Lock file (`package-lock.json`) committed and matches `package.json` (`overrides` only in the root, per `/CLAUDE.md`)
- [ ] Minimal dependency footprint — was a new dependency actually necessary, or does an existing one already cover it?

### Audit Commands

```bash
npm audit
npm audit fix
```

## Logging & Monitoring

### Secure Logging
- [ ] No sensitive data in logs (passwords, tokens, PII, full client documents)
- [ ] Security events logged (login attempts, permission changes)
- [ ] Log injection prevented (don't interpolate untrusted input directly into log lines without sanitization)

```typescript
// ❌ Logging sensitive data
logger.log(`User login: ${email}, password: ${password}`);

// ✅ Safe logging
logger.log('User login attempt', { email, success: true });
```

## Security Review Severity Levels

| Severity | Description | Action |
|---|---|---|
| **Critical** | Immediate exploitation possible, data breach risk | Block merge, fix immediately |
| **High** | Significant vulnerability, requires specific conditions | Block merge, fix before release |
| **Medium** | Moderate risk, defense-in-depth concern | Should fix, can merge with tracking |
| **Low** | Minor issue, best-practice violation | Nice to fix, non-blocking |
| **Info** | Suggestion for improvement | Optional enhancement |
