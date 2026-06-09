# Autopilots Sales Dashboard

Een lokale salesomgeving voor setters, closers en management.

## Starten

1. Kopieer `.env.example` naar `.env`.
2. Vul `GHL_PRIVATE_TOKEN` in met je GoHighLevel Private Integration token.
3. Start het dashboard:

```bash
npm start
```

Open daarna `http://localhost:4173`.

## Logins

Set passwords through environment variables:

- `ADMIN_PASSWORD`
- `ALBERT_PASSWORD`
- `JEAN_PAUL_PASSWORD`
- `KAAN_PASSWORD`
- `NICO_PASSWORD`
- `FABIAN_PASSWORD`
- `TIM_PASSWORD`

In development only, setters fall back to `welkom`.

## Wat wordt gemeten

Setters:

- Ingelogde tijd
- Calls per dag en week
- Beantwoorde gesprekken
- No-shows
- Stage bewegingen in de setter funnel
- Bingo's per gesprek, call en uur
- Nope not today per Bingo
- Transcripties en AI coaching

Closers:

- Opkomst
- Meetings
- Gewonnen en verloren deals
- Tijd van eerste contact tot won
- Closing percentage

## Talen

Het dashboard ondersteunt Nederlands en Engels. Setters en closers kunnen zelf wisselen via de taalkeuze op de loginpagina of in de dashboardbalk.

## GoHighLevel stage mapping

De setter funnel gebruikt deze stage IDs:

- Ready to call: `31510e27-8f46-4685-8f75-cb8b8fbbd460`
- Called: `320d52f3-7cb7-4ac6-b753-7374d84d5ee9`
- Follow up: `29f30adc-3e93-40b3-a351-bd93585b55ef`
- Nope not today: `da8517a6-838b-4eff-9b93-4f28182a6ea9`
- BINGO: `05f70c13-6ace-4c44-9dc3-fb6c4c5f0102`

De closer funnel gebruikt deze stage IDs:

- Discovery call: `896cfaca-8c34-4dc0-b022-f6022ee155b2`
- Follow up call: `cfb8bf82-2a47-43b4-933d-fdcbed5479e0`
- No show: `f55bdfa0-bb2e-4ede-b3d7-4a769dadb880`
- Proposal sent: `7bf5bfad-dcb6-4b2a-9f77-5a85fdfe94e8`
- Deal closed: `a91cae3c-4b2a-4a6a-91f9-cfae7302fcc9`
- Deal lost: `f382217e-4add-4c92-8ec8-c05b6c9fd00e`
- Future: `5ec8d9ed-c62c-4c2b-ab39-d5788e58182a`

Deze calendars tellen mee voor closer meetings:

- `Vervolgafspraak Autopilots Ai Agency`
- `Kennismaking met Autopilots - Ai Agents op maat`
- `(Website) Kennismaking met Autopilots - Ai Agents op maat`
- `Discovery Call - Autopilots 🇺🇸`
- `Follow up - Autopilots Ai Agency`

## Supabase

De databasebasis staat in `supabase/schema.sql`.

Voor productie zijn nodig:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Een Supabase token die met `sbp_` begint is meestal een account access token voor management/API gebruik. Dat is niet hetzelfde als de project URL, publishable key of service role key.

## Belangrijke notitie

De GoHighLevel API-token hoort alleen op de backend te staan. Zet deze nooit in HTML, client-side JavaScript of een page builder embed.

## Railway

Deze map is klaar voor Railway met `railway.toml`.

Zet in Railway minimaal deze variables:

- `NODE_ENV=production`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GHL_PRIVATE_TOKEN`
- `GHL_LOCATION_ID`
- `ADMIN_PASSWORD`
- `ALBERT_PASSWORD`
- `JEAN_PAUL_PASSWORD`
- `KAAN_PASSWORD`
- `NICO_PASSWORD`
- `FABIAN_PASSWORD`
- `TIM_PASSWORD`

Railway vult `PORT` automatisch. Zet `HOST` niet, tenzij je bewust wilt overrulen.

Na deploy gebruik je de Railway URL als Custom Menu Link in GoHighLevel met de opening method `Embedded Page (iFrame)`.

## Live data debuggen

Login als admin en open daarna:

`https://jouw-railway-url/api/debug/live-data`

Deze endpoint laat compact zien:

- hoeveel opportunities, conversations, calendars, calendar events en voice call logs GHL terugstuurt
- welke stage IDs echt voorkomen
- welke assigned user IDs echt voorkomen
- welke calendar names/titles/statussen voorkomen
- of Voice AI transcripts/call logs beschikbaar zijn

Gebruik dit om de mapping strak te zetten wanneer dashboardcijfers afwijken van GoHighLevel.
