// Local development only (npm run dev:api). Netlify uses netlify/functions/api.js instead.
import express from "express";
import generateRoutes from "./routes/generate.js";
const app = express();
app.use(express.json({ limit: "100kb" }));
app.get("/api/health", (_q, r) => r.json({ status: "ok", platform: "local" }));
app.use("/api", generateRoutes);
app.listen(3001, () => console.log("API on http://127.0.0.1:3001"));
