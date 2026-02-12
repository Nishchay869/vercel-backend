# Backend Bug Fixes

## Priority 1 (Critical)

- [x] 1. Fix CORS to use environment variable instead of hardcoded origins
- [x] 2. Add input validation (max length, sanitize content)
- [x] 3. Fix GET /api/comments to return normalized format with `id` field
- [x] 4. Fix logout endpoint to work even with invalid/expired tokens

## Priority 2 (Security)

- [x] 5. Add authentication to Socket.io connections
- [x] 6. Add rate limiting middleware
- [x] 7. Use JWT tokens with proper verification instead of simple string tokens

## Priority 3 (Consistency)

- [x] 8. Match status options between backend enum and frontend
- [x] 9. Add proper error handling for all async operations
- [x] 10. Consistent response formatting across all endpoints

## Implementation Steps

- [x] 1. Install required dependencies (express-rate-limit, jose)
- [x] 2. Fix server.js with all the improvements
- [ ] 3. Test the backend (run `cd backend && npm start`)
