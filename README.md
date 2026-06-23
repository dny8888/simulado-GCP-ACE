# GCP ACE Simulator

Practice exam simulator for the **Google Cloud Associate Cloud Engineer** certification.

## Features

- 30 or 60-question simulados with **exam-proportional distribution**
- Instant answer feedback with explanations
- **Error log** — wrong answers auto-saved to localStorage
- **"Copy for AI"** — generates a structured prompt with your errors to paste into Claude, ChatGPT, etc.
- Exam history with pass/fail tracking
- 100% client-side — no backend, no account needed

## GitHub Pages Setup

1. Fork or push this repo to GitHub
2. Go to **Settings → Pages**
3. Source: **Deploy from branch** → `main` → `/ (root)`
4. Save — your simulator will be live at `https://<username>.github.io/<repo-name>/`

## Running Locally

```bash
# Option 1 — Node
npx serve .

# Option 2 — Python
python3 -m http.server 8080

# Option 3 — VS Code
# Install "Live Server" extension, right-click index.html → Open with Live Server
```

> ⚠️ Must run via a local server (not `file://`) because `questions.json` is fetched via HTTP.

## Adding More Questions

Edit `questions.json`. Each question follows this structure:

```json
{
  "id": 31,
  "domain": "GKE",
  "section": "Deploying and implementing a cloud solution",
  "difficulty": "medium",
  "text": "Your question here...",
  "options": {
    "A": "First option",
    "B": "Second option",
    "C": "Third option",
    "D": "Fourth option"
  },
  "answer": "B",
  "explanation": "Why B is correct and others are wrong..."
}
```

### Section values (must match exactly for proportional sampling):

| Section | Exam Weight |
|---------|------------|
| `Setting up a cloud solution environment` | 17% |
| `Planning and configuring a cloud solution` | 17% |
| `Deploying and implementing a cloud solution` | 25% |
| `Ensuring successful operation of a cloud solution` | 20% |
| `Configuring access and security` | 20% |

## Exam Distribution

The simulator mirrors the official ACE exam blueprint proportions for both 30 and 60-question modes.

## Data Storage

All data (errors, history, sessions) is stored in **localStorage** — it persists between sessions in the same browser and is never sent anywhere.

---

**Current question bank:** 30 questions · Domains: Compute Engine, GKE, Cloud Run, Networking, Storage & Databases, IAM & Security, Monitoring & Logging, Deployment
