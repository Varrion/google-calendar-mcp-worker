// src/worker-configuration.d.ts
export interface Env {
    // OAuth provider needs your client credentials:
    OAUTH_CLIENT_ID:     string;
    OAUTH_CLIENT_SECRET: string;

    KV_GCP_SERVICE_ACCOUNT: KVNamespace;
}
