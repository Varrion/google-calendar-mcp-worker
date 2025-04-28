# Google Calendar Worker

A Cloudflare Worker that exposes Google Calendar operations (list, create events) via a secure API.  
This project uses a Google service account and Cloudflare Workers KV for credential storage.

![Deploy on Cloudflare](https://img.shields.io/badge/Deploy-Cloudflare%20Workers-orange)
![License](https://img.shields.io/badge/License-MIT-green)

---

## 🚀 Quick Start

### 1. Clone This Repository

```bash
git clone https://github.com/yourusername/google-calendar-worker.git
cd google-calendar-worker
```

### 2. Set Up Google Service Account

- Go to [Google Cloud Console](https://console.cloud.google.com/).
- Create a service account with the **Editor** or **Calendar Admin** role.
- Enable the **Google Calendar API** for your project.
- Download the service account JSON key file.
- Share your Google Calendar (or the calendar you want to access) with the service account's email address.

### 3. Configure Cloudflare Workers KV

Install Wrangler CLI if you haven't:

```bash
npm install -g wrangler
```

Create a KV namespace:

```bash
wrangler kv:namespace create KV_GCP_SERVICE_ACCOUNT
```

Note the `id` and `preview_id` from the output.

Edit `wrangler.toml` and set the correct KV binding:

```toml
name = "google-calendar-worker"
main = "src/index.ts"
compatibility_date = "2024-09-23"
compatibility_flags = [ "nodejs_compat" ]

[[kv_namespaces]]
binding = "KV_GCP_SERVICE_ACCOUNT"
id = "YOUR_NAMESPACE_ID"
preview_id = "YOUR_PREVIEW_NAMESPACE_ID"
```

Store your service account JSON in KV:

```bash
wrangler kv:key put --binding=KV_GCP_SERVICE_ACCOUNT gcp_service_account_json @path/to/your-service-account.json
```

### 4. Install Dependencies

```bash
npm install
```

### 5. Deploy Your Worker

```bash
wrangler deploy
```

---

## 📄 License

This project is licensed under the MIT License.
