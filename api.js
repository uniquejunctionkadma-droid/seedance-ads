import express from "express";
import serverless from "serverless-http";
import rateLimit from "express-rate-limit";
import generateRoutes from "../../server/routes/generate.js";

const app = express();

app.disable("x-powered-by");
app.set("trust proxy", 1); // Netlify sits behind a proxy; needed for rate limiting
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use(express.json({ limit: "100kb" }));
app.use(rateLimit({ windowMs: 60_000, max: 200, standardHeaders: true, legacyHeaders: false }));

// Netlify may pass the original path (/api/...) or the function path (/.netlify/functions/api/...).
// Mounting all prefixes makes routing work in both cases, and with `netlify dev`.
const health = (_req, res) => res.json({ status: "ok", platform: "netlify" });
const base = ["/api", "/.netlify/functions/api", ""];
for (const prefix of base) {
  app.get(`${prefix}/health`, health);
  app.use(prefix || "/", generateRoutes);
}

export const handler = serverless(app, { provider: "aws", requestId: false });
