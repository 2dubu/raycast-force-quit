import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { kbToMB } from "./format";
import type { RunningApp } from "../types";

const execFileAsync = promisify(execFile);

type RawApp = { name: string; pid: number; bundlePath: string };

async function listGuiApps(): Promise<RawApp[]> {
  const { stdout } = await execFileAsync("/usr/bin/lsappinfo", ["list"], {
    maxBuffer: 5 * 1024 * 1024,
  });
  const apps: RawApp[] = [];
  // Each entry begins with " N) " at the start of a line.
  const entries = stdout.split(/\n(?=\s*\d+\)\s)/);
  for (const entry of entries) {
    const nameMatch = entry.match(/^\s*\d+\)\s+"([^"]+)"/);
    if (!nameMatch) continue;
    // Replicate macOS' Force Quit window: only foreground apps (visible in Dock / Cmd+Tab).
    const typeMatch = entry.match(/type="([^"]+)"/);
    if (!typeMatch || typeMatch[1] !== "Foreground") continue;
    const pidMatch = entry.match(/pid\s*=\s*(\d+)/);
    if (!pidMatch) continue;
    const pid = Number.parseInt(pidMatch[1], 10);
    if (!Number.isFinite(pid)) continue;
    const bundleMatch = entry.match(/bundle path="([^"]+)"/);
    const bundlePath = bundleMatch ? bundleMatch[1] : "";
    apps.push({ name: nameMatch[1], pid, bundlePath });
  }
  return apps;
}

async function batchMemoryByPid(pids: number[]): Promise<Map<number, number>> {
  const result = new Map<number, number>();
  if (pids.length === 0) return result;
  const { stdout } = await execFileAsync("ps", ["-o", "pid=,rss=", "-p", pids.join(",")], {
    maxBuffer: 1024 * 1024,
  });
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [pidStr, rssStr] = trimmed.split(/\s+/);
    const pid = Number.parseInt(pidStr, 10);
    const rssKB = Number.parseInt(rssStr, 10);
    if (!Number.isFinite(pid) || !Number.isFinite(rssKB)) continue;
    result.set(pid, kbToMB(rssKB));
  }
  return result;
}

export async function fetchRunningApps(): Promise<RunningApp[]> {
  const raw = await listGuiApps();
  const memory = await batchMemoryByPid(raw.map((a) => a.pid));
  return raw.map((a) => ({ ...a, memoryMB: memory.get(a.pid) ?? 0 })).sort((a, b) => b.memoryMB - a.memoryMB);
}
