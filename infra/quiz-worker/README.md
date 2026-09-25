# Quick Quiz backend setup (one-time, ~10 minutes)

The quiz app at `https://pablovolenski.com/quiz/` is static (GitHub Pages).
Quizzes, answers and the 1-week expiry live in this Worker plus one KV
namespace, on Cloudflare's free tier (the same account as the CMS login worker).

Do these steps once, in order.

## 1. Create the KV namespace

1. <https://dash.cloudflare.com> → **Storage & Databases** → **KV** → **Create a namespace**.
2. Name it `pv-quiz` → **Add**.

## 2. Create the Worker

1. **Workers & Pages** → **Create** → **Create Worker**.
2. Name it `pv-quiz` → **Deploy** (the hello-world placeholder).
3. **Edit code**, delete the placeholder, paste all of
   [`worker.js`](./worker.js), then **Deploy**.
4. Note the worker URL, e.g. `https://pv-quiz.pablo.workers.dev`.

## 3. Bind KV and set variables

In the worker's page: **Settings** → **Bindings** → **Add** → **KV namespace**:

| Variable name | KV namespace |
|---------------|--------------|
| `QUIZ_KV`     | `pv-quiz`    |

**Settings** → **Variables and Secrets** → **Add** (type *Text*):

| Name             | Value                        |
|------------------|------------------------------|
| `SITE_ORIGIN`    | `https://pablovolenski.com`  |
| `EMAIL_PROVIDER` | `log`                        |

Click **Deploy** so the changes take effect. Never set `DEV_SHOW_CONFIRM_LINK`
in production. It hands the confirmation link to the browser and skips the
email check.

## 4. Point the site at the Worker

In `public/quiz/quiz.js`, replace the placeholder:

```js
const QUIZ_API_PROD = 'https://pv-quiz.pablo.workers.dev'; // ← your worker URL
```

Commit and push (or ask Claude to do it). The site redeploys in a few minutes.

## 5. Email: pending

Until an email provider is configured, `EMAIL_PROVIDER=log` only **prints**
each mail (the confirmation link, and the share and results links) to the Worker
log: worker page → **Logs** (enable *Workers Logs*), or `npx wrangler tail pv-quiz`.
While it's on `log`, nobody gets a confirmation email, so nobody outside
can publish a quiz. The app is online but effectively closed.

To go live, pick a provider with an HTTP API (Resend, Brevo, Postmark, Mailgun…;
plain SMTP is awkward from a Worker). Then add its API key as a **Secret** and
add a case for it in `sendEmail()` at the bottom of `worker.js`. Or ask Claude,
giving it the provider name and sender address.

---

## How it works

- Creating a quiz stores it as **pending** for 48h and emails a confirm link.
- Clicking the link activates it for **7 days**. Then KV deletes the quiz and
  all its answers automatically, with no cleanup job.
- Takers answer one question per page on a single link (`/quiz/?q=<id>`).
  The creator sees totals on a private link (`/quiz/?r=<id>&k=<key>`).
- Abuse limits: 1–4 questions and 2–6 options each, 5 new quizzes per IP per
  hour, a honeypot field, and one answer per browser (soft).
- Free-tier budget: about 1,000 KV writes a day, shared by every created quiz
  (3 writes each) and every answer (1 write).

## Local testing

```bash
cd infra/quiz-worker
npx wrangler dev --var DEV_SHOW_CONFIRM_LINK:true --var SITE_ORIGIN:http://localhost:4321
# other terminal, repo root:
npm run dev        # then open http://localhost:4321/quiz/
```

On `localhost` the page talks to `http://localhost:8787` automatically, and
shows the confirmation link on screen instead of emailing it.
