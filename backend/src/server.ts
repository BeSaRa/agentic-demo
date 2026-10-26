import cors from 'cors';
import express from 'express';
import { EventType } from '@ag-ui/core';
import { RunAgentInputSchema } from '@ag-ui/core/schemas';
import { EventEncoder } from '@ag-ui/encoder';
import { runMockAgent } from './agent';

const PORT = Number(process.env['PORT'] ?? 8000);

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

/**
 * The single AG-UI endpoint: the client POSTs a RunAgentInput and receives
 * the run as a Server-Sent Events stream of AG-UI events.
 */
app.post('/agent', async (req, res) => {
  const parsed = RunAgentInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid RunAgentInput', issues: parsed.error.issues });
    return;
  }

  const encoder = new EventEncoder();
  res.writeHead(200, {
    'Content-Type': encoder.getContentType(),
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  // The client aborting the run (Stop button) closes the connection.
  const abort = new AbortController();
  res.on('close', () => abort.abort());

  try {
    for await (const event of runMockAgent(parsed.data, abort.signal)) {
      if (abort.signal.aborted) break;
      res.write(encoder.encodeSSE(event));
    }
  } catch (error) {
    if (!abort.signal.aborted) {
      const message = error instanceof Error ? error.message : String(error);
      res.write(encoder.encodeSSE({ type: EventType.RUN_ERROR, message, code: 'INTERNAL' }));
    }
  } finally {
    res.end();
  }
});

app.listen(PORT, () => {
  console.log(`AG-UI backend listening on http://localhost:${PORT}/agent`);
});
