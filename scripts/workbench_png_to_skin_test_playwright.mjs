#!/usr/bin/env node
import fs from "node:fs/promises";
import fssync from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const DEFAULT_WORKBENCH_URL = process.env.WORKBENCH_URL || "http://127.0.0.1:5071/workbench";

function parseArgs(argv) {
  const out = {
    url: DEFAULT_WORKBENCH_URL,
    pngPath: "",
    xpPath: "",
    attackXpPath: "",
    injectFamily: "",
    injectXpPath: "",
    headed: false,
    timeoutSec: 240,
    moveSec: 4,
    skipMove: false,
    noAutoFind: false,
    overrideMode: "",
    reloadMode: "",
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--url" && argv[i + 1]) out.url = argv[++i];
    else if ((a === "--png" || a === "--png-path") && argv[i + 1]) out.pngPath = argv[++i];
    else if ((a === "--xp" || a === "--xp-path") && argv[i + 1]) out.xpPath = argv[++i];
    else if (a === "--attack-xp" && argv[i + 1]) out.attackXpPath = argv[++i];
    else if (a === "--inject-family" && argv[i + 1]) out.injectFamily = String(argv[++i] || "").trim().toLowerCase();
    else if (a === "--inject-xp" && argv[i + 1]) out.injectXpPath = argv[++i];
    else if (a === "--timeout-sec" && argv[i + 1]) out.timeoutSec = Math.max(30, Number(argv[++i]) || 240);
    else if (a === "--move-sec" && argv[i + 1]) out.moveSec = Math.max(1, Number(argv[++i]) || 4);
    else if (a === "--skip-move") out.skipMove = true;
    else if (a === "--no-auto-find") out.noAutoFind = true;
    else if (a === "--headed") out.headed = true;
    else if (a === "--override-mode" && argv[i + 1]) out.overrideMode = argv[++i];
    else if (a === "--reload-mode" && argv[i + 1]) out.reloadMode = argv[++i];
  }
  return out;
}

function familyOverrideNames(family) {
  const fam = String(family || "").trim().toLowerCase();
  if (!fam) return [];
  if (fam === "attack" || fam === "wolack") {
    const out = [];
    for (let i = 0; i < 16; i++) {
      if (i & 1) out.push(`${fam}-${i.toString(2).padStart(4, "0")}.xp`);
    }
    return out;
  }
  if (["player", "plydie", "wolfie", "bigbee"].includes(fam)) {
    const out = [];
    for (let i = 0; i < 16; i++) {
      out.push(`${fam}-${i.toString(2).padStart(4, "0")}.xp`);
    }
    return out;
  }
  return [];
}

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch (_e) {
    const fallback = process.env.PLAYWRIGHT_IMPORT ||
      path.join(os.homedir(), ".codex/skills/develop-web-game/node_modules/playwright/index.js");
    return await import(pathToFileURL(fallback).href);
  }
}

