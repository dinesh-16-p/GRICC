# GRICC – Environment Configuration (`ENVIRONMENT.md`)

Never commit `.env` files with real credentials. Copy `.env.example` to `.env` on the production server and restrict permissions (`chmod 600 .env`).

## Generating Strong Secrets

```bash
# Generate a 64-character hex JWT_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Environment Variables Reference

| Variable | Required in Prod | Secret | Purpose | Example (Non-Secret) |
| --- | --- | --- | --- | --- |
| `NODE_ENV` | Yes | No | Enables production config validation, hides stack traces, disables demo user auto-seeding | `production` |
| `PORT` | Yes | No | Express HTTP listen port | `5000` |
| `FRONTEND_URL` | Yes (or `CORS_ORIGIN`) | No | Primary public frontend origin | `https://gricc.example.com` |
| `CORS_ORIGIN` | Yes (or `FRONTEND_URL`) | No | Comma-separated CORS allowlist (must not contain `localhost` in production) | `https://gricc.example.com` |
| `TRUST_PROXY` | Recommended | No | Enables Express `trust proxy` behind Nginx (`X-Forwarded-For` IP resolution) | `true` |
| `DB_PATH` | Yes | No | Persistent SQLite database path (must not be inside `dist/` or `src/`) | `/var/lib/gricc/gricc.db` |
| `BACKUP_DIR` | Recommended | No | Directory for SQLite online backups | `/var/backups/gricc` |
| `BACKUP_RETENTION_COUNT` | No | No | Number of recent backups retained before pruning | `14` |
| `JWT_SECRET` | **Yes** | **Yes** | HMAC-SHA256 JWT signing key (`>= 32` chars; startup fails if missing or placeholder) | `<64-char-random-hex>` |
| `JWT_EXPIRES_IN` | No | No | JWT lifetime (defaults to `security_settings.jwt_lifetime_hours` or `8h`) | `8h` |
| `DATA_CACHE_TTL_SECONDS` | No | No | External telemetry feed cache TTL | `60` |
| `AI_PROVIDER` | No | No | `gricc-deterministic` (default zero-key) \| `gemini` \| `openai` \| `anthropic` | `gricc-deterministic` |
| `AI_API_KEY` | Only if external AI provider | **Yes** | Server-side AI provider API key (never exposed to frontend) | *(leave blank for deterministic)* |
| `AI_MODEL` | No | No | Model identifier for selected AI provider | `grounded-retrieval-v1` |
| `AI_TIMEOUT_MS` | No | No | External AI request timeout (ms) | `12000` |
| `AI_MAX_RETRIES` | No | No | External AI retry count | `2` |
| `NEWS_API_PROVIDER`, `NEWS_API_KEY`, `NEWS_API_ENDPOINT` | No | Key: **Yes** | Optional commercial news feed credentials | *(blank uses public GDELT)* |
| `GEOPOLITICAL_API_PROVIDER`, `GEOPOLITICAL_API_KEY`, `GEOPOLITICAL_API_ENDPOINT` | No | Key: **Yes** | Optional geopolitical feed credentials | *(blank uses public ReliefWeb)* |
| `DISASTER_API_PROVIDER`, `DISASTER_API_KEY`, `DISASTER_API_ENDPOINT` | No | Key: **Yes** | Optional disaster feed credentials | *(blank uses NASA EONET)* |
| `WEATHER_API_PROVIDER`, `WEATHER_API_KEY`, `WEATHER_API_ENDPOINT` | No | Key: **Yes** | Optional weather feed credentials | *(blank uses NWS)* |
| `CYBER_THREAT_API_PROVIDER`, `CYBER_THREAT_API_KEY`, `CYBER_THREAT_API_ENDPOINT` | No | Key: **Yes** | Optional cyber threat feed credentials | *(blank uses CISA KEV)* |

## Frontend Build Variables
GRICC's React frontend calls relative `/api/*` paths (`API_BASE_URL = '/api'` in `src/services/apiService.js`) and uses Nginx reverse proxying in production. **Never** put backend secrets or `VITE_` API keys in frontend builds.

