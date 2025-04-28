import { type SSEMessage } from "cloudflare-workers-sse";
import { JWT } from "google-auth-library"; // <-- OFFICIAL LIBRARY USAGE

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Connection": "keep-alive",
    "Cache-Control": "no-cache"
};

// Utility: Get access token using google-auth-library JWT client
async function getAccessToken(serviceAccountJson: any): Promise<string> {
    const client = new JWT({
        email: serviceAccountJson.client_email,
        key: serviceAccountJson.private_key,
        scopes: ["https://www.googleapis.com/auth/calendar"],
    });
    // Authorize and get token
    const tokens = await client.authorize();
    if (!tokens.access_token) throw new Error("Failed to obtain access token.");
    return tokens.access_token;
}

export default {
    async fetch(request: Request, env: any, ctx: ExecutionContext): Promise<Response> {
        const url = new URL(request.url);

        // --- CORS preflight
        if (request.method === "OPTIONS") {
            return new Response(null, { headers: corsHeaders });
        }

        // --- Serve plugin manifest (optional)
        if (url.pathname === "/.well-known/ai-plugin.json") {
            return new Response(JSON.stringify({
                schema_version: "1",
                name_for_human: "Google Calendar Worker",
                name_for_model: "google_calendar_worker",
                description_for_human: "Access your Google Calendar events and create new ones.",
                description_for_model: "Plugin for accessing and managing Google Calendar events.",
                auth: { type: "none" },
                api: {
                    type: "sse",
                    url: "https://google-calendar-worker.tomislav-cloud.workers.dev/sse"
                }
            }), {
                headers: { "Content-Type": "application/json", ...corsHeaders }
            });
        }

        // --- SSE streaming manifest + heartbeats
        if (url.pathname === "/sse") {
            const encoder = new TextEncoder();
            const stream = new ReadableStream({
                async start(controller) {
                    // Immediately push manifest
                    const manifestEvent = `event: manifest\n` +
                        `data: ${JSON.stringify({
                            name: "Google Calendar",
                            version: "1.0.0",
                            description: "MCP integration for Google Calendar",
                            tools: [
                                {
                                    name: "list_events",
                                    description: "List upcoming calendar events",
                                    inputs: {
                                        type: "object",
                                        properties: {
                                            startDate: { type: "string", format: "date" },
                                            endDate: { type: "string", format: "date" }
                                        },
                                        required: ["startDate", "endDate"]
                                    }
                                },
                                {
                                    name: "create_event",
                                    description: "Create a new calendar event for booking",
                                    inputs: {
                                        type: "object",
                                        properties: {
                                            summary: { type: "string" },
                                            start: { type: "string", format: "date-time" },
                                            end: { type: "string", format: "date-time" }
                                        },
                                        required: ["summary", "start", "end"]
                                    }
                                }
                            ]
                        })}\n\n`;
                    controller.enqueue(encoder.encode(manifestEvent));
                    // Start heartbeats every 25 seconds
                    while (true) {
                        await new Promise(resolve => setTimeout(resolve, 25000));
                        const heartbeatEvent = `event: heartbeat\n` +
                            `data: {"timestamp": ${Date.now()}}\n\n`;
                        controller.enqueue(encoder.encode(heartbeatEvent));
                    }
                }
            });
            return new Response(stream, {
                headers: {
                    "Content-Type": "text/event-stream",
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive",
                    "Transfer-Encoding": "chunked",
                    ...corsHeaders
                }
            });
        }

        // --- Handle /execute (tool calls)
        if (url.pathname === "/execute" && request.method === "POST") {
            try {
                // @ts-ignore
                const { id, method, params } = await request.json();
                if (method !== "call_tool") throw new Error("Invalid method");

                // Load service account JSON from KV
                const serviceAccountRaw = await env.KV_GCP_SERVICE_ACCOUNT.get("gcp_service_account_json");
                if (!serviceAccountRaw) throw new Error("Service Account JSON missing from KV.");
                const serviceAccountJson = JSON.parse(serviceAccountRaw);

                // Get access token using google-auth-library
                const accessToken = await getAccessToken(serviceAccountJson);

                let result;
                if (params.tool === "list_events") {
                    const { startDate, endDate } = params.arguments;
                    const calendarResponse = await fetch(
                        `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${startDate}T00:00:00Z&timeMax=${endDate}T23:59:59Z`,
                        {
                            headers: { "Authorization": `Bearer ${accessToken}` }
                        }
                    );
                    const events = await calendarResponse.json();
                    result = { events };
                } else if (params.tool === "create_event") {
                    const { summary, start, end } = params.arguments;
                    const calendarResponse = await fetch(
                        `https://www.googleapis.com/calendar/v3/calendars/primary/events`,
                        {
                            method: "POST",
                            headers: {
                                "Authorization": `Bearer ${accessToken}`,
                                "Content-Type": "application/json"
                            },
                            body: JSON.stringify({
                                summary,
                                start: { dateTime: start },
                                end: { dateTime: end }
                            })
                        }
                    );
                    const event = await calendarResponse.json();
                    result = { event };
                } else {
                    throw new Error("Unknown tool");
                }

                return new Response(JSON.stringify({ jsonrpc: "2.0", id, result }), {
                    headers: { "Content-Type": "application/json", ...corsHeaders }
                });
            } catch (error: any) {
                console.error(error);
                return new Response(JSON.stringify({ error: error.message }), {
                    status: 500,
                    headers: { "Content-Type": "application/json", ...corsHeaders }
                });
            }
        }

        return new Response("Not found", { status: 404, headers: corsHeaders });
    }
};
