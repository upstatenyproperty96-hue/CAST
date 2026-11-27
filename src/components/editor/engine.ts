// The editor's playback and render engine. It plays a project's clips back to back
// from Mux, draws every frame onto a canvas (framing, text, captions), and can record
// that canvas to a video file. Each clip alternates between two video "decks" so the
// next clip is already loaded when the cut arrives.
import Hls from "hls.js";
import {
  ASPECTS, CAPTION_STYLES, TEXT_STYLES, clipStarts, locate, totalLength,
  type Clip, type Cue, type Project, type TextItem,
} from "@/lib/editor/model";

export type SourceInfo = { playbackId: string; duration: number; title: string; src?: string };
type Deck = { video: HTMLVideoElement; hls: Hls | null; gain: GainNode | null; node: MediaElementAudioSourceNode | null };
export type Box = { id: string; x: number; y: number; w: number; h: number };

const EPS = 0.04;

export class Engine {
  private ctx2d: CanvasRenderingContext2D;
  private decks = new Map<string, Deck>();
  private audio: AudioContext | null = null;
  private master: GainNode | null = null;
  private recordDest: MediaStreamAudioDestinationNode | null = null;
  private raf = 0;
  private activeIndex = -1;
  private exporting = false;
  project: Project;
  captions: Cue[] = [];
  time = 0;
  playing = false;
  textBoxes: Box[] = [];
  selectedTextId: string | null = null;
  onTime: (t: number) => void = () => {};
  onPlayingChange: (playing: boolean) => void = () => {};
  onWaiting: (waiting: boolean) => void = () => {};

  constructor(private canvas: HTMLCanvasElement, private sources: Record<string, SourceInfo>, project: Project) {
    this.ctx2d = canvas.getContext("2d")!;
    this.project = project;
    this.resize(720);
  }

  // Preview renders at a lighter resolution; export renders at full size.
  resize(longEdge: number) {
    const a = ASPECTS[this.project.aspect];
    const scale = longEdge / Math.max(a.w, a.h);
    this.canvas.width = Math.round(a.w * scale);
    this.canvas.height = Math.round(a.h * scale);
    this.draw();
  }

  setSources(sources: Record<string, SourceInfo>) { this.sources = sources; }

  setProject(p: Project) {
    const aspectChanged = p.aspect !== this.project.aspect;
    this.project = p;
    if (aspectChanged) this.resize(this.exporting ? 1920 : 720);
    const len = totalLength(p);
    if (this.time > len) this.time = len;
    if (!this.playing) this.seek(this.time);
  }

  private ensureAudio() {
    if (this.audio) return;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.audio = new Ctx();
    this.master = this.audio.createGain();
    this.master.connect(this.audio.destination);
    for (const d of this.decks.values()) this.wireAudio(d);
  }

  private wireAudio(d: Deck) {
    if (!this.audio || !this.master || d.node) return;
    d.node = this.audio.createMediaElementSource(d.video);
    d.gain = this.audio.createGain();
    d.node.connect(d.gain).connect(this.master);
  }

  private deck(clip: Clip, index: number): Deck | null {
    const src = this.sources[clip.source];
    if (!src) return null;
    const key = `${clip.source}#${index % 2}`;
    let d = this.decks.get(key);
    if (!d) {
      const video = document.createElement("video");
      video.crossOrigin = "anonymous";
      video.playsInline = true;
      video.preload = "auto";
      const url = src.src ?? `https://stream.mux.com/${src.playbackId}.m3u8`;
      let hls: Hls | null = null;
      if (!url.endsWith(".m3u8")) {
        video.src = url;
      } else if (Hls.isSupported()) {
        hls = new Hls({ capLevelToPlayerSize: false, maxBufferLength: 20 });
        hls.loadSource(url);
        hls.attachMedia(video);
      } else {
        video.src = url;
      }
      video.addEventListener("seeked", () => { if (!this.playing) this.draw(); });
      video.addEventListener("loadeddata", () => { if (!this.playing) this.draw(); });
      video.addEventListener("waiting", () => this.onWaiting(true));
      video.addEventListener("playing", () => this.onWaiting(false));
      d = { video, hls, gain: null, node: null };
      this.decks.set(key, d);
      this.wireAudio(d);
    }
    return d;
  }

