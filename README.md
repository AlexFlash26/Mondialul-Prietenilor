# Mondialul Prietenilor

Aplicatie web party-game pentru predictii de scor corect in faza grupelor.

## Stack

- Next.js + React
- Supabase Auth + Postgres
- API-Football pentru live scores
- Vercel pentru hosting

## Setup rapid

1. Creeaza un proiect Supabase.
2. Ruleaza SQL-ul din `supabase/schema.sql`.
3. Copiaza `.env.example` in `.env.local` si completeaza valorile.
4. In Supabase Auth, activeaza Email Magic Link si adauga URL-ul aplicatiei in Redirect URLs.
5. Ruleaza local:

```bash
npm install
npm run dev
```

## Variabile

- `ADMIN_EMAIL`: emailul tau, singurul admin.
- `INVITE_CODE`: codul pe care il dai prietenilor.
- `API_FOOTBALL_KEY`: cheia de la API-Football.
- `CRON_SECRET`: secret pentru endpointul `/api/sync-scores`.

## Deploy

Deploy pe Vercel, apoi seteaza aceleasi variabile de mediu. Pe planul Vercel Hobby, cron-urile pot rula doar o data pe zi, deci pentru live scores foloseste un cron extern gratuit care apeleaza:

```txt
/api/sync-scores?secret=CRON_SECRET
```

Recomandare: interval de 5 minute ca sa ramai confortabil sub limita API-Football free.
