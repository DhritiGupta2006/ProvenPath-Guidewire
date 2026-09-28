/**
 * ProvenPath MCP Server — Next.js App Router Streamable HTTP transport
 *
 * web/app/api/mcp/route.ts
 *
 * Implements the 4 ProvenPath tools as an MCP server using @modelcontextprotocol/sdk.
 * Each tool proxies to POST http://backend:8080/api/v1/tools/{name}.
 * Coordinate with Vaishnavi (she owns web/) before touching layout/components.
 *
 * Test with: npx @modelcontextprotocol/inspector http://localhost:3000/api/mcp
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

// ─── Config ─────────────────────────────────────────────────────────────────

const BACKEND_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ||
  "http://localhost:8080";

// ─── Schema helpers matching shared/tools/*.json ──────────────────────────

const CitationSchema = z.object({
  sourceCode: z.string().describe("Exact source_code from sources.yaml"),
  section: z.string().describe("Section identifier (e.g. '3.4', '70B(6)')"),
  textSnippet: z
    .string()
    .describe("VERBATIM copy of full_text from sources.yaml"),
});

const ClauseSchema = z.object({
  clauseId: z
    .string()
    .optional()
    .describe("Stable ID; auto-assigned if omitted"),
  kind: z.enum(["COVERAGE", "EXCLUSION", "RATING"]),
  patternCode: z.string().regex(/^SMCyber[A-Za-z]+(Cov|Excl)$/),
  name: z.string(),
  category: z.enum([
    "CyberFirstParty",
    "CyberThirdParty",
    "CyberExclusion",
    "CyberRating",
  ]),
  owningEntityType: z.literal("GeneralLiabilityLine"),
  existence: z.enum(["Required", "Suggested", "Electable", "Preset"]),
  limitMaxInr: z.number().int().optional(),
  deductibleInr: z.number().int().optional(),
  waitingHours: z.number().int().min(8).max(72).optional(),
  conditions: z.array(z.string()).optional(),
  factors: z.record(z.number()).optional(),
  excludesPatternCodes: z.array(z.string()).optional(),
  citations: z.array(CitationSchema).min(1),
});

// ─── Backend proxy helper ────────────────────────────────────────────────────

async function callBackend(
  toolName: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const url = `${BACKEND_URL}/api/v1/tools/${toolName}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Backend ${toolName} failed (${res.status}): ${text}`);
  }
  return res.json();
}

// ─── MCP Server factory ───────────────────────────────────────────────────────

function createServer(): McpServer {
  const server = new McpServer({
    name: "provenpath",
    version: "1.0.0",
  });

  // ── propose_product ──────────────────────────────────────────────────────────
  server.tool(
    "propose_product",
    "Propose an SMCyber insurance product structure. Call this first. The LLM only proposes; the deterministic gate decides compliance.",
    {
      executionId: z
        .string()
        .optional()
        .describe("Existing execution ID; omit to create one"),
      prompt: z
        .string()
        .optional()
        .describe("PM prompt, used when executionId is absent"),
      line: z.literal("SMCyber").optional(),
      aggregateLimitInr: z
        .number()
        .int()
        .min(500000)
        .max(50000000)
        .describe("Aggregate limit in INR (₹5L–₹5Cr)"),
      turnoverInr: z
        .number()
        .int()
        .max(2500000000)
        .describe("Annual turnover in INR (max ₹250Cr)"),
      minimumPremiumInr: z
        .number()
        .int()
        .min(10000)
        .describe("Minimum premium in INR (min ₹10,000)"),
      targetEffectiveDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .describe("Effective date YYYY-MM-DD"),
      jurisdiction: z.literal("IN").optional(),
      proseSummary: z
        .string()
        .optional()
        .describe("Plain-language summary; every number must match a clause"),
    },
    async (args) => {
      const result = await callBackend("propose_product", args);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // ── add_coverage ─────────────────────────────────────────────────────────────
  server.tool(
    "add_coverage",
    "Add or update coverage, exclusion, or rating clauses on the current draft. All citations must be VERBATIM from sources.yaml.",
    {
      executionId: z.string().describe("Execution ID from propose_product"),
      clause: ClauseSchema.optional().describe("A single clause"),
      clauses: z
        .array(ClauseSchema)
        .optional()
        .describe("Multiple clauses at once"),
      proseSummary: z
        .string()
        .optional()
        .describe("Updated summary; all numbers must match clause values"),
    },
    async (args) => {
      const result = await callBackend("add_coverage", args);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // ── verify_compliance ────────────────────────────────────────────────────────
  server.tool(
    "verify_compliance",
    "Run the deterministic ProvenPath gate (23 rules, 6 layers). Returns PASSED or BLOCKED with named failing rules. Nothing reaches PolicyCenter unless PASSED.",
    {
      executionId: z
        .string()
        .describe("Execution ID. The draft for this execution is verified."),
    },
    async (args) => {
      const result = await callBackend("verify_compliance", args);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // ── deploy_product ───────────────────────────────────────────────────────────
  server.tool(
    "deploy_product",
    "Trigger deployment of a PASSED, reviewer-approved proposal into Guidewire PolicyCenter. The PC agent on the Guidewire VM verifies the signed manifest before installing.",
    {
      executionId: z
        .string()
        .describe("Execution ID of a PASSED, approved proposal"),
    },
    async (args) => {
      const result = await callBackend("deploy_product", args);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  return server;
}

// ─── Route handlers (Streamable HTTP transport) ───────────────────────────────

// In-memory session store (stateless per-request is also fine for Streamable HTTP)
const transports = new Map<string, StreamableHTTPServerTransport>();

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const sessionId = req.headers.get("mcp-session-id") ?? undefined;

    let transport: StreamableHTTPServerTransport;
    if (sessionId && transports.has(sessionId)) {
      transport = transports.get(sessionId)!;
    } else {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => crypto.randomUUID(),
        onsessioninitialized: (id) => {
          transports.set(id, transport);
        },
      });
      transport.onclose = () => {
        if (transport.sessionId) {
          transports.delete(transport.sessionId);
        }
      };
      const server = createServer();
      await server.connect(transport);
    }

    const body = await req.json().catch(() => null);
    return await transport.handleRequest(req, new NextResponse(), body);
  } catch (err) {
    console.error("[MCP] POST error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const sessionId = req.headers.get("mcp-session-id");
  if (!sessionId || !transports.has(sessionId)) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  const transport = transports.get(sessionId)!;
  return transport.handleRequest(req, new NextResponse(), null);
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const sessionId = req.headers.get("mcp-session-id");
  if (!sessionId || !transports.has(sessionId)) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  const transport = transports.get(sessionId)!;
  await transport.handleRequest(req, new NextResponse(), null);
  transports.delete(sessionId);
  return NextResponse.json({ ok: true });
}
