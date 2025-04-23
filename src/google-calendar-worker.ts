// google-calendar-worker.ts

export class GoogleCalendarWorker {
    private calendarId: string;
    private getAccessToken: () => Promise<string>;

    constructor(calendarId: string, getAccessToken: () => Promise<string>) {
        this.calendarId = calendarId;
        this.getAccessToken = getAccessToken;
    }

    private async apiFetch(path: string, options: RequestInit = {}) {
        const token = await this.getAccessToken();
        const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.calendarId)}${path}`;
        const headers = {
            ...(options.headers || {}),
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        };
        const response = await fetch(url, { ...options, headers });
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Google Calendar API error: ${response.status} ${response.statusText} - ${error}`);
        }
        if (response.status === 204) return null; // No Content
        return response.json();
    }

    // List events
    async listEvents({ timeMin, timeMax, maxResults = 10 }: { timeMin?: string, timeMax?: string, maxResults?: number } = {}) {
        const params = new URLSearchParams();
        if (timeMin) params.append('timeMin', timeMin);
        if (timeMax) params.append('timeMax', timeMax);
        params.append('maxResults', String(maxResults));
        params.append('singleEvents', 'true');
        params.append('orderBy', 'startTime');
        return this.apiFetch(`/events?${params.toString()}`);
    }

    // Get a single event
    async getEvent(eventId: string) {
        return this.apiFetch(`/events/${encodeURIComponent(eventId)}`);
    }

    // Create an event
    async createEvent(event: object) {
        return this.apiFetch(`/events`, {
            method: 'POST',
            body: JSON.stringify(event),
        });
    }

    // Update an event
    async updateEvent(eventId: string, event: object) {
        return this.apiFetch(`/events/${encodeURIComponent(eventId)}`, {
            method: 'PUT',
            body: JSON.stringify(event),
        });
    }

    // Delete an event
    async deleteEvent(eventId: string) {
        return this.apiFetch(`/events/${encodeURIComponent(eventId)}`, {
            method: 'DELETE',
        });
    }
}