  private setVolume(d: Deck, clip: Clip) {
    if (d.gain) d.gain.gain.value = clip.volume;
    else d.video.volume = Math.min(1, clip.volume);
  }

  seek(t: number) {
    const len = totalLength(this.project);
    this.time = Math.max(0, Math.min(t, len));
    const hit = locate(this.project, this.time);
    if (hit) {
      const d = this.deck(hit.clip, hit.index);
      if (d && Math.abs(d.video.currentTime - hit.sourceTime) > 0.01) d.video.currentTime = hit.sourceTime;
      this.activeIndex = hit.index;
    }
    this.onTime(this.time);
    this.draw();
  }

  async play() {
    if (!this.project.clips.length) return;
    this.ensureAudio();
    await this.audio?.resume();
    if (this.time >= totalLength(this.project) - EPS) this.seek(0);
    this.playing = true;
    this.onPlayingChange(true);
    this.startClip(this.time);
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.tick);
  }

  pause() {
    this.playing = false;
    cancelAnimationFrame(this.raf);
    for (const d of this.decks.values()) d.video.pause();
    this.onPlayingChange(false);
    this.draw();
  }

  toggle() { return this.playing ? this.pause() : this.play(); }

  private startClip(t: number) {
    const hit = locate(this.project, t);
    if (!hit) return;
    for (const [, d] of this.decks) d.video.pause();
    const d = this.deck(hit.clip, hit.index);
    if (!d) return;
    this.activeIndex = hit.index;
    if (Math.abs(d.video.currentTime - hit.sourceTime) > 0.05) d.video.currentTime = hit.sourceTime;
    d.video.playbackRate = hit.clip.speed;
    this.setVolume(d, hit.clip);
    d.video.play().catch(() => this.pause());
    this.prepareNext(hit.index);
  }

  private prepareNext(index: number) {
    const next = this.project.clips[index + 1];
    if (!next) return;
    const d = this.deck(next, index + 1);
    if (d && Math.abs(d.video.currentTime - next.in) > 0.05) d.video.currentTime = next.in;
  }

  private tick = () => {
    if (!this.playing) return;
    const p = this.project;
    const clip = p.clips[this.activeIndex];
    const d = clip && this.deck(clip, this.activeIndex);
    if (!clip || !d) { this.pause(); return; }
    const starts = clipStarts(p);
    const t = starts[this.activeIndex] + (d.video.currentTime - clip.in) / clip.speed;
    if (d.video.currentTime >= clip.out - EPS || d.video.ended) {
      if (this.activeIndex + 1 < p.clips.length) {
        this.time = starts[this.activeIndex + 1];
        this.startClip(this.time + 0.001);
      } else {
        this.time = totalLength(p);
        this.pause();
        this.onTime(this.time);
        this.onEnded?.();
        return;
      }
    } else {
      this.time = Math.max(starts[this.activeIndex], t);
    }
    this.onTime(this.time);
    this.draw();
    this.raf = requestAnimationFrame(this.tick);
  };

  onEnded: (() => void) | null = null;

  // ---- drawing -------------------------------------------------------------

  draw() {
    const { ctx2d: g, canvas } = this;
    const W = canvas.width, H = canvas.height;
    g.save();
    g.fillStyle = "#000";
    g.fillRect(0, 0, W, H);
    const hit = locate(this.project, this.time);
    if (hit) {
      const d = this.decks.get(`${hit.clip.source}#${hit.index % 2}`);
      const v = d?.video;
      if (v && v.readyState >= 2 && v.videoWidth) this.drawFrame(v, hit.clip, W, H);
    }
    this.drawTexts(W, H);
    if (this.project.captions.enabled) this.drawCaptions(W, H);
    g.restore();
  }

  private drawFrame(v: HTMLVideoElement, clip: Clip, W: number, H: number) {
    const g = this.ctx2d;
    const vw = v.videoWidth, vh = v.videoHeight;
    const cover = Math.max(W / vw, H / vh);
    const contain = Math.min(W / vw, H / vh);
    if (clip.fit === "fit" && this.project.background === "blur") {
      g.save();
      g.filter = `blur(${Math.round(Math.max(W, H) / 30)}px) brightness(0.55)`;
      const s = cover * 1.1;
      g.drawImage(v, (W - vw * s) / 2, (H - vh * s) / 2, vw * s, vh * s);
      g.restore();
    }
    const s = (clip.fit === "fit" ? contain : cover) * clip.zoom;
    const dw = vw * s, dh = vh * s;
    const slackX = Math.max(0, (dw - W) / 2), slackY = Math.max(0, (dh - H) / 2);
    const x = (W - dw) / 2 + clip.panX * slackX;
    const y = (H - dh) / 2 + clip.panY * slackY;
    g.drawImage(v, x, y, dw, dh);
  }

  private fontPx(size: number, W: number, H: number) { return size * Math.min(W, H) * 1.4; }

  private drawTexts(W: number, H: number) {
    const g = this.ctx2d;
    this.textBoxes = [];
    for (const item of this.project.texts) {
      if (this.time < item.start || this.time > item.end) continue;
      const style = TEXT_STYLES[item.style];
      const px = this.fontPx(style.size, W, H);
      const { alpha, scale, dy } = animate(item, this.time, H);
      g.save();
      g.globalAlpha = alpha;
      g.font = `${style.weight} ${px}px ${fontFamily()}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      const lines = wrap(g, item.text || " ", W * 0.86);
      const lh = px * 1.15;
      const w = Math.max(...lines.map((l) => g.measureText(l).width));
      const h = lh * lines.length;
      const cx = item.x * W, cy = item.y * H + dy;
      g.translate(cx, cy);
      g.scale(scale, scale);
      if (style.box) {
        g.fillStyle = style.box;
        roundRect(g, -w / 2 - px * 0.35, -h / 2 - px * 0.2, w + px * 0.7, h + px * 0.4, px * 0.25);
        g.fill();
      } else {
        g.shadowColor = "rgba(0,0,0,0.6)";
        g.shadowBlur = px * 0.25;
      }
      g.fillStyle = item.color ?? style.color;
      lines.forEach((l, i) => g.fillText(l, 0, -h / 2 + lh * (i + 0.5)));
      g.restore();
      const box = { id: item.id, x: cx - w / 2 - px * 0.35, y: cy - h / 2 - px * 0.2, w: w + px * 0.7, h: h + px * 0.4 };
      this.textBoxes.push(box);
      if (item.id === this.selectedTextId && !this.exporting) {
        g.save();
        g.strokeStyle = "#34f5c5";
        g.lineWidth = Math.max(2, W / 360);
        g.setLineDash([8, 6]);
        g.strokeRect(box.x, box.y, box.w, box.h);
        g.restore();
      }
    }
  }

  private drawCaptions(W: number, H: number) {
    const cue = this.captions.find((c) => this.time >= c.start && this.time < c.end);
    if (!cue) return;
    const g = this.ctx2d;
    const st = CAPTION_STYLES[this.project.captions.style];
    const px = this.fontPx(0.05, W, H);
    const words = (st.upper ? cue.text.toUpperCase() : cue.text).split(/\s+/).filter(Boolean);
    // Speech within a cue is spread evenly across its words to estimate the word being said.
    const spoken = Math.min(words.length - 1, Math.floor(((this.time - cue.start) / Math.max(0.01, cue.end - cue.start)) * words.length));
    g.save();
    g.font = `${st.font} ${px}px ${fontFamily()}`;
    g.textBaseline = "middle";
    const maxW = W * 0.84;
    const rows: { words: string[]; first: number }[] = [];
    let row: string[] = [], first = 0;
    words.forEach((w, i) => {
      const test = [...row, w].join(" ");
      if (row.length && g.measureText(test).width > maxW) { rows.push({ words: row, first }); row = [w]; first = i; }
      else row.push(w);
    });
    if (row.length) rows.push({ words: row, first });
    const shown = rows.slice(-2);
    const lh = px * 1.2;
    const baseY = this.project.captions.y * H - ((shown.length - 1) * lh) / 2;
    shown.forEach((r, ri) => {
      const text = r.words.join(" ");
      const tw = g.measureText(text).width;
      let x = (W - tw) / 2;
      const y = baseY + ri * lh;
      if (st.box) {
        g.fillStyle = st.box;
        roundRect(g, x - px * 0.3, y - lh / 2, tw + px * 0.6, lh, px * 0.2);
        g.fill();
      }
      r.words.forEach((w, wi) => {
        const idx = r.first + wi;
        const ww = g.measureText(w).width;
        if (st.stroke) { g.lineWidth = px * 0.16; g.strokeStyle = st.stroke; g.lineJoin = "round"; g.strokeText(w, x, y); }
        g.fillStyle = st.highlight && idx === spoken ? st.highlight : st.color;
        g.fillText(w, x, y);
        x += ww + g.measureText(" ").width;
      });
    });
    g.restore();
  }

  textAt(px: number, py: number): string | null {
    for (let i = this.textBoxes.length - 1; i >= 0; i--) {
      const b = this.textBoxes[i];
      if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) return b.id;
    }
    return null;
  }

  // ---- export --------------------------------------------------------------

  static exportType() {
    const types = ["video/mp4;codecs=avc1.640028,mp4a.40.2", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
    return types.find((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) ?? null;
  }

  // Plays the whole edit once in real time while recording the canvas and the mix.
  async record(onProgress: (fraction: number) => void, signal: AbortSignal): Promise<Blob> {
    const type = Engine.exportType();
    if (!type) throw new Error("This browser can't export video. Try Chrome, Edge or Safari on a computer.");
    this.pause();
    this.ensureAudio();
    await this.audio!.resume();
    this.exporting = true;
    this.resize(1920);
    this.recordDest = this.audio!.createMediaStreamDestination();
    this.master!.connect(this.recordDest);
    const stream = this.canvas.captureStream(30);
    for (const track of this.recordDest.stream.getAudioTracks()) stream.addTrack(track);
    const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 10_000_000, audioBitsPerSecond: 192_000 });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const len = totalLength(this.project);
    const cleanup = () => {
      this.exporting = false;
      this.onEnded = null;
      this.master?.disconnect(this.recordDest!);
      this.recordDest = null;
      this.resize(720);
    };
    try {
      this.seek(0);
      await sleep(800);
      const done = new Promise<void>((resolve, reject) => {
        this.onEnded = () => resolve();
        signal.addEventListener("abort", () => { this.pause(); reject(new DOMException("Export cancelled", "AbortError")); });
      });
      const prevOnTime = this.onTime;
      this.onTime = (t) => { prevOnTime(t); onProgress(len ? t / len : 1); };
      rec.start(1000);
      await this.play();
      try { await done; } finally { this.onTime = prevOnTime; }
      await new Promise<void>((resolve) => { rec.onstop = () => resolve(); rec.stop(); });
      return new Blob(chunks, { type: type.split(";")[0] });
    } catch (e) {
      if (rec.state !== "inactive") rec.stop();
      throw e;
    } finally {
      cleanup();
    }
  }

  destroy() {
    this.pause();
    for (const d of this.decks.values()) { d.hls?.destroy(); d.video.removeAttribute("src"); d.video.load(); }
    this.decks.clear();
    this.audio?.close().catch(() => {});
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function animate(item: TextItem, t: number, H: number) {
  const inT = Math.min(1, (t - item.start) / 0.3);
  const outT = Math.min(1, (item.end - t) / 0.25);
  const k = Math.max(0, Math.min(inT, outT));
  switch (item.animation) {
    case "fade": return { alpha: k, scale: 1, dy: 0 };
    case "pop": return { alpha: Math.min(1, k * 1.5), scale: inT < 1 ? 0.6 + 0.4 * easeOutBack(inT) : 1, dy: 0 };
    case "slide": return { alpha: k, scale: 1, dy: (1 - easeOut(inT)) * H * 0.05 };
    default: return { alpha: 1, scale: 1, dy: 0 };
  }
}
const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);
const easeOutBack = (x: number) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };

function fontFamily() {
  if (typeof document === "undefined") return "system-ui, sans-serif";
  return getComputedStyle(document.body).fontFamily || "system-ui, sans-serif";
}

function wrap(g: CanvasRenderingContext2D, text: string, maxW: number) {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const w of para.split(/\s+/)) {
      const test = line ? `${line} ${w}` : w;
      if (line && g.measureText(test).width > maxW) { out.push(line); line = w; } else line = test;
    }
    out.push(line);
  }
  return out;
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}
