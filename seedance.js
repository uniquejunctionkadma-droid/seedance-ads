// All Kie.ai / Seedance 2.5 specifics live in this file.
export const MODEL = "bytedance/seedance-2-5";

// VERIFY against your Kie.ai Seedance 2.5 docs page; edit here and the UI follows.
export const OPTIONS = {
  aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9", "adaptive"],
  resolutions: ["480p", "720p", "1080p"],
  durations: [5, 10, 15],
  maxImages: 9, maxVideos: 3, maxAudios: 3,
  modes: [
    { id: "text", label: "Text-to-video" },
    { id: "image_first", label: "Image-to-video (first frame)" },
    { id: "image_first_last", label: "Image-to-video (first + last frame)" },
    { id: "reference", label: "Reference-to-video" },
  ],
};

export class ApiError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

const baseUrl = () => (process.env.KIE_API_URL || "https://api.kie.ai").replace(/\/+$/, "");

function isPublicHttps(u) {
  try {
    const x = new URL(u);
    if (x.protocol !== "https:") return false;
    const h = x.hostname;
    return !(h === "localhost" || h.endsWith(".local") || /^(127|10)\./.test(h) || /^192\.168\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) || h === "::1");
  } catch { return false; }
}
const list = (v, max, name) => {
  const a = Array.isArray(v) ? v.map((s) => String(s).trim()).filter(Boolean) : [];
  if (a.length > max) throw new ApiError(422, "INVALID_PARAMS", `Too many ${name} (max ${max}).`);
  const bad = a.find((u) => !isPublicHttps(u));
  if (bad) throw new ApiError(422, "INVALID_PARAMS", `${name}: "${bad.slice(0, 60)}" is not a public https URL. Kie.ai cannot read local files or localhost links.`);
  return a;
};

// Validates the browser request and builds the exact Kie.ai "input" object (no empty arrays).
export function buildInput(b = {}) {
  const prompt = typeof b.prompt === "string" ? b.prompt.trim() : "";
  if (prompt.length < 5 || prompt.length > 2000) throw new ApiError(422, "INVALID_PARAMS", "Prompt must be 5 to 2000 characters.");
  const mode = b.mode || "text";
  if (!OPTIONS.modes.some((m) => m.id === mode)) throw new ApiError(422, "INVALID_PARAMS", "Unknown mode.");
  if (!OPTIONS.aspectRatios.includes(b.aspectRatio)) throw new ApiError(422, "INVALID_PARAMS", "Unsupported aspect ratio.");
  if (!OPTIONS.resolutions.includes(b.resolution)) throw new ApiError(422, "INVALID_PARAMS", "Unsupported resolution.");
  if (!OPTIONS.durations.includes(Number(b.duration))) throw new ApiError(422, "INVALID_PARAMS", "Unsupported duration.");

  const imgs = list(b.referenceImageUrls, OPTIONS.maxImages, "images");
  const vids = list(b.referenceVideoUrls, OPTIONS.maxVideos, "videos");
  const auds = list(b.referenceAudioUrls, OPTIONS.maxAudios, "audio files");

  const input = {
    prompt,
    resolution: b.resolution,
    aspect_ratio: b.aspectRatio,
    duration: Number(b.duration),
    generate_audio: !!b.generateAudio,
    return_last_frame: !!b.returnLastFrame,
  };

  // The three image/reference scenarios are mutually exclusive.
  if (mode === "text") {
    if (imgs.length || vids.length || auds.length) throw new ApiError(422, "INVALID_PARAMS", "Text-to-video does not use reference media.");
  } else if (mode === "image_first") {
    if (imgs.length !== 1 || vids.length || auds.length) throw new ApiError(422, "INVALID_PARAMS", "First-frame mode needs exactly 1 image and nothing else.");
    input.first_frame_url = imgs[0];                    // VERIFY field name
  } else if (mode === "image_first_last") {
    if (imgs.length !== 2 || vids.length || auds.length) throw new ApiError(422, "INVALID_PARAMS", "First+last frame mode needs exactly 2 images (first, then last) and nothing else.");
    input.first_frame_url = imgs[0];                    // VERIFY field names
    input.last_frame_url = imgs[1];
  } else {
    if (!imgs.length && !vids.length) throw new ApiError(422, "INVALID_PARAMS", "Reference mode needs at least one image or video.");
    if (imgs.length) input.reference_image_urls = imgs;
    if (vids.length) input.reference_video_urls = vids;
    if (auds.length) input.reference_audio_urls = auds;
  }
  return input;
}

