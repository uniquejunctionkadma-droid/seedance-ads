import { useEffect, useRef, useState } from "react";

const PRESETS = {
  "Product Ad": "Create a premium cinematic advertisement for a new smartphone. Show the phone rotating slowly on a dark luxury surface with dramatic lighting, close-up camera movement and premium reflections.",
  "Food Ad": "A mouth-watering close-up advertisement of a fresh burger being assembled, steam rising, melting cheese, slow motion, warm appetizing lighting.",
  "Fashion Ad": "A stylish fashion advertisement: a model walking through a sunlit city street wearing a new jacket, smooth tracking shot, editorial look.",
  "Real Estate Ad": "A smooth drone-style walkthrough of a modern luxury home at golden hour, bright interiors, pool, inviting atmosphere.",
  "Mobile App Ad": "A clean advertisement for a mobile app: a hand holding a phone, the app interface animating on screen, bright modern colors.",
  "YouTube Ad": "An energetic 15-second product advertisement with fast cuts, bold visuals and a clear final shot of the product.",
  "Instagram Reel": "A vertical, eye-catching reel-style advertisement with quick movement, vibrant colors and a trendy feel.",
  "Instagram Story": "A vertical story advertisement with a single striking product shot, soft motion and room for text overlay.",
  "Business Promotion": "A professional promotional video for a local business: welcoming storefront, friendly staff, happy customers, warm lighting.",
  "Festival Advertisement": "A festive seasonal advertisement with warm lights, decorations, joyful atmosphere and a gift-themed product reveal.",
};
const HKEY = "seedance-history-v1";
const lines = (s) => s.split("\n").map((x) => x.trim()).filter(Boolean);
const isPub = (u) => /^https:\/\//i.test(u) && !/^https:\/\/(localhost|127\.|10\.|192\.168\.)/i.test(u);
const loadH = () => { try { return JSON.parse(localStorage.getItem(HKEY)) || []; } catch { return []; } };
const INIT = { prompt: "", mode: "text", aspectRatio: "16:9", resolution: "720p", duration: 5, generateAudio: false, returnLastFrame: false, images: "", videos: "", audios: "" };

async function dl(url, name) {
  try {
    const b = await (await fetch(url)).blob();
    const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = name; a.click();
  } catch { window.open(url, "_blank", "noopener"); }
}

