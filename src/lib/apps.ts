import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { kbToMB } from "./format";
import type { RunningApp } from "../types";

const execFileAsync = promisify(execFile);

const APPLESCRIPT = `
tell application "System Events"
  set output to ""
  repeat with p in (every application process whose background only is false)
    try
      set output to output & (name of p) & "|" & (unix id of p) & "|" & (POSIX path of (file of p)) & linefeed
    end try
  end repeat
  return output
end tell
`;

type RawApp = { name: string; pid: number; bundlePath: string };

async function listGuiApps(): Promise<RawApp[]> {
  const { stdout } = await execFileAsync("osascript", ["-e", APPLESCRIPT], { maxBuffer: 1024 * 1024 });
  const apps: RawApp[] = [];
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split("|");
    if (parts.length < 3) continue;
    const [name, pidStr, bundlePath] = parts;
    const pid = Number.parseInt(pidStr, 10);
    if (!Number.isFinite(pid)) continue;
    apps.push({ name, pid, bundlePath });
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
  return raw
    .map((a) => ({ ...a, memoryMB: memory.get(a.pid) ?? 0 }))
    .sort((a, b) => b.memoryMB - a.memoryMB);
}