async function kie(path, method, body) {
  if (!process.env.KIE_API_KEY || process.env.KIE_API_KEY.startsWith("YOUR_"))
    throw new ApiError(500, "NOT_CONFIGURED", "KIE_API_KEY is missing. Add it in Netlify > Site configuration > Environment variables, then redeploy.");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000) // Netlify functions time out at ~26s;
  let res;
  try {
    res = await fetch(baseUrl() + path, {
      method, signal: ctrl.signal,
      headers: { Authorization: `Bearer ${process.env.KIE_API_KEY}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    if (e.name === "AbortError") throw new ApiError(504, "TIMEOUT", "Kie.ai took too long to respond.");
    throw new ApiError(502, "NETWORK", "Could not reach Kie.ai. Check your internet connection.");
  } finally { clearTimeout(t); }

  const json = await res.json().catch(() => null);
  const code = res.ok && typeof json?.code === "number" ? json.code : res.status; // Kie often reports errors inside HTTP 200
  if (code !== 200) {
    const d = json?.msg ? ` (${String(json.msg).slice(0, 200)})` : "";
    if (code === 401 || code === 403) throw new ApiError(401, "INVALID_KEY", "Invalid Kie.ai API key. Check KIE_API_KEY in your Netlify environment variables.");
    if (code === 402) throw new ApiError(402, "NO_CREDITS", "Insufficient Kie.ai credits. Top up your account balance.");
    if (code === 422 || code === 400) throw new ApiError(422, "INVALID_PARAMS", `Kie.ai rejected the parameters${d}.`);
    if (code === 429) throw new ApiError(429, "RATE_LIMIT", "Kie.ai rate limit reached. Wait a moment and retry.");
    throw new ApiError(502, "KIE_ERROR", `Kie.ai or server error${d}. Try again shortly.`);
  }
  return json;
}

export async function createSeedanceTask(body) {
  const payload = { model: MODEL, input: buildInput(body) };
  if (process.env.CALLBACK_URL) payload.callBackUrl = process.env.CALLBACK_URL;
  const json = await kie("/api/v1/jobs/createTask", "POST", payload);
  const taskId = json?.data?.taskId;
  if (!taskId) throw new ApiError(502, "KIE_ERROR", "Kie.ai did not return a taskId.");
  return taskId;
}

// Status endpoint: GET /api/v1/jobs/recordInfo?taskId=...  (data.state, data.resultJson)
export async function getSeedanceTask(taskId) {
  if (!/^[\w-]{4,100}$/.test(taskId)) throw new ApiError(422, "INVALID_PARAMS", "Invalid task id.");
  const json = await kie(`/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`, "GET");
  const d = json?.data || {};
  const s = String(d.state || "").toLowerCase();
  const state = s === "success" ? "success" : (s === "fail" || s === "failed" || s === "error") ? "failed" : "processing";
  const out = { state, kieState: d.state || null };
  if (state === "success") Object.assign(out, extractVideoUrl(d));
  if (state === "failed") out.error = d.failMsg || "Seedance generation failed. Please check your Kie.ai API key and account balance.";
  return out;
}

// resultJson is a JSON string; field names are not assumed, we look for a video file URL.
export function extractVideoUrl(data = {}) {
  let r = data.resultJson;
  try { if (typeof r === "string") r = JSON.parse(r); } catch { r = null; }
  const strings = [];
  (function walk(v) { if (typeof v === "string") strings.push(v); else if (v && typeof v === "object") Object.values(v).forEach(walk); })(r);
  const urls = strings.filter((s) => /^https?:\/\//.test(s));
  const videoUrl = urls.find((u) => /\.(mp4|mov|webm)(\?|$)/i.test(u)) || urls.find((u) => /(?:video|mp4|mov|webm)/i.test(u)) || null;
  const lastFrameUrl = urls.find((u) => /\.(png|jpe?g|webp)(\?|$)/i.test(u)) || null;
  if (!videoUrl) throw new ApiError(502, "KIE_ERROR", "Task succeeded but no video URL was found in the response.");
  return { videoUrl, lastFrameUrl };
}
