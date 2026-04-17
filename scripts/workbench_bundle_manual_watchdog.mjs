#!/usr/bin/env node
import fs from "node:fs/promises";
import fssync from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_WORKBENCH_URL = process.env.WORKBENCH_URL || "http://127.0.0.1:5071/workbench";

function parseArgs(argv) {
  const out = {
    url: DEFAULT_WORKBENCH_URL,
    idlePng: "",
    attackPng: "",
    deathPng: "",
    headed: false,
    timeoutSec: 300,
    moveSec: 10,
    holdOpenSec: 10,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--url" && argv[i + 1]) out.url = argv[++i];
    else if (a === "--idle-png" && argv[i + 1]) out.idlePng = argv[++i];
    else if (a === "--attack-png" && argv[i + 1]) out.attackPng = argv[++i];
    else if (a === "--death-png" && argv[i + 1]) out.deathPng = argv[++i];
    else if (a === "--timeout-sec" && argv[i + 1]) out.timeoutSec = Math.max(60, Number(argv[++i]) || 300);
    else if (a === "--move-sec" && argv[i + 1]) out.moveSec = Math.max(1, Number(argv[++i]) || 10);
    else if (a === "--hold-open-sec" && argv[i + 1]) out.holdOpenSec = Math.max(0, Number(argv[++i]) || 10);
    else if (a === "--headed") out.headed = true;
  }
  return out;
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

async function ensureFile(p, label) {
  if (!p) {
    throw new Error(`${label} missing: pass --${label.toLowerCase().replace(/\s+/g, "-")} /absolute/path/to/file.png`);
  }
  try {
    const st = await fs.stat(p);
    if (!st.isFile()) throw new Error("not a file");
  } catch (e) {
    throw new Error(`${label} missing: ${p} (${e.message})`);
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.headed) {
    throw new Error("workbench_bundle_manual_watchdog.mjs refuses headless execution. Re-run with --headed.");
  }
  const idlePng = args.idlePng ? path.resolve(args.idlePng) : "";
  const attackPng = args.attackPng ? path.resolve(args.attackPng) : "";
  const deathPng = args.deathPng ? path.resolve(args.deathPng) : "";
  const actionSequence = [
    { actionKey: "attack", pngPath: attackPng, doneCount: 1 },
    { actionKey: "death", pngPath: deathPng, doneCount: 2 },
    { actionKey: "idle", pngPath: idlePng, doneCount: 3 },
  ];
  await ensureFile(idlePng, "idle PNG");
  await ensureFile(attackPng, "attack PNG");
  await ensureFile(deathPng, "death PNG");

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = path.join(process.cwd(), "output", "playwright", `workbench-bundle-watchdog-${ts}`);
  await fs.mkdir(outDir, { recursive: true });

  const pwMod = await loadPlaywright();
  const chromium = pwMod?.chromium || pwMod?.default?.chromium;
  if (!chromium) throw new Error("Playwright chromium export not found");

  const browser = await chromium.launch({ headless: !args.headed });
  const context = await browser.newContext({
    viewport: { width: 1500, height: 980 },
    serviceWorkers: "block",
  });
  const page = await context.newPage();

  const startedAt = Date.now();
  const events = [];
  const consoleLogs = [];
  const pageErrors = [];

  function nowMs() {
    return Date.now() - startedAt;
  }

  function logEvent(name, detail = {}) {
    const rec = { t_ms: nowMs(), name, ...detail };
    events.push(rec);
    console.log(`[${String(rec.t_ms).padStart(6, " ")} ms] ${name}${Object.keys(detail).length ? " " + JSON.stringify(detail) : ""}`);
  }

  async function screenshot(name) {
    const out = path.join(outDir, `${name}.png`);
    await page.screenshot({ path: out, fullPage: true });
    return out;
  }

  async function wbSnapshot(label) {
    const snap = await page.evaluate((label0) => {
      const q = (id) => document.getElementById(id);
      const base = {
        label: label0,
        wbStatus: String(q("wbStatus")?.textContent || ""),
        webbuildState: String(q("webbuildState")?.textContent || ""),
        bundleStatus: String(q("bundleStatus")?.textContent || ""),
        templateStatus: String(q("templateStatus")?.textContent || ""),
        uploadPanelLabel: String(q("uploadPanelLabel")?.textContent || ""),
        quickBtnDisabled: !!q("webbuildQuickTestBtn")?.disabled,
        quickBtnText: String(q("webbuildQuickTestBtn")?.textContent || ""),
      };
      if (window.__wb_debug && typeof window.__wb_debug.getWebbuildDebugState === "function") {
        return { ...base, debug: window.__wb_debug.getWebbuildDebugState() };
      }
      return base;
    }, label);
    events.push({ t_ms: nowMs(), name: "wb_snapshot", snapshot: snap });
    return snap;
  }

  async function waitForRuntimePreflight() {
    logEvent("runtime_preflight:wait");
    await page.waitForFunction(() => {
      const s = window.__wb_debug && typeof window.__wb_debug.getWebbuildDebugState === "function"
        ? window.__wb_debug.getWebbuildDebugState()
        : null;
      return !!(s && s.runtimePreflight && s.runtimePreflight.checked === true);
    }, null, { timeout: 60000 });
    const snap = await wbSnapshot("runtime_preflight_done");
    if (!snap?.debug?.runtimePreflight?.ok) {
      throw new Error(`Runtime preflight failed: ${JSON.stringify(snap?.debug?.runtimePreflight || {})}`);
    }
  }

  async function waitForEnabled(selector, label, timeoutMs = 60000) {
    logEvent("wait_enabled:start", { label, selector, timeoutMs });
    await page.waitForFunction((sel) => {
      const el = document.querySelector(sel);
      return !!el && !el.disabled;
    }, selector, { timeout: timeoutMs });
    logEvent("wait_enabled:done", { label, selector });
  }

  async function waitForStatus(regex, label, timeoutMs = 180000) {
    logEvent("wait_status:start", { label, regex: String(regex), timeoutMs });
    await page.waitForFunction((reSrc) => {
      const txt = String(document.getElementById("wbStatus")?.textContent || "");
      return new RegExp(reSrc, "i").test(txt);
    }, regex.source, { timeout: timeoutMs });
    logEvent("wait_status:done", { label });
  }

  async function clickBundleTab(actionKey) {
    const labelMap = {
      idle: /Idle \/ Walk/i,
      attack: /^Attack/i,
      death: /^Death/i,
    };
    const locator = page.locator("#bundleActionTabs button").filter({ hasText: labelMap[actionKey] });
    await locator.first().click();
    await page.waitForFunction(({ key, pattern }) => {
      const uploadLabel = String(document.getElementById("uploadPanelLabel")?.textContent || "");
      const btns = Array.from(document.querySelectorAll("#bundleActionTabs button"));
      const active = btns.find((btn) => btn.classList.contains("primary"));
      const activeText = String(active?.textContent || "");
      return uploadLabel.trim() === `Upload for ${key}` || new RegExp(pattern, "i").test(activeText);
    }, { key: actionKey, pattern: labelMap[actionKey].source }, { timeout: 15000 });
    logEvent("bundle_tab:select", { actionKey });
  }

  async function uploadAnalyzeConvert(actionKey, pngPath, doneCount) {
    await clickBundleTab(actionKey);
    logEvent("bundle_action:start", { actionKey, pngPath });
    await page.setInputFiles("#wbFile", pngPath);
    await screenshot(`${actionKey}-png-selected`);
    await page.click("#wbUpload");
    await waitForEnabled("#wbAnalyze", `${actionKey}_analyze_enabled`, 60000);
    await screenshot(`${actionKey}-uploaded`);
    await page.click("#wbAnalyze");
    await page.waitForFunction(() => {
      const btn = document.getElementById("wbRun");
      const status = String(document.getElementById("wbStatus")?.textContent || "");
      return !!btn && !btn.disabled && /Analyze ready/i.test(status);
    }, null, { timeout: 180000 });
    await screenshot(`${actionKey}-analyzed`);
    await page.click("#wbRun");
    await page.waitForFunction(({ key, expectedDone }) => {
      const status = String(document.getElementById("wbStatus")?.textContent || "");
      const bundle = String(document.getElementById("bundleStatus")?.textContent || "");
      return status.toLowerCase().includes(`${String(key).toLowerCase()} converted`)
        && bundle.includes(`Bundle: ${expectedDone}/3`);
    }, { key: actionKey, expectedDone: doneCount }, { timeout: 240000 });
    await screenshot(`${actionKey}-converted`);
    const snap = await wbSnapshot(`${actionKey}_converted`);
    logEvent("bundle_action:done", {
      actionKey,
      wbStatus: snap.wbStatus,
      bundleStatus: snap.bundleStatus,
    });
  }

  async function getFlatFrame() {
    await page.waitForFunction(() => {
      const frame = document.getElementById("webbuildFrame");
      return !!frame && !frame.classList.contains("hidden") && !!frame.src;
    }, null, { timeout: 60000 });
    for (let i = 0; i < 120; i++) {
      const frame = page.frame({ url: /\/termpp-web-flat\/index\.html/ });
      if (frame) return frame;
      await page.waitForTimeout(500);
    }
    throw new Error("flat iframe frame handle not found");
  }

  async function captureFrameProbe(frameHandle, label) {
    try {
      return await frameHandle.evaluate((label0) => {
        const safeCall = (fn) => {
          try {
            return typeof fn === "function" ? fn() : null;
          } catch (e) {
            return `ERR:${String(e && e.message ? e.message : e)}`;
          }
        };
        const overlay = document.getElementById("login-overlay");
        const playBtn = document.getElementById("play-btn");
        const canvas = document.getElementById("asciicker_canvas");
        const progressEl = document.getElementById("progress");
        const statusEl = document.getElementById("status");
        const overlayVisible = (() => {
          if (!overlay) return false;
          const cs = getComputedStyle(overlay);
          return !overlay.hidden && cs.display !== "none" && cs.visibility !== "hidden";
        })();
        const out = {
          label: String(label0 || ""),
          overlayVisible,
          playBtnEnabled: !!playBtn && !playBtn.disabled,
          canvasPresent: !!canvas,
          wasmReady: !!window._wasmReady,
          statusText: String(statusEl?.textContent || "").trim(),
          progressHidden: !!progressEl?.hidden,
          gameMainMenu: safeCall(window.GameMainMenuActive),
          worldReady: safeCall(window.GameWorldReady),
          renderStage: safeCall(window.GetRenderStageCode),
        };
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
        return out;
      }, label);
    } catch (e) {
      return { label, error: String(e) };
    }
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
    const p = Array.isArray(probe.pos) ? probe.pos : [];
    const nonZeroPos = p.some((v) => Number.isFinite(v) && Math.abs(v) > 1e-3);
    if (worldReady && !mainMenu) return true;
    if (renderStage !== null && renderStage >= 70 && !mainMenu) return true;
    if (!mainMenu && nonZeroPos) return true;
    return false;
  }

  async function pulseMainMenuAdvance(frameHandle, iteration) {
    return await frameHandle.evaluate((i) => {
      const out = { iteration: Number(i || 0), keyb: false, dom: false };
      try {
        if (typeof window.Keyb === "function") {
          window.Keyb(0, 3);
          window.Keyb(2, 10);
          window.Keyb(1, 3);
          out.keyb = true;
        }
      } catch (_e) {}
      try {
        for (const t of [window, document, document.body, document.getElementById("asciicker_canvas")]) {
          if (!t || typeof t.dispatchEvent !== "function") continue;
          t.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }));
          t.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }));
          out.dom = true;
        }
      } catch (_e) {}
      return out;
    }, iteration);
  }

  async function waitForPlayableState(frameHandle, timeoutMs = 20000) {
    const probes = [];
    const start = Date.now();
    while ((Date.now() - start) < timeoutMs) {
      const probe = await captureFrameProbe(frameHandle, "playable_wait");
      probes.push({ t_ms: nowMs(), probe });
      const statusErr = /exception thrown|error/i.test(String(probe.statusText || ""));
      if (!statusErr && !probe.overlayVisible && probeShowsWorldStarted(probe)) {
        return { ready: true, probes };
      }
      await page.waitForTimeout(500);
    }
    return { ready: false, probes };
  }

  async function holdMoveKeysViaRuntime(frameHandle, keys, holdMs) {
    const usedKeyb = await frameHandle.evaluate((keys0) => {
      try {
        if (typeof window.Keyb !== "function") return false;
        const map = { w: 50, a: 28, s: 46, d: 31 };
        for (const key of keys0) {
          const code = map[String(key || "").toLowerCase()];
          if (code) window.Keyb(0, code);
        }
        return true;
      } catch (_e) {
        return false;
      }
    }, keys);
    if (!usedKeyb) {
      for (const key of keys) await page.keyboard.down(key);
    }
    await page.waitForTimeout(holdMs);
    const usedKeybUp = await frameHandle.evaluate((keys0) => {
      try {
        if (typeof window.Keyb !== "function") return false;
        const map = { w: 50, a: 28, s: 46, d: 31 };
        for (const key of keys0) {
          const code = map[String(key || "").toLowerCase()];
          if (code) window.Keyb(1, code);
        }
        return true;
      } catch (_e) {
        return false;
      }
    }, keys);
    if (!usedKeybUp) {
      for (const key of keys) await page.keyboard.up(key);
    }
  }

  page.on("console", (msg) => {
    const rec = { t_ms: nowMs(), type: msg.type(), text: msg.text() };
    consoleLogs.push(rec);
    if (/workbench|flat-map-bootstrap|ATTACK-TRIGGER/i.test(rec.text)) {
      console.log(`[console ${String(rec.t_ms).padStart(6, " ")}] ${rec.type}: ${rec.text}`);
    }
  });
  page.on("pageerror", (err) => {
    const rec = { t_ms: nowMs(), error: String(err) };
    pageErrors.push(rec);
    console.log(`[pageerror ${String(rec.t_ms).padStart(6, " ")}] ${rec.error}`);
  });

  const targetUrl = new URL(args.url);
  targetUrl.searchParams.set("uirecord", "1");

  logEvent("start", {
    url: targetUrl.href,
    idlePng,
    attackPng,
    deathPng,
    moveSec: args.moveSec,
    headed: args.headed,
  });

  await page.goto(targetUrl.href, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(800);
  await waitForRuntimePreflight();
  await screenshot("00-loaded");

  await page.selectOption("#templateSelect", "player_native_full");
  await page.click("#templateApplyBtn");
  await page.waitForFunction(() => {
    const bundleStatus = String(document.getElementById("bundleStatus")?.textContent || "");
    const quickText = String(document.getElementById("webbuildQuickTestBtn")?.textContent || "");
    const status = String(document.getElementById("wbStatus")?.textContent || "");
    return bundleStatus.includes("Bundle: 0/3")
      && /Test Bundle Skin/i.test(quickText)
      && /Bundle created:/i.test(status);
  }, null, { timeout: 60000 });
  await screenshot("01-template-applied");

  // Canonical headed bundle checkpoint order from the saved 2026-03-11 UI recording:
  // Attack -> Death -> Idle / Walk -> Test Bundle Skin.
  for (const step of actionSequence) {
    await uploadAnalyzeConvert(step.actionKey, step.pngPath, step.doneCount);
  }

  await waitForEnabled("#webbuildQuickTestBtn", "test_bundle_skin_enabled", 120000);
  await screenshot("05-before-test-bundle");
  logEvent("test_bundle_skin:click");
  await page.click("#webbuildQuickTestBtn");

  const loadStart = Date.now();
  let finalSnap = null;
  while ((Date.now() - loadStart) < args.timeoutSec * 1000) {
    finalSnap = await wbSnapshot("bundle_skin_wait");
    const applied = /Applied bundle skin/i.test(String(finalSnap.wbStatus || ""))
      && /webbuild ready|bundle skin applied/i.test(String(finalSnap.webbuildState || ""));
    if (applied && finalSnap.debug?.iframe?.hasLoad && (finalSnap.debug?.iframe?.wasmReady || !finalSnap.debug?.iframe?.overlayVisible)) {
      break;
    }
    await page.waitForTimeout(1000);
  }
  await screenshot("06-after-test-bundle-click");

  const frameHandle = await getFlatFrame();
  let overlayProbe = await captureFrameProbe(frameHandle, "initial_frame");
  if (overlayProbe.overlayVisible) {
    const playBtn = frameHandle.locator("#play-btn");
    if (await playBtn.count()) {
      await playBtn.waitFor({ state: "visible", timeout: 15000 });
      if (await playBtn.isEnabled().catch(() => false)) {
        await playBtn.click({ timeout: 5000 });
        logEvent("iframe:play_click");
      }
    }
    await page.waitForTimeout(1500);
  }

  for (let i = 0; i < 24; i++) {
    overlayProbe = await captureFrameProbe(frameHandle, `menu_probe_${i + 1}`);
    const mainMenu = overlayProbe.gameMainMenu === true || Number(overlayProbe.gameMainMenu) === 1;
    const worldReady = overlayProbe.worldReady === true || Number(overlayProbe.worldReady) === 1;
    if (!mainMenu && probeShowsWorldStarted(overlayProbe)) break;
    if (mainMenu && worldReady) {
      await pulseMainMenuAdvance(frameHandle, i + 1);
      logEvent("iframe:new_game_pulse", { iteration: i + 1 });
    }
    await page.waitForTimeout(600);
  }

  const playable = await waitForPlayableState(frameHandle, 20000);
  if (!playable.ready) {
    throw new Error("Bundle watchdog reached iframe but never reached playable state");
  }

  const canvas = frameHandle.locator("#asciicker_canvas");
  await canvas.waitFor({ state: "attached", timeout: 20000 });
  await canvas.click({ timeout: 10000 });
  await frameHandle.evaluate(() => {
    const c = document.getElementById("asciicker_canvas");
    if (c && typeof c.focus === "function") c.focus();
  });

  const moveStart = Date.now();
  const moveProbes = [];
  const sequence = [["w"], ["d"], ["s"], ["a"]];
  let seqIndex = 0;
  while ((Date.now() - moveStart) < args.moveSec * 1000) {
    await holdMoveKeysViaRuntime(frameHandle, sequence[seqIndex % sequence.length], 450);
    await page.waitForTimeout(120);
    moveProbes.push({
      t_ms: nowMs(),
      probe: await captureFrameProbe(frameHandle, `move_${seqIndex + 1}`),
    });
    seqIndex++;
  }

  const finalPageShot = await screenshot("07-final-page");
  let finalCanvasShot = null;
  if (await canvas.count()) {
    finalCanvasShot = path.join(outDir, "08-final-canvas.png");
    await canvas.screenshot({ path: finalCanvasShot });
  }

  const traceSummary = consoleLogs
    .map((rec) => ({ ...rec, parsed: parseFlatMapTraceLine(rec.text) }))
    .filter((rec) => rec.parsed);

  const uiRecorder = await page.evaluate(() => {
    return window.__wb_debug && typeof window.__wb_debug.stopUiRecorder === "function"
      ? window.__wb_debug.stopUiRecorder()
      : null;
  }).catch(() => null);
  let uiRecorderPath = null;
  if (uiRecorder) {
    uiRecorderPath = path.join(outDir, "ui-recorder.json");
    await fs.writeFile(uiRecorderPath, JSON.stringify(uiRecorder, null, 2));
  }

  const result = {
    url: targetUrl.href,
    template: "player_native_full",
    inputs: { idlePng, attackPng, deathPng },
    actionSequence: actionSequence.map((step) => step.actionKey),
    headed: args.headed,
    moveSec: args.moveSec,
    finalSnapshot: finalSnap,
    playable,
    moveProbes,
    traceSummary,
    pageErrors,
    artifacts: {
      outDir,
      finalPageShot,
      finalCanvasShot,
      uiRecorderPath,
    },
    events,
  };

  const resultPath = path.join(outDir, "result.json");
  await fs.writeFile(resultPath, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({
    resultPath,
    outDir,
    template: "player_native_full",
    inputs: { idlePng, attackPng, deathPng },
    actionSequence: actionSequence.map((step) => step.actionKey),
    finalStatus: {
      wbStatus: finalSnap?.wbStatus || "",
      webbuildState: finalSnap?.webbuildState || "",
      bundleStatus: finalSnap?.bundleStatus || "",
      iframe: finalSnap?.debug?.iframe || null,
    },
    playable: playable.ready,
    moveProbeCount: moveProbes.length,
    finalCanvasShot,
  }, null, 2));

  if (args.headed && args.holdOpenSec > 0) {
    logEvent("hold_open:start", { holdOpenSec: args.holdOpenSec });
    await page.waitForTimeout(args.holdOpenSec * 1000);
  }

  await context.close();
  await browser.close();
}

main().catch((err) => {
  console.error(err?.stack || String(err));
  process.exit(1);
});
