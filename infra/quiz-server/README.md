# Quick Quiz server

Backend for `https://pablovolenski.com/quiz/`. The quiz page itself is static
(GitHub Pages). This small Node server stores quizzes and answers and sends the
confirmation emails.

- **Runtime:** Node 22.13 or newer. SQLite is built into Node, so the only
  dependency is `nodemailer`.
- **Data:** one SQLite file. Quizzes and their answers are deleted
  automatically when they expire.
- **Email:** any SMTP server. Until SMTP is configured, emails are printed to
  the log instead of being sent.

## Configuration (environment variables)

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `8787` | Listen port |
| `HOST` | `127.0.0.1` | Listen address. Keep it local behind a reverse proxy |
| `DB_PATH` | `./quiz.db` | SQLite file |
| `SITE_ORIGIN` | `https://pablovolenski.com` | Used to build the links in emails |
| `ALLOWED_ORIGINS` | `https://pablovolenski.com,https://www.pablovolenski.com` | Sites allowed to call the API (CORS). `localhost` is always allowed |
| `TRUST_PROXY` | unset | Set `1` behind nginx/Caddy so rate limiting sees the real client IP |
| `SMTP_HOST` | unset | **Unset = emails are only logged.** Set it to send for real |
| `SMTP_PORT` | `587` | 587 (STARTTLS) or 465 (TLS) |
| `SMTP_SECURE` | `false` | `true` for port 465 |
| `SMTP_USER` / `SMTP_PASS` | — | SMTP login |
| `MAIL_FROM` | `SMTP_USER` | e.g. `Quick Quiz <quiz@pablovolenski.com>` |
| `DEV_SHOW_CONFIRM_LINK` | unset | `true` returns the confirm link to the browser. **Local testing only**: it skips the email check |

While SMTP is unset, nobody receives a confirmation link, so nobody can
publish a quiz. The app is online but effectively closed.

## Deploy

The server needs a public HTTPS address, for example
`https://quiz-api.pablovolenski.com`: point a DNS `A` record at your server,
then put a reverse proxy in front for TLS.

### Option A: plain Node + systemd

```bash
# on the server, as root
useradd --system --home /opt/quiz-server quiz
mkdir -p /opt/quiz-server /var/lib/quiz-server && chown quiz /var/lib/quiz-server
# copy server.js, package.json and package-lock.json to /opt/quiz-server, then:
cd /opt/quiz-server && npm ci --omit=dev

cat > /etc/quiz-server.env <<'EOF'
DB_PATH=/var/lib/quiz-server/quiz.db
TRUST_PROXY=1
# SMTP_HOST=mail.example.com
# SMTP_PORT=587
# SMTP_USER=quiz@pablovolenski.com
# SMTP_PASS=...
# MAIL_FROM=Quick Quiz <quiz@pablovolenski.com>
EOF
chmod 600 /etc/quiz-server.env

cp quiz-server.service /etc/systemd/system/
systemctl enable --now quiz-server
journalctl -u quiz-server -f        # logs (and the emails, while SMTP is unset)
```

### Option B: Docker

```bash
docker build -t quiz-server infra/quiz-server
docker run -d --name quiz-server --restart unless-stopped \
  -p 127.0.0.1:8787:8787 -v quiz-data:/data \
  --env-file /etc/quiz-server.env quiz-server
```

### Reverse proxy (HTTPS)

Caddy (gets the certificate automatically):

```
quiz-api.pablovolenski.com {
    reverse_proxy 127.0.0.1:8787
}
```

For nginx, use `proxy_pass http://127.0.0.1:8787;` plus
`proxy_set_header X-Forwarded-For $remote_addr;`, and Let's Encrypt for the certificate.

### Connect the site

In `public/quiz/quiz.js`, set:

```js
const QUIZ_API_PROD = 'https://quiz-api.pablovolenski.com';
```

Commit and push. The site redeploys in a few minutes. Check the server with
`curl https://quiz-api.pablovolenski.com/health`, which should return `{"ok":true}`.

## How it works

- Creating a quiz stores it as **pending** for 48 hours and emails a
  confirmation link. If that email fails, the quiz isn't saved and the person
  is asked to try again.
- Clicking the link activates the quiz for **7 days**. An hourly sweep then
  deletes it along with its answers.
- Takers answer one question per page on a single link (`/quiz/?q=<id>`).
  The creator sees totals on a private link (`/quiz/?r=<id>&k=<key>`).
- Abuse limits: 1–4 questions with 2–6 options each, 5 new quizzes per IP per
  hour, a hidden form field that catches bots, and one answer per browser (a
  soft check).
- Backup: copy the SQLite file, or run `sqlite3 quiz.db ".backup quiz-backup.db"`.

## Local development

```bash
cd infra/quiz-server
npm install
npm test           # API tests (in-memory database)
npm run dev        # http://localhost:8787, shows the confirm link on screen
# other terminal, repo root:
npm run dev        # open http://localhost:4321/quiz/
```

When the page runs on `localhost`, it calls `http://localhost:8787` automatically.
