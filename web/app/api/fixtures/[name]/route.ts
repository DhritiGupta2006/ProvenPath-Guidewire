import { NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

// Serves the repo's real recorded fixtures (read-only, whitelisted), used by the tamper test.
const FIXTURES: Record<string, string[]> = {
  'proposal_demo_fixed.json': [
    path.join(process.cwd(), '..', 'fixtures', 'proposal_demo_fixed.json'),
    path.join(process.cwd(), 'fixtures', 'proposal_demo_fixed.json'),
  ],
  'proposal_demo_blocked.json': [
    path.join(process.cwd(), '..', 'fixtures', 'proposal_demo_blocked.json'),
    path.join(process.cwd(), 'fixtures', 'proposal_demo_blocked.json'),
  ],
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const file = (FIXTURES[name] || []).find(p => fs.existsSync(p));
  if (!file) return Response.json({ error: 'not_found', message: `fixture ${name} not found` }, { status: 404 });
  return new Response(fs.readFileSync(file, 'utf-8'), { headers: { 'Content-Type': 'application/json' } });
}
