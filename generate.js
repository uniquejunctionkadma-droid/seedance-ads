import { Router } from "express";
import rateLimit from "express-rate-limit";
import { createSeedanceTask, getSeedanceTask, OPTIONS, ApiError } from "../services/seedance.js";

const router = Router();
const wrap = (fn) => async (req, res) => {
  try { res.json(await fn(req)); }
  catch (e) {
    if (e instanceof ApiError) return res.status(e.status).json({ success: false, code: e.code, error: e.message });
    console.error("Unexpected:", e.message);
    res.status(500).json({ success: false, code: "SERVER", error: "Unexpected server error." });
  }
};

router.get("/options", (_req, res) => res.json(OPTIONS));
router.post("/generate", rateLimit({ windowMs: 60_000, max: 10, message: { success: false, code: "RATE_LIMIT", error: "Too many requests. Wait a minute." } }),
  wrap(async (req) => ({ success: true, taskId: await createSeedanceTask(req.body) })));
router.get("/task/:taskId", wrap(async (req) => ({ success: true, ...(await getSeedanceTask(req.params.taskId)) })));

// Optional: Kie.ai calls this only if CALLBACK_URL is a PUBLIC https URL. Not usable on localhost.
router.post("/callback", (req, res) => { console.log("Kie.ai callback received for task:", req.body?.data?.taskId); res.sendStatus(200); });

export default router;
