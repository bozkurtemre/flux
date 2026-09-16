// Optional: read a watchdog.config.yaml to group streams under the GitHub project that owns them.
import { parse } from "yaml";
import { readTextFile } from "./mongo";

export interface ProjectMapping {
  name: string;
  github?: string;
  streams: string[]; // stream ids for one environment
}

interface RawConfig {
  projects?: {
    name: string;
    github?: string;
    streams?: Record<string, string[]>;
  }[];
}

export async function loadProjectMapping(path: string, env: string): Promise<ProjectMapping[]> {
  const raw = parse(await readTextFile(path)) as RawConfig;
  return (raw.projects ?? []).map((p) => ({ name: p.name, github: p.github, streams: p.streams?.[env] ?? [] })).filter((p) => p.streams.length > 0);
}
