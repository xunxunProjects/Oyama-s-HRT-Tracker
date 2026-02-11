# Security Documentation

This document outlines the security measures implemented in this application and provides guidance for secure deployment.

## Security Improvements Implemented

### 1. JWT Secret Validation
- **Issue**: Application previously used a weak fallback secret (`'fallback-secret'`) if `JWT_SECRET` environment variable was not set
- **Fix**: Added `validateJWTSecret()` function that:
  - Ensures `JWT_SECRET` is set
  - Rejects secrets shorter than 32 characters
  - Rejects the hardcoded fallback value
  - Throws an error on startup if requirements are not met
- **Impact**: Prevents deployment with weak JWT secrets

### 2. Timing Attack Protection
- **Issue**: Admin password comparison used simple string equality (`===`), vulnerable to timing attacks
- **Fix**: Implemented `timingSafeEqual()` function for constant-time string comparison
- **Impact**: Prevents attackers from using timing analysis to guess admin credentials

### 3. Rate Limiting
- **Issue**: No rate limiting on authentication endpoints allowed brute-force attacks
- **Fix**: Added rate limiting with:
  - 5 requests per minute per IP for `/api/login` and `/api/register`
  - Returns HTTP 429 (Too Many Requests) when limit exceeded
  - Includes `Retry-After` header
- **Impact**: Significantly reduces brute-force attack effectiveness
- **Note**: This is an in-memory implementation suitable for single-instance deployments

### 4. Input Validation
- **Issue**: No validation of username format or password strength
- **Fix**: Added validation functions:
  - `validateUsername()`: Ensures 3-30 characters, alphanumeric plus underscore and hyphen
  - `validatePassword()`: Enforces 8-128 character length
- **Impact**: Prevents injection attacks and ensures basic password security

### 5. Content-Type Validation
- **Issue**: Endpoints accepting JSON did not validate Content-Type header
- **Fix**: Added Content-Type validation for all JSON endpoints
- **Impact**: Prevents potential CSRF and content-type confusion attacks

### 6. Username Enumeration Protection
- **Issue**: Different error messages for non-existent users vs wrong password
- **Fix**: Returns generic "Invalid credentials" message in both cases
- **Impact**: Prevents attackers from determining valid usernames

### 7. Response Headers
- **Issue**: Missing Content-Type headers in JSON responses
- **Fix**: Added `Content-Type: application/json` to all JSON responses
- **Impact**: Prevents content-type confusion attacks

## Security Configuration Requirements

### Required Environment Variables

1. **JWT_SECRET** (Required)
   - Must be at least 32 characters long
   - Should be cryptographically random
   - Example generation: `openssl rand -base64 48`
   - **NEVER** commit this to version control

2. **ADMIN_USERNAME** (Optional)
   - If set, enables admin access via environment variables
   - Should be unique and not easily guessable

3. **ADMIN_PASSWORD** (Optional)
   - If set alongside ADMIN_USERNAME, enables admin login
   - Should be strong and unique
   - Store securely (e.g., in Cloudflare Workers secrets)

### Deployment Checklist

- [ ] Generate a strong JWT_SECRET (at least 32 characters)
- [ ] Configure JWT_SECRET in your deployment environment
- [ ] If using admin account, set strong ADMIN_USERNAME and ADMIN_PASSWORD
- [ ] Verify CORS configuration matches your deployment needs
- [ ] Enable HTTPS (should be automatic with Cloudflare Workers)
- [ ] Review rate limiting settings for your expected traffic
- [ ] Monitor authentication logs for suspicious activity

## Known Security Considerations

### CORS Configuration
The application currently uses `Access-Control-Allow-Origin: *` which allows requests from any origin. This is appropriate for a public-facing API where authentication is handled via JWT tokens. However, consider restricting this to specific domains in production if your use case allows.

### Rate Limiting
The current rate limiting implementation is in-memory and will be reset when the worker restarts. For production deployments with multiple instances, consider using:
- Cloudflare Workers KV or Durable Objects for distributed rate limiting
- Cloudflare's built-in rate limiting features

### Password Strength
The current password validation enforces a minimum length of 8 characters. Consider implementing additional requirements:
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- At least one special character

### Session Management
JWT tokens are set to expire after:
- Admin tokens: 1 day
- User tokens: 7 days

Consider implementing:
- Refresh tokens for longer sessions
- Token revocation mechanism
- Session logging and monitoring

### SQL Injection
The application uses parameterized queries throughout, which provides good protection against SQL injection. Continue to use prepared statements with `.bind()` for all database operations.

### Dependencies
Regularly update dependencies to patch security vulnerabilities:
```bash
npm audit
npm audit fix
```

## Security Best Practices

1. **Never commit secrets**: Use environment variables for all sensitive data
2. **Use HTTPS**: Always deploy with HTTPS enabled (automatic with Cloudflare Workers)
3. **Monitor logs**: Regularly review authentication and error logs
4. **Update dependencies**: Keep all packages up to date
5. **Test security**: Regularly test authentication and authorization logic
6. **Backup data**: Maintain regular backups of the database
7. **Incident response**: Have a plan for responding to security incidents

## Reporting Security Issues

If you discover a security vulnerability, please report it to the maintainers privately rather than opening a public issue. This allows for coordinated disclosure and patching.

## License

This security documentation is part of the HRT Recorder Web project and is subject to the same MIT License.