export default function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "dark");
  const [opts, setOpts] = useState(null);
  const [backend, setBackend] = useState("checking");
  const [f, setF] = useState(INIT);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState(loadH);
  const timer = useRef(null);

  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem("theme", theme); }, [theme]);
  useEffect(() => {
    fetch("/api/health").then((r) => r.json()).then((d) => setBackend(d.status === "ok" ? "ok" : "down")).catch(() => setBackend("down"));
    fetch("/api/options").then((r) => r.json()).then(setOpts).catch(() => {});
    return () => clearInterval(timer.current);
  }, []);

  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const saveH = (h) => { setHistory(h); try { localStorage.setItem(HKEY, JSON.stringify(h)); } catch {} };

  function validate(s) {
    const im = lines(s.images), vi = lines(s.videos), au = lines(s.audios);
    if (s.prompt.trim().length < 5) return "Enter a prompt (at least 5 characters).";
    const bad = [...im, ...vi, ...au].find((u) => !isPub(u));
    if (bad) return "Reference links must be public https URLs. Local files and localhost links can't be reached by Kie.ai.";
    if (s.mode === "text" && (im.length || vi.length || au.length)) return "Text-to-video can't use reference media. Clear the URL fields or change the mode.";
    if (s.mode === "image_first" && (im.length !== 1 || vi.length || au.length)) return "First-frame mode needs exactly 1 image URL and nothing else.";
    if (s.mode === "image_first_last" && (im.length !== 2 || vi.length || au.length)) return "First + last frame mode needs exactly 2 image URLs (first, then last) and nothing else.";
    if (s.mode === "reference" && !im.length && !vi.length) return "Reference mode needs at least one image or video URL.";
    return "";
  }

  async function generate(s = f) {
    if (busy) return;
    const v = validate(s); if (v) return setError(v);
    setError(""); setBusy(true); setResult(null); setStage("Submitting task...");
    const t0 = Date.now();
    try {
      const body = { prompt: s.prompt, mode: s.mode, aspectRatio: s.aspectRatio, resolution: s.resolution, duration: Number(s.duration), generateAudio: s.generateAudio, returnLastFrame: s.returnLastFrame,
        referenceImageUrls: lines(s.images), referenceVideoUrls: lines(s.videos), referenceAudioUrls: lines(s.audios) };
      const r = await fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Request failed.");
      poll(d.taskId, s, t0);
    } catch (e) { fail(e); }
  }

  function fail(e) {
    clearInterval(timer.current); setBusy(false);
    setError(e instanceof TypeError ? "Network error. The API is not reachable. Check the Netlify function status/logs." : e.message);
  }

  function poll(taskId, s, t0) {
    clearInterval(timer.current);
    timer.current = setInterval(async () => {
      const secs = Math.round((Date.now() - t0) / 1000);
      if (secs > 900) return fail(new Error("Timed out after 15 minutes. Check your task in the Kie.ai dashboard."));
      setStage(`Generating video... (${secs}s elapsed, generation in progress)`);
      try {
        const r = await fetch(`/api/task/${taskId}`); const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || "Status check failed.");
        if (d.state === "failed") throw new Error(d.error);
        if (d.state === "success") {
          clearInterval(timer.current); setBusy(false);
          const entry = { id: taskId, taskId, videoUrl: d.videoUrl, settings: s, createdAt: new Date().toISOString() };
          setResult(entry); saveH([entry, ...history.filter((h) => h.id !== taskId)].slice(0, 30));
        }
      } catch (e) { fail(e); }
    }, 4000);
  }

  const mode = f.mode;
  const Result = ({ e, small }) => (
    <article className="card">
      <video src={e.videoUrl} controls loop playsInline autoPlay={!small} muted={!small ? false : true} className="video" />
      <p className="prompt">{e.settings.prompt}</p>
      <p className="meta">{e.settings.resolution} · {e.settings.aspectRatio} · {e.settings.duration}s · audio {e.settings.generateAudio ? "on" : "off"} · {new Date(e.createdAt).toLocaleString()}</p>
      <div className="row">
        <button className="btn ghost" onClick={() => dl(e.videoUrl, `ad-${e.taskId.slice(-6)}.mp4`)}>Download</button>
        {small ? (<>
          <button className="btn ghost" onClick={() => { setResult(e); window.scrollTo({ top: 0, behavior: "smooth" }); }}>View</button>
          <button className="btn ghost" onClick={() => saveH(history.filter((h) => h.id !== e.id))}>Delete</button>
        </>) : (<>
          <button className="btn ghost" disabled={busy} onClick={() => generate(e.settings)}>Generate Again</button>
          <button className="btn ghost" onClick={() => { setResult(null); setF(INIT); }}>New Advertisement</button>
        </>)}
      </div>
    </article>
  );

  return (
    <div className="app">
      <header>
        <div>
          <h1>AI Advertisement Generator</h1>
          <p>Create professional AI advertisement videos with Seedance 2.5.</p>
          <p className={`status ${backend}`}>{backend === "ok" ? "Backend Connected ✓" : backend === "down" ? "Backend/API not reachable" : "Checking backend..."}</p>
        </div>
        <button className="btn ghost" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>{theme === "dark" ? "Light mode" : "Dark mode"}</button>
      </header>

      <main>
        <section className="card form">
          <div className="chips">{Object.keys(PRESETS).map((p) => <button key={p} className="chip" onClick={() => setF({ ...f, prompt: PRESETS[p] })}>{p}</button>)}</div>
          <label>Advertisement prompt
            <textarea rows={6} value={f.prompt} onChange={set("prompt")} placeholder="Describe the advertisement video you want to create..." />
          </label>
          {opts && <div className="grid">
            <label>Aspect ratio<select value={f.aspectRatio} onChange={set("aspectRatio")}>{opts.aspectRatios.map((x) => <option key={x}>{x}</option>)}</select></label>
            <label>Resolution<select value={f.resolution} onChange={set("resolution")}>{opts.resolutions.map((x) => <option key={x}>{x}</option>)}</select></label>
            <label>Duration (seconds)<select value={f.duration} onChange={set("duration")}>{opts.durations.map((x) => <option key={x}>{x}</option>)}</select></label>
          </div>}
          <label className="check"><input type="checkbox" checked={f.generateAudio} onChange={set("generateAudio")} /> Generate audio</label>
          <label className="check"><input type="checkbox" checked={f.returnLastFrame} onChange={set("returnLastFrame")} /> Return last frame</label>

          <label>Mode
            <select value={mode} onChange={set("mode")}>{(opts?.modes || [{ id: "text", label: "Text-to-video" }]).map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select>
          </label>
          {mode !== "text" && <>
            <p className="meta">Paste public https links, one per line. Kie.ai can't open files on your computer or localhost links. Upload the file to a public host first. These modes can't be combined.</p>
            <label>{mode === "reference" ? "Reference image URLs" : mode === "image_first" ? "First frame image URL" : "First, then last frame image URLs"}
              <textarea rows={3} value={f.images} onChange={set("images")} placeholder="https://..." /></label>
            {mode === "reference" && <>
              <label>Reference video URLs<textarea rows={2} value={f.videos} onChange={set("videos")} placeholder="https://..." /></label>
              <label>Reference audio URLs<textarea rows={2} value={f.audios} onChange={set("audios")} placeholder="https://..." /></label>
            </>}
          </>}

          <button className="btn primary" disabled={busy || backend !== "ok"} onClick={() => generate()}>{busy ? "Generating video..." : "Generate Advertisement"}</button>
          {error && <div className="error" role="alert">{error}</div>}
        </section>

        <section>
          {busy && <div className="card loading"><div className="spinner" /><p>{stage}</p></div>}
          {!busy && result && <Result e={result} />}
          {!busy && !result && <div className="card empty">Your generated video will appear here. Generation can take a few minutes.</div>}
        </section>
      </main>

      <section className="history">
        <h2>History</h2>
        {history.length === 0 ? <p className="meta">No videos yet.</p> : <div className="hist-grid">{history.map((h) => <Result key={h.id} e={h} small />)}</div>}
      </section>
    </div>
  );
}
