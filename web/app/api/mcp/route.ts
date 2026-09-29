/**
 * ProvenPath MCP Server — Next.js App Router Streamable HTTP transport
 *
 * web/app/api/mcp/route.ts
 *
 * Implements the 4 ProvenPath tools as an MCP server using @modelcontextprotocol/sdk.
 * Each tool proxies to POST {NEXT_PUBLIC_API_URL}/api/v1/tools/{name} on the Gosu backend.
 *
 * Test with: npx @modelcontextprotocol/inspector http://localhost:3000/api/mcp
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
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
  factors: z.record(z.string(), z.number()).optional(),
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

// ─── Route handlers (Streamable HTTP, stateless) ─────────────────────────────
// Next route handlers speak the web Request/Response API, so this uses the SDK's web-standard
// transport. Stateless: every POST gets a fresh server + transport (no session store to leak).

export async function POST(req: Request): Promise<Response> {
  try {
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    const server = createServer();
    await server.connect(transport);
    return await transport.handleRequest(req);
  } catch (err) {
    console.error('[MCP] POST error:', err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

// Stateless mode has no server-initiated stream and no sessions to delete.
const notAllowed = () => Response.json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed' }, id: null }, { status: 405 });
export const GET = notAllowed;
export const DELETE = notAllowed;