function findDaimonPngCandidates() {
  const roots = [
    repoRoot,
    process.cwd(),
  ].filter((p) => fssync.existsSync(p));
  if (!roots.length) return [];
  const cmd = ["find", ...roots, "-type", "f", "(", "-iname", "*daimon*.png", "-o", "-iname", "*demon*.png", ")", "-print"];
  const r = spawnSync(cmd[0], cmd.slice(1), { encoding: "utf-8" });
  if (r.status !== 0 && !r.stdout) return [];
  return String(r.stdout || "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 50);
}

function pickPngPath(args) {
  if (args.pngPath) return path.resolve(args.pngPath);
  if (args.noAutoFind) return "";
  const cands = findDaimonPngCandidates();
  return cands[0] || "";
}

async function fileExists(p) {
  try {
    const st = await fs.stat(p);
    return st.isFile();
  } catch {
    return false;
  }
}

function parseFlatMapTraceLine(text) {
  const s = String(text || "");
  const m = s.match(/\[TRACE\]\s+frame=(\d+)\s+t=(\d+)\s+pos=([^\s]+)\s+grounded=([^\s]+)\s+water=([^\s]+)\s+menu=([^\s]+)\s+world_ready=([^\s]+)\s+stage=([^\s]+)/);
  if (!m) return null;
  const rec = {
    frame: Number(m[1]),
    t_ms: Number(m[2]),
    grounded: m[4],
    water: m[5],
    menu: m[6],
    world_ready: m[7],
    stage: m[8],
    pos: null,
  };
  try {
    rec.pos = JSON.parse(m[3]);
  } catch (_e) {
    rec.pos = null;
  }
  return rec;
}

function extractFirstMoveDiagnostic(consoleLogs = []) {
  const flatLogs = Array.isArray(consoleLogs)
    ? consoleLogs.filter((r) => /\[flat-map-bootstrap\]/.test(String(r?.text || "")))
    : [];
  const traceLogs = flatLogs.filter((r) => /\[TRACE\]/.test(String(r?.text || "")));
  const classifyLogs = flatLogs.filter((r) => /\[CLASSIFY\]/.test(String(r?.text || "")));
  const traces = traceLogs
    .map((r) => ({
      t_ms: Number(r?.t_ms || 0),
      raw: String(r?.text || ""),
      parsed: parseFlatMapTraceLine(String(r?.text || "")),
    }));
  let classification = "";
  let classifyRaw = "";
  let classifyAtMs = null;
  if (classifyLogs.length) {
    const last = classifyLogs[classifyLogs.length - 1];
    classifyRaw = String(last?.text || "");
    classifyAtMs = Number(last?.t_ms || 0);
    const m = classifyRaw.match(/\[CLASSIFY\]\s+result=([a-z0-9_]+)/i);
    if (m) classification = String(m[1] || "").toLowerCase();
  }
  const wrEver = /world_ready_ever=(\S+)/.exec(classifyRaw);
  const wrDrops = /world_ready_drops=(\S+)/.exec(classifyRaw);
  const menuNotReady = /menu_cleared_while_not_ready=(\S+)/.exec(classifyRaw);
  const traceDur = /trace_duration_ms=(\S+)/.exec(classifyRaw);
  const vpZero = /viewport_zero=(\S+)/.exec(classifyRaw);
  return {
    classification: classification || "unknown",
    classify_log_count: classifyLogs.length,
    classify_log_raw: classifyRaw,
    classify_at_ms: classifyAtMs,
    world_ready_ever_true: wrEver ? wrEver[1] === "true" : null,
    world_ready_drop_count: wrDrops ? Number(wrDrops[1]) : null,
    menu_cleared_while_not_ready: menuNotReady ? menuNotReady[1] === "true" : null,
    viewport_zero: vpZero ? vpZero[1] === "true" : null,
    trace_duration_ms: traceDur ? Number(traceDur[1]) : null,
    trace_log_count: traces.length,
    first_trace_at_ms: traces.length ? traces[0].t_ms : null,
    last_trace_at_ms: traces.length ? traces[traces.length - 1].t_ms : null,
    traces,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.headed) {
    throw new Error("workbench_png_to_skin_test_playwright.mjs refuses headless execution. Re-run with --headed.");
  }
  const xpPath = args.xpPath ? path.resolve(args.xpPath) : "";
  const injectFamily = args.injectFamily || (args.attackXpPath ? "attack" : "");
  const injectXpPath = args.injectXpPath
    ? path.resolve(args.injectXpPath)
    : (args.attackXpPath ? path.resolve(args.attackXpPath) : "");
  const injectionOverrideNames = familyOverrideNames(injectFamily);
  const useBundleMode = !!xpPath && !!injectXpPath && !!injectFamily;
  const useUploadXpMode = !!xpPath;
  const pngPath = useUploadXpMode ? "" : pickPngPath(args);
  if (useUploadXpMode) {
    if (!(await fileExists(xpPath))) {
      throw new Error(`XP not found: ${xpPath}`);
    }
  } else if (!pngPath || !(await fileExists(pngPath))) {
    const cands = args.noAutoFind ? [] : findDaimonPngCandidates();
    throw new Error(
      `PNG not found. Pass --png /absolute/path/to/daimon_sheet.png\n` +
      `Auto-find candidates:\n${cands.length ? cands.map((c) => `- ${c}`).join("\n") : "(none found)"}`
    );
  }
  if (injectXpPath && !(await fileExists(injectXpPath))) {
    throw new Error(`Injected XP not found: ${injectXpPath}`);
  }
  if (injectXpPath && !injectionOverrideNames.length) {
    throw new Error(`Unsupported inject family: ${injectFamily}`);
  }

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = path.join(process.cwd(), "output", "playwright", `workbench-png-to-skin-${ts}`);
  await fs.mkdir(outDir, { recursive: true });

  const pwMod = await loadPlaywright();
  const chromium = pwMod?.chromium || pwMod?.default?.chromium;
  if (!chromium) throw new Error("Playwright chromium export not found");
  const launchArgs = [];
  if (!args.headed) {
    // Headless WebGL can fail to create a context on this host; force software rendering.
    launchArgs.push("--use-angle=swiftshader", "--use-gl=angle", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist");
  }
  const browser = await chromium.launch({ headless: !args.headed, args: launchArgs });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 980 },
    serviceWorkers: "block",
  });
  const page = await context.newPage();

  const startedAt = Date.now();
  const events = [];
  const consoleLogs = [];
  const pageErrors = [];
  const requestFails = [];
  const perf = {};

  function nowMs() { return Date.now() - startedAt; }
  function logEvent(name, detail = {}) {
    const rec = { t_ms: nowMs(), name, ...detail };
    events.push(rec);
    console.log(`[${String(rec.t_ms).padStart(6, " ")} ms] ${name}${Object.keys(detail).length ? " " + JSON.stringify(detail) : ""}`);
  }

  page.on("console", (msg) => {
    const rec = { t_ms: nowMs(), type: msg.type(), text: msg.text() };
    consoleLogs.push(rec);
    if (/flat-map-bootstrap|workbench/i.test(rec.text)) {
      console.log(`[console ${String(rec.t_ms).padStart(6, " ")}] ${rec.type}: ${rec.text}`);
    }
  });
  page.on("pageerror", (err) => {
    const rec = { t_ms: nowMs(), error: String(err) };
    pageErrors.push(rec);
    console.log(`[pageerror ${String(rec.t_ms).padStart(6, " ")}] ${rec.error}`);
  });
  page.on("requestfailed", (req) => {
    const rec = {
      t_ms: nowMs(),
      url: req.url(),
      method: req.method(),
      failure: req.failure()?.errorText || "unknown",
    };
    requestFails.push(rec);
    console.log(`[requestfailed ${String(rec.t_ms).padStart(6, " ")}] ${rec.method} ${rec.url} :: ${rec.failure}`);
  });

  async function wbSnapshot(label) {
    const data = await page.evaluate((label0) => {
      const q = (id) => document.getElementById(id);
      const base = {
        label: label0,
        wbStatus: String(q("wbStatus")?.textContent || ""),
        webbuildState: String(q("webbuildState")?.textContent || ""),
        quickBtnDisabled: !!q("webbuildQuickTestBtn")?.disabled,
        analyzeDisabled: !!q("wbAnalyze")?.disabled,
        runDisabled: !!q("wbRun")?.disabled,
      };
      if (window.__wb_debug && typeof window.__wb_debug.getWebbuildDebugState === "function") {
        return { ...base, ...window.__wb_debug.getWebbuildDebugState() };
      }
      return base;
    }, label);
    events.push({ t_ms: nowMs(), name: "wb_snapshot", snapshot: data });
    return data;
  }

  async function waitForEnabled(selector, label, timeoutMs = 60000) {
    logEvent("wait_enabled:start", { label, selector, timeoutMs });
    await page.waitForFunction((sel) => {
      const el = document.querySelector(sel);
      return !!el && !el.disabled;
    }, selector, { timeout: timeoutMs });
    logEvent("wait_enabled:done", { label, selector });
  }

  async function waitForWbStatus(regex, label, timeoutMs = 120000) {
    logEvent("wait_status:start", { label, regex: String(regex), timeoutMs });
    await page.waitForFunction((reSrc) => {
      const txt = String(document.getElementById("wbStatus")?.textContent || "");
      return new RegExp(reSrc, "i").test(txt);
    }, regex.source, { timeout: timeoutMs });
    const txt = await page.locator("#wbStatus").textContent();
    logEvent("wait_status:done", { label, wbStatus: String(txt || "").trim() });
  }

  async function captureFrameProbe(frameHandle, label) {
    if (!frameHandle) return { label, error: "frame_not_found", t_ms: nowMs() };
    try {
      const probe = await frameHandle.evaluate((label0) => {
        const safeCall = (fn) => {
          try {
            if (typeof fn === "function") return fn();
            return null;
          } catch (e) {
            return `ERR:${String(e && e.message ? e.message : e)}`;
          }
        };
        const overlay = document.getElementById("login-overlay");
        const statusEl = document.getElementById("status");
        const progressEl = document.getElementById("progress");
        const overlayVisible = (() => {
          if (!overlay) return false;
          const cs = getComputedStyle(overlay);
          return !overlay.hidden && cs.display !== "none" && cs.visibility !== "hidden";
        })();
        const out = {
          label: String(label0 || ""),
          overlayVisible,
          wasmReady: !!window._wasmReady,
          statusText: String(statusEl?.textContent || "").trim(),
          progressHidden: !!progressEl?.hidden,
          progressValue: progressEl ? Number(progressEl.value || 0) : null,
          progressMax: progressEl ? Number(progressEl.max || 0) : null,
          gameMainMenu: safeCall(window.GameMainMenuActive),
          worldReady: safeCall(window.GameWorldReady),
          renderStage: safeCall(window.GetRenderStageCode),
        };
        try {
          const M = window.Module;
          if (M && M.HEAPU8 && M.HEAPU8.buffer && !M.HEAPF32) {
            const b = M.HEAPU8.buffer;
            M.HEAP8 = M.HEAP8 || new Int8Array(b);
            M.HEAPU8 = M.HEAPU8 || new Uint8Array(b);
            M.HEAP16 = M.HEAP16 || new Int16Array(b);
            M.HEAPU16 = M.HEAPU16 || new Uint16Array(b);
            M.HEAP32 = M.HEAP32 || new Int32Array(b);
            M.HEAPU32 = M.HEAPU32 || new Uint32Array(b);
            M.HEAPF32 = M.HEAPF32 || new Float32Array(b);
            M.HEAPF64 = M.HEAPF64 || new Float64Array(b);
          }
        } catch (_e) {}
        try {
          if (window.ak && typeof window.ak.getPos === "function") {
            const p = [0, 0, 0];
            window.ak.getPos(p, 0);
            out.pos = p.map((v) => Number(v));
          } else {
            out.pos = null;
          }
        } catch (e) {
          out.pos_error = String(e && e.message ? e.message : e);
        }
        try {
          if (window.ak && typeof window.ak.isGrounded === "function") out.grounded = !!window.ak.isGrounded();
          else out.grounded = null;
        } catch (e) {
          out.grounded_error = String(e && e.message ? e.message : e);
        }
        try {
          if (window.ak && typeof window.ak.getWater === "function") out.water = Number(window.ak.getWater());
          else out.water = null;
        } catch (e) {
          out.water_error = String(e && e.message ? e.message : e);
        }
        return out;
      }, label);
      return { t_ms: nowMs(), ...probe };
    } catch (e) {
      return { label, error: String(e), t_ms: nowMs() };
    }
  }

  async function pulseMainMenuAdvance(frameHandle, pageHandle, iteration) {
    const res = await frameHandle.evaluate((i) => {
      const out = { iteration: Number(i || 0), keyb: false, dom: false };
      try {
        const canvas = document.getElementById("asciicker_canvas");
        if (canvas && typeof canvas.focus === "function") canvas.focus();
      } catch (_e) {}
      try {
        if (typeof window.Keyb === "function") {
          window.Keyb(0, 3);
          window.Keyb(2, 10);
          window.Keyb(1, 3);
          out.keyb = true;
        }
      } catch (_e) {}
      try {
        const targets = [window, document, document.body, document.getElementById("asciicker_canvas")];
        for (const t of targets) {
          if (!t || typeof t.dispatchEvent !== "function") continue;
          t.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }));
          t.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }));
          out.dom = true;
        }
      } catch (_e) {}
      return out;
    }, iteration);
    // Avoid page-level keyboard presses (can hit chat/input focus in some builds).
    return res;
  }

  function probeShowsWorldStarted(probe) {
    if (!probe || typeof probe !== "object") return false;
    const asBool = (v) => v === true || Number(v) === 1;
    const asNum = (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    const mainMenu = asBool(probe.gameMainMenu);
    const worldReady = asBool(probe.worldReady);
    const renderStage = asNum(probe.renderStage);
    const renderStageReady = renderStage !== null && renderStage >= 70;
    const grounded = probe.grounded === true;
    const p = Array.isArray(probe.pos) ? probe.pos : [];
    const finite = p.filter((v) => Number.isFinite(v));
    const nonZeroPos = finite.some((v) => Math.abs(v) > 1e-3);
    const water = asNum(probe.water);
    const inWater = water !== null && water > 0;
    if (worldReady && !mainMenu) return true;
    if (renderStageReady && (grounded || nonZeroPos || inWater)) return true;
    if (grounded && nonZeroPos) return true;
    return false;
  }

  async function waitForPlayableState(frameHandle, pageHandle, opts = {}) {
    const timeoutMs = Math.max(1000, Number(opts.timeoutMs || 12000));
    const quietMs = Math.max(250, Number(opts.quietMs || 1200));
    const stableMs = Math.max(300, Number(opts.stableMs || 900));
    const polls = [];
    const t0 = nowMs();
    let stableSince = 0;
    while ((nowMs() - t0) < timeoutMs) {
      const probe = await captureFrameProbe(frameHandle, "pre_move_wait");
      polls.push(probe);
      const statusTxt = String(probe?.statusText || "");
      const statusErr = /exception thrown|error/i.test(statusTxt);
      const worldStarted = probeShowsWorldStarted(probe);
      const overlayHidden = !probe?.overlayVisible;
      const mainMenu = probe?.gameMainMenu === true || Number(probe?.gameMainMenu) === 1;
      const lastPageErrMs = pageErrors.length ? Number(pageErrors[pageErrors.length - 1]?.t_ms || 0) : -1;
      const quiet = lastPageErrMs < 0 || (nowMs() - lastPageErrMs) >= quietMs;
      const readyNow = overlayHidden && !mainMenu && worldStarted && !statusErr && quiet;
      if (readyNow) {
        if (!stableSince) stableSince = nowMs();
        if ((nowMs() - stableSince) >= stableMs) {
          return { ready: true, waited_ms: nowMs() - t0, polls };
        }
      } else {
        stableSince = 0;
      }
      await pageHandle.waitForTimeout(300);
    }
    return { ready: false, waited_ms: nowMs() - t0, polls };
  }

  async function advancePastMainMenu(frameHandle, pageHandle) {
    const pulses = [];
    const asBool = (v) => v === true || Number(v) === 1;
    for (let i = 0; i < 24; i++) {
      const probe = await captureFrameProbe(frameHandle, `newgame_probe_${i + 1}`);
      const overlayVisible = !!probe?.overlayVisible;
      if (overlayVisible) {
        await pageHandle.waitForTimeout(300);
        continue;
      }
      const mainMenu = asBool(probe?.gameMainMenu);
      if (!mainMenu) {
        return { attempted: true, pulses, stopped: "main_menu_cleared" };
      }
      const hasMenuSignals = (probe?.gameMainMenu != null) || (probe?.worldReady != null) || (probe?.renderStage != null);
      if (!hasMenuSignals) {
        return { attempted: true, pulses, stopped: "no_menu_signals" };
      }
      if (probeShowsWorldStarted(probe)) {
        return { attempted: true, pulses, stopped: "world_started" };
      }
      // Defer to bootstrap's world-ready gate: only pulse when world is ready
      const worldReady = asBool(probe?.worldReady);
      if (!worldReady) {
        logEvent("iframe:newgame_deferred", { iter: i + 1, worldReady: probe?.worldReady, stage: probe?.renderStage });
        await pageHandle.waitForTimeout(600);
        continue;
      }
      const pulse = await pulseMainMenuAdvance(frameHandle, pageHandle, i + 1);
      pulses.push({ t_ms: nowMs(), probe, pulse });
      logEvent("iframe:newgame_pulse", {
        iter: i + 1,
        keyb: !!pulse.keyb,
        dom: !!pulse.dom,
      });
      await pageHandle.waitForTimeout(600);
    }
    return { attempted: true, pulses, stopped: "pulse_budget" };
  }

  // Append override/reload mode query params to workbench URL if specified.
  let targetUrl = args.url;
  if (args.overrideMode || args.reloadMode || useBundleMode) {
    const u = new URL(targetUrl);
    if (args.overrideMode) u.searchParams.set("overridemode", args.overrideMode);
    if (args.reloadMode) u.searchParams.set("reloadmode", args.reloadMode);
    if (useBundleMode) u.searchParams.set("autoattack", "1");
    targetUrl = u.href;
  }
  logEvent("start", {
    url: targetUrl,
    mode: useBundleMode ? "bundle_xp" : (useUploadXpMode ? "upload_xp" : "pipeline_png"),
    pngPath, xpPath: useUploadXpMode ? xpPath : "",
    attackXpPath: useBundleMode && injectFamily === "attack" ? injectXpPath : "",
    injectFamily: useBundleMode ? injectFamily : "",
    injectXpPath: useBundleMode ? injectXpPath : "",
    overrideMode: args.overrideMode || "mounted",
    reloadMode: args.reloadMode || "src_swap",
  });
  await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(500);
  await wbSnapshot("after_goto");
  if (useUploadXpMode) {
    await page.waitForFunction(() => {
      const s = window.__wb_debug && typeof window.__wb_debug.getWebbuildDebugState === "function"
        ? window.__wb_debug.getWebbuildDebugState()
        : null;
      return !!(s && s.runtimePreflight && s.runtimePreflight.checked === true);
    }, { timeout: 30000 });
    await waitForEnabled("#webbuildUploadTestBtn", "upload_test_button_enabled", 60000);
    perf.upload_test_start_ms = nowMs();
    logEvent("upload_xp:set_file", { xpPath });
    await page.setInputFiles("#webbuildUploadTestInput", xpPath);
    perf.upload_test_done_ms = nowMs();
    await wbSnapshot("after_upload_xp");
  } else {
    perf.upload_start_ms = nowMs();
    logEvent("upload:set_file", { pngPath });
    await page.setInputFiles("#wbFile", pngPath);
    await page.click("#wbUpload");
    await waitForEnabled("#wbAnalyze", "analyze_button_enabled", 60000);
    perf.upload_done_ms = nowMs();
    await wbSnapshot("after_upload");

    perf.analyze_start_ms = nowMs();
    logEvent("analyze:click");
    await page.click("#wbAnalyze");
    await waitForEnabled("#wbRun", "run_button_enabled", 120000);
    await waitForWbStatus(/Analyze ready/, "analyze_ready", 120000);
    perf.analyze_done_ms = nowMs();
    await wbSnapshot("after_analyze");

    perf.convert_start_ms = nowMs();
    logEvent("convert:click");
    await page.click("#wbRun");
    await waitForWbStatus(/Session active:/, "session_active", 240000);
    await waitForEnabled("#webbuildQuickTestBtn", "test_skin_button_enabled", 240000);
    perf.convert_done_ms = nowMs();
    await wbSnapshot("after_convert");

    const quickBtn = page.locator("#webbuildQuickTestBtn");
    await quickBtn.scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);

    perf.skin_test_click_ms = nowMs();
    logEvent("skin_test:click");
    await quickBtn.click();
    await wbSnapshot("after_test_click");
  }

  if (perf.skin_test_click_ms == null) perf.skin_test_click_ms = nowMs();
  const loadTimeline = [];
  const loadStart = Date.now();
  let finalDebug = null;
  let loaded = false;
  while ((Date.now() - loadStart) < args.timeoutSec * 1000) {
    const s = await wbSnapshot("skin_wait_poll");
    loadTimeline.push({ t_ms: nowMs(), s });
    const wbStatus = String(s.wbStatus || "");
    const webbuildState = String(s.webbuildState || "");
    const iframe = s.iframe || {};
    console.log(`[skin_wait ${String(nowMs()).padStart(6, " ")}] wbStatus="${wbStatus}" webbuildState="${webbuildState}" calledRun=${!!iframe.calledRun} hasLoad=${!!iframe.hasLoad} overlay=${iframe.overlayVisible}`);
    finalDebug = s;
    const success = (
      /(Applied XP as web skin|Uploaded test skin applied)/i.test(wbStatus) &&
      /skin applied|webbuild ready/i.test(webbuildState) &&
      !!s.ready &&
      !!iframe.calledRun &&
      (!!iframe.wasmReady || !iframe.overlayVisible)
    );
    const failure = /blocked|failed|error/i.test(wbStatus) || /access error/i.test(webbuildState);
    if (success) { loaded = true; break; }
    if (failure) break;
    await page.waitForTimeout(1000);
  }
  perf.skin_test_done_ms = nowMs();
  perf.skin_test_duration_ms = perf.skin_test_done_ms - perf.skin_test_click_ms;
  logEvent("skin_test:wait_done", {
    loaded,
    duration_ms: perf.skin_test_duration_ms,
    wbStatus: String(finalDebug?.wbStatus || ""),
    webbuildState: String(finalDebug?.webbuildState || ""),
  });

  // ── Bundle mode: inject a family-specific XP into its runtime sprite slots after idle injection ──
  let bundleInjection = null;
  if (useBundleMode && loaded) {
    logEvent("bundle_inject:start", {
      injectFamily,
      injectXpPath,
      overrideCount: injectionOverrideNames.length,
    });
    const injectXpBytes = await fs.readFile(injectXpPath);
    const injectB64 = injectXpBytes.toString("base64");
    const frameHandle = page.frame({ url: /\/termpp-web-flat\/index\.html/ });
    if (frameHandle) {
      bundleInjection = await frameHandle.evaluate(({ b64, names }) => {
        const out = { injected: false, files: 0, error: null };
        try {
          const M = window.Module;
          if (!M) { out.error = "no_module"; return out; }
          // Decode base64 to Uint8Array
          const raw = atob(b64);
          const bytes = new Uint8Array(raw.length);
          for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
          // Write to each requested sprite slot.
          for (const name of names) {
            const path = `/sprites/${name}`;
            try { M.FS_unlink(path); } catch (_e) {}
            try {
              M.FS_createDataFile("/sprites", name, bytes, true, true, true);
            } catch (_e) {
              try {
                const stream = M.FS_open(path, "w");
                M.FS_write(stream, bytes, 0, bytes.length, 0);
                M.FS_close(stream);
              } catch (e2) {
                out.error = `write_failed:${name}:${e2}`;
                return out;
              }
            }
            out.files++;
          }
          // Reload to pick up new sprites
          if (typeof window.Load === "function") window.Load("player");
          if (typeof window.Resize === "function") {
            try { window.Resize(null); } catch (_e) {}
          }
          out.injected = true;
        } catch (e) {
          out.error = String(e);
        }
        return out;
      }, { b64: injectB64, names: injectionOverrideNames });
      logEvent("bundle_inject:done", bundleInjection);
    } else {
      bundleInjection = { injected: false, error: "frame_not_found" };
      logEvent("bundle_inject:frame_not_found");
    }
    // Wait a moment for injected sprites to settle.
    await page.waitForTimeout(1500);
  }

  let moveResult = { attempted: false };
  if (loaded && !args.skipMove) {
    moveResult = { attempted: true, started: false, moved: false, overlayClicked: false, probes: [] };
    const frameHandle = page.frame({ url: /\/termpp-web-flat\/index\.html/ });
    if (frameHandle) {
      moveResult.started = true;
      try {
        moveResult.probes.push(await captureFrameProbe(frameHandle, "move_start"));
        const overlayWaitStart = Date.now();
        let overlayState = null;
        while ((Date.now() - overlayWaitStart) < 30000) {
          overlayState = await frameHandle.evaluate(() => {
            const overlay = document.getElementById("login-overlay");
            const playBtn = document.getElementById("play-btn");
            const canvas = document.getElementById("asciicker_canvas");
            const overlayVisible = (() => {
              if (!overlay) return false;
              const cs = getComputedStyle(overlay);
              return !overlay.hidden && cs.display !== "none" && cs.visibility !== "hidden";
            })();
            return {
              overlayVisible,
              wasmReady: !!window._wasmReady,
              playBtnExists: !!playBtn,
              playBtnDisabled: !!playBtn?.disabled,
              playBtnText: String(playBtn?.textContent || "").trim(),
              canvasHidden: !!canvas?.hidden,
            };
          });
          logEvent("iframe:overlay_state", overlayState);
          const playableOverlay = overlayState.overlayVisible && overlayState.wasmReady && overlayState.playBtnExists && !overlayState.playBtnDisabled;
          const inGame = !overlayState.overlayVisible;
          if (playableOverlay || inGame) break;
          await page.waitForTimeout(500);
        }
        if (overlayState?.overlayVisible) {
          const playBtn = frameHandle.locator("#play-btn");
          if (await playBtn.count()) {
            if (await playBtn.isEnabled().catch(() => false)) {
              await playBtn.click({ timeout: 5000 });
              moveResult.overlayClicked = true;
              logEvent("iframe:play_click");
              await page.waitForTimeout(1500);
              moveResult.probes.push(await captureFrameProbe(frameHandle, "after_play_click"));
            } else {
              moveResult.overlayStillBlocked = true;
              logEvent("iframe:play_still_disabled", { text: overlayState?.playBtnText || "" });
            }
          }
        }
        moveResult.newGameAdvance = await advancePastMainMenu(frameHandle, page);
        moveResult.playableWait = await waitForPlayableState(frameHandle, page, { timeoutMs: 14000, quietMs: 1200, stableMs: 900 });
        const runMoveBurst = async (afterLabel) => {
          const canvas = frameHandle.locator("#asciicker_canvas");
          await canvas.waitFor({ state: "attached", timeout: 20000 });
          await canvas.click({ timeout: 10000 });
          await frameHandle.evaluate(() => {
            const c = document.getElementById("asciicker_canvas");
            if (c && typeof c.focus === "function") c.focus();
          });
          logEvent("iframe:move_start", { moveSec: args.moveSec });
          const pageErrBeforeMove = pageErrors.length;
          const moveStartProbe = moveResult.probes[moveResult.probes.length - 1] || null;
          const burstMs = Math.max(250, Math.floor((args.moveSec * 1000) / 4));
          const seq = [["w"], ["d"], ["s"], ["a"]];
          for (const keys of seq) {
            await holdMoveKeysViaRuntime(frameHandle, keys, burstMs, page);
            await page.waitForTimeout(100);
          }
          const afterMoveProbe = await captureFrameProbe(frameHandle, String(afterLabel || "after_move"));
          moveResult.probes.push(afterMoveProbe);
          const statusTxt = String(afterMoveProbe?.statusText || "");
          const runtimeStatusError = /exception thrown|error/i.test(statusTxt);
          const newPageErrors = pageErrors.slice(pageErrBeforeMove);
          moveResult.pageErrorsDuringMove = newPageErrors;
          const startPos = Array.isArray(moveStartProbe?.pos) ? moveStartProbe.pos : [];
          const endPos = Array.isArray(afterMoveProbe?.pos) ? afterMoveProbe.pos : [];
          const posChanged = (
            startPos.length === endPos.length &&
            startPos.length > 0 &&
            startPos.some((v, idx) => Number.isFinite(v) && Number.isFinite(endPos[idx]) && Math.abs(Number(endPos[idx]) - Number(v)) > 0.01)
          );
          moveResult.moved = !runtimeStatusError && newPageErrors.length === 0 && (probeShowsWorldStarted(afterMoveProbe) || posChanged);
          moveResult.runtimeStatusError = runtimeStatusError;
          logEvent("iframe:move_done");
          return { runtimeStatusError, afterMoveProbe };
        };
        if (!moveResult.playableWait.ready) {
          moveResult.error = "playable_state_timeout";
          logEvent("iframe:playable_state_timeout", { waited_ms: moveResult.playableWait.waited_ms });
          moveResult.probes.push(await captureFrameProbe(frameHandle, "move_skipped_state"));
          const polls = Array.isArray(moveResult.playableWait.polls) ? moveResult.playableWait.polls : [];
          const lastPoll = polls.length ? polls[polls.length - 1] : null;
          const mainMenuCleared = lastPoll && (lastPoll.gameMainMenu === false || Number(lastPoll.gameMainMenu) === 0);
          const noStatusError = lastPoll && !/exception thrown|error/i.test(String(lastPoll.statusText || ""));
          if (mainMenuCleared && noStatusError) {
            moveResult.softFallback = { attempted: true, reason: "menu_cleared_timeout" };
            logEvent("iframe:playable_soft_fallback");
            const fallbackMove = await runMoveBurst("after_move_fallback");
            if (fallbackMove.runtimeStatusError) {
              moveResult.error = "runtime_status_error_after_fallback";
            } else if (moveResult.moved) {
              moveResult.error = "";
            }
          }
        } else {
          await runMoveBurst("after_move");
        }
      } catch (e) {
        moveResult.error = String(e);
        moveResult.probes.push(await captureFrameProbe(frameHandle, "move_error_state"));
        logEvent("iframe:move_error", { error: moveResult.error });
      }
    } else {
      moveResult.error = "flat iframe frame handle not found";
      logEvent("iframe:not_found");
    }
  }

  const finalPageShot = path.join(outDir, "workbench-final.png");
  await page.screenshot({ path: finalPageShot, fullPage: true });
  let finalIframeShot = "";
  try {
    const frameHandle = page.frame({ url: /\/termpp-web-flat\/index\.html/ });
    if (frameHandle) {
      const canvas = frameHandle.locator("#asciicker_canvas");
      if (await canvas.count()) {
        finalIframeShot = path.join(outDir, "flat-arena-canvas.png");
        await canvas.screenshot({ path: finalIframeShot });
      }
    }
  } catch (_e) {}

  const firstMoveDiagnostic = extractFirstMoveDiagnostic(consoleLogs);
  const firstMoveDiagnosticPath = path.join(outDir, "first-move-diagnostic.json");
  await fs.writeFile(firstMoveDiagnosticPath, JSON.stringify(firstMoveDiagnostic, null, 2));

  // ── Run validity gate ──
  // A run is only valid when bootstrap diagnostic data is present and meaningful.
  // Runs missing this data cannot be classified as pass or fail — they are invalid_run.
  const validityChecks = {
    has_trace_logs: (firstMoveDiagnostic.trace_log_count || 0) > 0,
    has_classify_log: (firstMoveDiagnostic.classify_log_count || 0) > 0,
    classification_known: !!firstMoveDiagnostic.classification && firstMoveDiagnostic.classification !== "unknown",
    truth_fields_present: firstMoveDiagnostic.world_ready_ever_true !== null
      && firstMoveDiagnostic.world_ready_drop_count !== null
      && firstMoveDiagnostic.menu_cleared_while_not_ready !== null,
  };
  const runValid = Object.values(validityChecks).every(Boolean);

  // ── Environment gate: zero-viewport headless ──
  // If the WebGL drawing buffer has zero dimensions, the WASM engine cannot advance
  // render_stage past 1-2 and GameWorldReady() is unreliable. This is a headless
  // environment limitation (SwiftShader + iframe), not a gameplay regression.
  const zeroViewport = firstMoveDiagnostic.viewport_zero === true;
  if (zeroViewport) {
    logEvent("env_gate:zero_viewport", { viewport_zero: true, headed: args.headed });
  }

  // ── Safety gate: premature menu clear ──
  // If menu was cleared while world_ready was false at the moment of clearing,
  // the bootstrap safety goal is not met. (Post-clear world_ready drops are tracked
  // separately via world_ready_drop_count.)
  const prematureClear = runValid && !zeroViewport && firstMoveDiagnostic.menu_cleared_while_not_ready === true;
  if (prematureClear) {
    logEvent("safety_gate:premature_clear", { menu_cleared_while_not_ready: true });
  }

  // ── Gate A: skin-applied visual ──
  // Did the skin injection succeed and is the canvas rendering?
  // This can pass even in headless if the WASM loaded and screenshots exist.
  const gateA = {
    skin_injected: loaded,
    screenshots_exist: !!(finalPageShot),
  };
  const gateAPassed = Object.values(gateA).every(Boolean);

  // ── WASM crash detection (wide scan across all signal sources) ──
  const wasmCrashPattern = /memory access out of bounds|RuntimeError|RENDER CRASHED/i;
  const wasmCrash =
    pageErrors.some(e => wasmCrashPattern.test(String(e.error || ""))) ||
    consoleLogs.some(e => wasmCrashPattern.test(String(e.text || ""))) ||
    (moveResult.probes || []).some(p =>
      /exception thrown/i.test(String(p.statusText || "")) ||
      !!p.pos_error ||
      [p.gameMainMenu, p.worldReady, p.renderStage].some(v => typeof v === "string" && /^ERR:/.test(v)));

  // ── Crash signal counters (always computed, never hidden by invalid_run) ──
  const crashSignalRemainderByZero = consoleLogs.filter(e => /remainder by zero/i.test(String(e.text || ""))).length;
  const crashSignalMemOob = consoleLogs.filter(e => /memory access out of bounds/i.test(String(e.text || ""))).length;
  const crashSignals = {
    remainder_by_zero: crashSignalRemainderByZero,
    mem_oob: crashSignalMemOob,
    any: crashSignalRemainderByZero > 0 || crashSignalMemOob > 0,
  };

  // ── Position validity (scan traces + polls + probes) ──
  const posInvalid = (pos) => !Array.isArray(pos) || pos.length !== 3 || pos.some(v => v === null || !Number.isFinite(Number(v)));
  const posCompletelyUnavailable = (() => {
    // Check if position is null/unavailable throughout the entire trace
    // (WASM runtime may not export position functions to JavaScript)
    let totalFrames = 0;
    let allNullFrames = 0;
    for (const trace of (firstMoveDiagnostic?.traces || [])) {
      if (!trace?.parsed) continue;
      totalFrames++;
      const p = trace.parsed.pos;
      if (!Array.isArray(p) || p.every(v => v === null || v === "null")) {
        allNullFrames++;
      }
    }
    // If 90%+ of frames have null position, position reporting is unavailable
    return totalFrames > 0 && allNullFrames >= (totalFrames * 0.9);
  })();

  const posNaNWhenReady = (() => {
    // Only check position validity if position is actually being reported
    if (posCompletelyUnavailable) return false; // Position unavailable is not a failure

    // Bootstrap diagnostic traces (37 frames, most complete)
    for (const trace of (firstMoveDiagnostic?.traces || [])) {
      const p = trace?.parsed;
      if (!p) continue;
      if ((p.world_ready === "1" || p.world_ready === 1) && posInvalid(p.pos)) return true;
    }
    // PlayableWait polls
    for (const poll of (moveResult?.playableWait?.polls || [])) {
      if ((poll.worldReady === 1 || poll.worldReady === true) && posInvalid(poll.pos)) return true;
    }
    // Move probes
    for (const probe of (moveResult?.probes || [])) {
      if ((probe.worldReady === 1 || probe.worldReady === true) && (!!probe.pos_error || posInvalid(probe.pos))) return true;
    }
    return false;
  })();

  // ── Gate B: gameplay stability (headed-only until viewport issue resolved) ──
  // World_ready stable, movement successful, no premature clear,
  // no WASM crashes, valid position, playable classification.
  const gateB = {
    run_valid: runValid,
    no_zero_viewport: !zeroViewport,
    no_premature_clear: !prematureClear,
    no_move_error: !moveResult.error,
    // Gameplay quality gates
    classification_playable: firstMoveDiagnostic.classification === "playable",
    moved: !!moveResult.moved,
    no_wasm_crash: !wasmCrash,
    pos_valid_when_ready: !posNaNWhenReady,
    no_world_ready_drops: (firstMoveDiagnostic.world_ready_drop_count || 0) === 0,
  };
  const gateBPassed = Object.values(gateB).every(Boolean);

  const invalidRunWithCrashSignals = !runValid && crashSignals.any;
  const runValidity = {
    valid: runValid,
    status: !runValid ? "invalid_run" : (zeroViewport ? "invalid_env_headless_zero_viewport" : (prematureClear ? "safety_fail" : "valid")),
    checks: validityChecks,
    passed: gateAPassed && gateBPassed,
    gateA: { passed: gateAPassed, checks: gateA },
    gateB: { passed: gateBPassed, checks: gateB },
    invalid_run_with_crash_signals: invalidRunWithCrashSignals,
  };
  if (!runValid) {
    logEvent("run_validity:invalid", { checks: validityChecks });
  }
  if (zeroViewport) {
    logEvent("run_validity:invalid_env", { reason: "headless_zero_viewport" });
  }
  if (wasmCrash) {
    logEvent("gate:wasm_crash", {
      page_error_hits: pageErrors.filter(e => wasmCrashPattern.test(String(e.error || ""))).length,
      console_hits: consoleLogs.filter(e => wasmCrashPattern.test(String(e.text || ""))).length,
      probe_hits: (moveResult.probes || []).filter(p =>
        /exception thrown/i.test(String(p.statusText || "")) || !!p.pos_error ||
        [p.gameMainMenu, p.worldReady, p.renderStage].some(v => typeof v === "string" && /^ERR:/.test(v))).length,
    });
  }
  if (posNaNWhenReady) {
    logEvent("gate:pos_nan_when_ready");
  }

  // Determine top-level error hierarchy:
  // invalid_run > invalid_env > wasm_crash > premature_clear > moveResult.error > null
  const topError = !runValid ? "invalid_run"
    : (zeroViewport ? "invalid_env_headless_zero_viewport"
    : (wasmCrash ? "wasm_crash"
    : (prematureClear ? "premature_menu_clear"
    : (moveResult.error || null))));

  const result = {
    url: targetUrl,
    error: topError,
    pngPath,
    xpPath: useUploadXpMode ? xpPath : "",
    attackXpPath: useBundleMode && injectFamily === "attack" ? injectXpPath : "",
    mode: useBundleMode ? "bundle_xp" : (useUploadXpMode ? "upload_xp" : "pipeline_png"),
    bundleInjection: bundleInjection || null,
    injectFamily: useBundleMode ? injectFamily : "",
    injectXpPath: useBundleMode ? injectXpPath : "",
    overrideMode: args.overrideMode || "mounted",
    reloadMode: args.reloadMode || "src_swap",
    headed: args.headed,
    timeoutSec: args.timeoutSec,
    moveSec: args.moveSec,
    perf: {
      upload_ms: (perf.upload_done_ms ?? 0) - (perf.upload_start_ms ?? 0),
      analyze_ms: (perf.analyze_done_ms ?? 0) - (perf.analyze_start_ms ?? 0),
      convert_to_session_ms: (perf.convert_done_ms ?? 0) - (perf.convert_start_ms ?? 0),
      test_skin_wait_ms: perf.skin_test_duration_ms ?? null,
      total_ms: nowMs(),
      ...perf,
    },
    loaded,
    crashSignals,
    runValidity,
    finalDebug,
    moveResult,
    events,
    pageErrors,
    requestFails,
    consoleLogs,
    firstMoveDiagnostic,
    loadTimeline,
    artifacts: {
      outDir,
      finalPageShot,
      finalIframeShot: finalIframeShot || null,
      firstMoveDiagnosticPath,
    },
  };

  const resultPath = path.join(outDir, "result.json");
  await fs.writeFile(resultPath, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({
    resultPath,
    loaded,
    crashSignals,
    runValidity,
    pngPath,
    xpPath: useUploadXpMode ? xpPath : "",
    attackXpPath: useBundleMode && injectFamily === "attack" ? injectXpPath : "",
    mode: useBundleMode ? "bundle_xp" : (useUploadXpMode ? "upload_xp" : "pipeline_png"),
    bundleInjection: bundleInjection || null,
    injectFamily: useBundleMode ? injectFamily : "",
    injectXpPath: useBundleMode ? injectXpPath : "",
    firstMoveDiagnosticPath,
    classification: firstMoveDiagnostic.classification,
    perf: result.perf,
    final: {
      wbStatus: String(finalDebug?.wbStatus || ""),
      webbuildState: String(finalDebug?.webbuildState || ""),
      iframe: finalDebug?.iframe || null,
    },
    moveResult,
    artifacts: result.artifacts,
  }, null, 2));
  console.log(`RESULT_PATH=${resultPath}`);

  await context.close();
  await browser.close();
}

