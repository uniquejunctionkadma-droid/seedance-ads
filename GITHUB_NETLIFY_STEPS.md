# Deploy to Netlify

1. Upload the CONTENTS of this folder to the root of a GitHub repo (package.json must be at the repo root).
2. Netlify > Add new site > Import from GitHub. Base directory: empty. Build command: `npm run build`. Publish directory: `dist`.
3. BEFORE deploying: Site configuration > Environment variables > add
   - `KIE_API_KEY` = your Kie.ai key
   - `KIE_API_URL` = `https://api.kie.ai`
4. Deploy, then open `https://YOUR-SITE.netlify.app/api/health` and expect `{"status":"ok","platform":"netlify"}`.

Never commit your API key to GitHub. Keep it only in Netlify environment variables (or a local `.env`, which is git-ignored).

Local dev: copy `.env.example` to `.env`, add the key, then run `npm run dev:api` and `npm run dev` in two terminals.
