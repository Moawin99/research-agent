import { appendFileSync } from "node:fs";
import { PipelineEvent } from "../events";

const LOG_FILE = "pipeline.log";

export function fileLogger(event: PipelineEvent): void {
  const timestamp = new Date().toISOString();
  appendFileSync(LOG_FILE, `${timestamp} ${JSON.stringify(event)}\n`);
}
