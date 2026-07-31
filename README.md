# research-agent

## Setup

```
npm install
cp .env.example .env   # fill in ANTHROPIC_API_KEY; DATABASE_URL already defaults to file:./dev.db
npx prisma migrate dev
npm start
```

`dev.db` (the local SQLite database) is git-ignored and created by the migration — each clone of this repo needs to run `npx prisma migrate dev` once before its first `npm start`.

## Commands

- `npm start` — interactive research CLI
- `npm start -- history` — list the last 10 past research runs
- `npm start -- history <id>` — show one past run's full result