main().catch((err) => {
  console.error(err?.stack || String(err));
  process.exit(1);
});
  async function holdMoveKeysViaRuntime(frameHandle, keys, holdMs, fallbackPage) {
    const downRes = await frameHandle.evaluate((keys0) => {
      const out = { usedKeyb: false, keys: Array.isArray(keys0) ? keys0 : [] };
      try {
        const c = document.getElementById("asciicker_canvas");
        if (c && typeof c.focus === "function") c.focus();
      } catch (_e) {}
      try {
        if (typeof window.Keyb === "function") {
          const map = { w: 50, a: 28, s: 46, d: 31 };
          for (const k of out.keys) {
            const code = map[String(k || "").toLowerCase()];
            if (code) window.Keyb(0, code);
          }
          out.usedKeyb = true;
        }
      } catch (_e) {}
      return out;
    }, keys);
    if (!downRes || !downRes.usedKeyb) {
      for (const k of keys) await fallbackPage.keyboard.down(k);
    }
    await fallbackPage.waitForTimeout(Math.max(30, Number(holdMs || 50)));
    const upRes = await frameHandle.evaluate((keys0) => {
      const out = { usedKeyb: false, keys: Array.isArray(keys0) ? keys0 : [] };
      try {
        if (typeof window.Keyb === "function") {
          const map = { w: 50, a: 28, s: 46, d: 31 };
          for (const k of out.keys) {
            const code = map[String(k || "").toLowerCase()];
            if (code) window.Keyb(1, code);
          }
          out.usedKeyb = true;
        }
      } catch (_e) {}
      return out;
    }, keys);
    if (!upRes || !upRes.usedKeyb) {
      for (const k of keys) await fallbackPage.keyboard.up(k);
    }
  }
