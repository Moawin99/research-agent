import express from "express";
import { register } from "../metrics";
import { Orchestrator } from "../types";
import { PipelineEvent } from "../events";

const DEFAULT_PORT = 3001;

// Local-only: runs in the same process as the CLI (see main() in cli.ts) so it can
// share the orchestrator's single PipelineEventEmitter instance without any
// cross-process messaging.
export function startLocalServer(orchestrator: Orchestrator, port: number = DEFAULT_PORT): void {
  const app = express();

  app.get("/events/stream", (req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    // Node buffers headers until the first body write by default — without this,
    // a client connecting before any pipeline event fires would hang with no
    // response at all instead of an open SSE connection.
    res.flushHeaders();

    const unsubscribe = orchestrator.events.subscribe((event: PipelineEvent) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    });

    req.on("close", () => {
      unsubscribe();
    });
  });

  app.get("/metrics", async (_req, res) => {
    res.set("Content-Type", register.contentType);
    res.end(await register.metrics());
  });

  app.listen(port, () => {
    console.log(`Local server listening on http://localhost:${port} (SSE: /events/stream, metrics: /metrics)`);
  });
}
