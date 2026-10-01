# Seedance 2.5 AI Advertisement Generator

Netlify-ready React/Vite app with a Netlify Function backend for Kie.ai Seedance 2.5.

## GitHub + Netlify
1. Upload the **contents of this folder** to the root of a GitHub repository. Do not add another `ad-generator` folder around it.
2. In Netlify, import the repository.
3. Leave Base directory empty.
4. Build command: `npm run build`.
5. Publish directory: `dist`.
6. Functions directory: `netlify/functions` (already in netlify.toml).
7. Add `KIE_API_KEY` and `KIE_API_URL=https://api.kie.ai` as Netlify environment variables.
8. Deploy.

## API
- `/api/health`
- `/api/options`
- `/api/generate`
- `/api/task/:taskId`
- `/api/callback`

Kie.ai's documented Seedance 2.5 create endpoint is `/api/v1/jobs/createTask`; task status uses the common `/api/v1/jobs/recordInfo?taskId=...` endpoint.
