import { sse, type SSEMessage } from "cloudflare-workers-sse";
import type { Env } from "./worker-configuration.js";
import { GoogleCalendarWorker } from './google-calendar-worker.js';
import GoogleAuth from 'cloudflare-workers-and-google-oauth';

/**
 * Helper to get a Google API token using your service account in KV
 */
async function getAccessToken(env: Env): Promise<string> {
    const json = await env.KV_GCP_SERVICE_ACCOUNT.get('gcp_service_account_json');
    if (!json) throw new Error('Service account JSON not found');
    const googleKey = JSON.parse(json);
    const auth = new GoogleAuth(googleKey, ['https://www.googleapis.com/auth/calendar']);
    return await auth.getGoogleAuthToken();
}

/**
 * SSE Handler: MCP protocol for Claude
 * This generator yields tool descriptions and handles MCP requests from Claude via SSE.
 */
async function* sseHandler(
    request: Request,
    env: Env,
    ctx: ExecutionContext
): AsyncGenerator<SSEMessage, void, unknown> {
    // 1. Yield the manifest first (so Claude knows your tools)
    yield {
        event: "manifest",
        data: {
            tools: [
                {
                    name: "list-events",
                    description: "List upcoming Google Calendar events.",
                    parameters: {}
                },
                {
                    name: "create-event",
                    description: "Create a Google Calendar event.",
                    parameters: {
                        summary: "string",
                        start: "string (RFC3339 datetime)",
                        end: "string (RFC3339 datetime)"
                    }
                },
                {
                    name: "delete-event",
                    description: "Delete a Google Calendar event.",
                    parameters: {
                        eventId: "string"
                    }
                }
            ]
        }
    };

    // 2. Wait for tool invocation requests from Claude (MCP)
    // The MCP protocol sends POST requests with JSON bodies to the SSE endpoint
    if (request.method === "POST") {
        try {
            const body = await request.json() as any;
            const { tool, parameters } = body;
            const calendar = new GoogleCalendarWorker('primary', () => getAccessToken(env));

            if (tool === "list-events") {
                const events = await calendar.listEvents();
                yield {
                    event: "tool_response",
                    data: { tool, result: events as any }
                };
            } else if (tool === "create-event") {
                const { summary, start, end } = parameters;
                const event = {
                    summary,
                    start: { dateTime: start },
                    end: { dateTime: end }
                };
                const created = await calendar.createEvent(event);
                yield {
                    event: "tool_response",
                    data: { tool, result: created as any }
                };
            } else if (tool === "delete-event") {
                const { eventId } = parameters;
                await calendar.deleteEvent(eventId);
                yield {
                    event: "tool_response",
                    data: { tool, result: { deleted: true } }
                };
            } else {
                yield {
                    event: "error",
                    data: { message: "Unknown tool" }
                };
            }
        } catch (err) {
            yield {
                event: "error",
                data: { message: (err as Error).message }
            };
        }
    }
}

export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext) {
        const url = new URL(request.url);

        // Only wrap the /sse endpoint with sse(handler)
        if (url.pathname === '/sse') {
            return sse(sseHandler)(request, env, ctx);
        }

        // Optional: REST endpoints for direct HTTP access (for debugging)
        const calendarId = 'primary';
        const calendar = new GoogleCalendarWorker(calendarId, () => getAccessToken(env));

        if (url.pathname === '/events' && request.method === 'GET') {
            const events = await calendar.listEvents();
            return new Response(JSON.stringify(events), { headers: { 'Content-Type': 'application/json' } });
        }
        if (url.pathname === '/events' && request.method === 'POST') {
            const event: object = await request.json();
            const created = await calendar.createEvent(event);
            return new Response(JSON.stringify(created), { headers: { 'Content-Type': 'application/json' } });
        }
        if (url.pathname.startsWith('/events/') && request.method === 'DELETE') {
            const eventId = url.pathname.split('/').pop()!;
            await calendar.deleteEvent(eventId);
            return new Response(JSON.stringify({ deleted: true }), { headers: { 'Content-Type': 'application/json' } });
        }

        return new Response('Not found', { status: 404 });
    }
};
