import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { kbToMB } from "./format";
import type { RunningProcess } from "../types";

const execFileAsync = promisify(execFile);

export async function fetchAllProcesses(): Promise<RunningProcess[]> {
  const { stdout } = await execFileAsync("ps", ["-axo", "pid=,rss=,comm="], {
    maxBuffer: 5 * 1024 * 1024,
  });
  const processes: RunningProcess[] = [];
  for (const line of stdout.split("\n")) {
    if (!line.trim()) continue;
    // Split into at most 3 tokens: pid, rss, comm-with-spaces
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/);
    if (!match) continue;
    const pid = Number.parseInt(match[1], 10);
    const rssKB = Number.parseInt(match[2], 10);
    const name = match[3].trim();
    if (!Number.isFinite(pid) || !Number.isFinite(rssKB) || rssKB <= 0 || !name) continue;
    processes.push({ pid, name, memoryMB: kbToMB(rssKB) });
  }
  return processes.sort((a, b) => b.memoryMB - a.memoryMB);
}
