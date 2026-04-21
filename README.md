# BdMSO website

Static marketing site and lightweight application backend prepared for:

- `Cloudflare Pages` or Worker asset hosting for the public site
- `Cloudflare Workers` for API endpoints
- `Cloudflare D1` for registrations and sponsorship leads

## Architecture

- public pages are built into `dist/`
- the Worker in [worker.js](/home/fahim/Downloads/bdm/worker.js) serves static assets and handles:
  - `POST /api/submit-registration`
  - `POST /api/submit-sponsorship`
- data is stored in D1 tables created from [schema.sql](/home/fahim/Downloads/bdm/schema.sql)

## Local build

1. Copy `.env.example` to `.env`
2. Set `SITE_URL`
3. Run:

```bash
npm install
npm run build
```

## Cloudflare setup

1. Create a D1 database:

```bash
wrangler d1 create bdmso
```

2. Put the returned database IDs into [wrangler.toml](/home/fahim/Downloads/bdm/wrangler.toml).

3. Apply the schema:

```bash
wrangler d1 execute bdmso --file=./schema.sql
```

4. Build and run locally:

```bash
npm run build
npm run cf:dev
```

5. Deploy:

```bash
npm run build
npm run cf:deploy
```

## Data model

Tables created by the schema:

- `guardian_accounts`
- `registrations`
- `sponsorship_enquiries`

## Notes

- Guardian account passwords are salted and hashed in the Worker before storing in D1.
- The current implementation creates guardian accounts during registration, but it does not yet include a full login/session system.
- The public site is same-origin with the API, so no separate backend URL is needed.
