import { NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

/**
 * Recorded mode: replays fixtures/events_demo_run.jsonl (a real recorded backend run, nothing synthesized)
 * as SSE, paced by the original timestamps. Honors Last-Event-ID so browser reconnects don't restart the
 * replay, and stays open after the last event instead of closing (which would trigger a reconnect loop).
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const speed = Math.max(0.5, Math.min(20, parseFloat(params.get('speed') || '3') || 3));
  const afterSeq = parseInt(request.headers.get('last-event-id') || params.get('after') || '0', 10) || 0;

  const fixturePath = [path.join(process.cwd(), '..', 'fixtures', 'events_demo_run.jsonl'), path.join(process.cwd(), 'fixtures', 'events_demo_run.jsonl')].find(p =>
    fs.existsSync(p)
  );
  if (!fixturePath) {
    return Response.json({ error: 'not_found', message: 'fixtures/events_demo_run.jsonl not found' }, { status: 404 });
  }
  const events = fs
    .readFileSync(fixturePath, 'utf-8')
    .split('\n')
    .filter(l => l.trim())
    .map(l => JSON.parse(l) as { seq: number; ts: string; type: string });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let previousTs = 0;
      for (const event of events) {
        if (request.signal.aborted) return;
        if (event.seq <= afterSeq) continue;
        const ts = new Date(event.ts).getTime();
        if (previousTs > 0 && ts > previousTs) {
          await new Promise(r => setTimeout(r, Math.min(1200, Math.max(20, (ts - previousTs) / speed))));
        }
        previousTs = ts;
        controller.enqueue(encoder.encode(`id: ${event.seq}\nevent: message\ndata: ${JSON.stringify(event)}\n\n`));
        if (event.type === 'gate.blocked') await new Promise(r => setTimeout(r, 1500)); // let the red node register
      }
      // Keep the connection open (with comment pings) until the browser disconnects.
      const ping = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': ping\n\n'));
        } catch {
          clearInterval(ping);
        }
      }, 15000);
      await new Promise<void>(resolve => request.signal.addEventListener('abort', () => resolve()));
      clearInterval(ping);
      try {
        controller.close();
      } catch {
        // already closed
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' },
  });
}
