# Huber

Uber for horses: a regular HTML/CSS/JavaScript web page with a real local Node API. No Expo or native app toolchain is needed. The booking layout follows Uber's public ride-request flow, with horses replacing cars.

## Run

Node 22.18 or newer is required (developed and checked on Node 24).

```sh
npm install
npm start
```

Open **http://127.0.0.1:8787**. The app has route search, three ride classes, booking, simulated driver chat, pickup/completion, cancellation, receipts, trip history, wallet promotions, profile preferences, and a second fake rider. The **Help** link opens the presenter guide with a timed demo and a prepared Grok task.

All app code and fonts are served locally. OpenStreetMap tiles require internet; a local illustrated map is used if map tiles cannot load. Both maps show synthetic routes and horse locations. No real booking, charge, email, SMS, or driver dispatch occurs. State stays in memory and resets when the server restarts.

## Local security lab

This is deliberately vulnerable application code for a controlled demo. The default server binds to `127.0.0.1`. The fake identity selector at `/lab/session` is a lab convenience, not production authentication. Public hosting uses the isolated adapter described below rather than sharing the local fixture between visitors.

Four seeded flaws are ready for a later agent to patch:

1. Object authorization: a rider can access another rider's trip.
2. Fare tampering: checkout accepts a client-supplied price.
3. Mass assignment: profile edits can change privileged fields.
4. Concurrency: parallel promo requests produce duplicate wallet credit.

```sh
npm run check             # TypeScript
npm test                  # Seven functional tests: should pass
npm run demo:attack       # Disposable synthetic exploit reproductions
npm run test:security     # Desired-security regressions: fail before patching
npm run lab:verify        # Distinguishes vulnerable baseline from complete patch
npm run lab:pack          # Source ZIP, task prompt, original test-integrity manifest
npm run lab:review -- PATH_TO_PATCHED_PROJECT
```

The exploit script and tests create their own ephemeral servers. They never attack the running preview or any external host. Test failures in `test:security` are intentional until an agent patches the application. The ordinary functional suite must remain green. No work has been sent to Grok Bot.

`lab:pack` excludes Git metadata, dependencies, runtime files, reports, and environment files. It freezes hashes for the original functional/security tests and fixture helper outside the agent ZIP. Run `lab:review` from this original checkout after receiving a candidate patch to reject edited tests and execute both suites against the candidate code.

## Phone browser testing

The page is responsive; no mobile app installation is needed. To use a phone on the same trusted private Wi-Fi, stop the localhost server and run `npm run start:lan`. Open the printed private-network URL on the phone. This explicitly enables LAN binding for the intentionally vulnerable synthetic fixture. It is separate from the default local-only command. Firewall/network access and a physical device have not been verified automatically.

## Hosting

The public demo is configured for Vercel at **https://huber.afaq.mov**. Static assets come from `public/`; `api/gateway.ts` runs the same Node routes as the local lab. Each tab carries its own AES-256-GCM encrypted fixture in session storage. Only the server can read or change that fixture; no database or global visitor state is shared. Requests rebuild the fixture, run the route, and return its updated encrypted state, so cold starts preserve the demo. The server-only `HUBER_STATE_KEY` environment variable must contain 32 random bytes encoded as 64 hex characters.

The public adapter deliberately preserves the four synthetic flaws. A single gateway request accepts up to 20 concurrent requests in its `requests` array, allowing the promo race to be reproduced inside one isolated fixture. The normal UI serializes transport requests so state updates do not overwrite one another. State expires after six hours of inactivity, keeps bounded history, and can be restarted by closing the tab. Copied capsules can replay synthetic history; this is a demo transport, not an authentication or payment system.

Run `npm run start:hosted` for the identical transport at http://127.0.0.1:8788, and `npm run test:hosting` to check cross-visitor isolation, tamper rejection, normal booking, and preservation of the lab flaws. Vercel deployments use the tracked `vercel.json`. Never add the state key, `.vercel/`, or environment files to Git.

Pushes to `main` deploy automatically from GitHub. GitHub Actions checks TypeScript, hosted/local API parity, and the known lab state (all four flaws present, or all four patched). `npm run test:live` verifies a complete ride and visitor isolation against the public custom domain using only disposable synthetic state.

## Project layout

- `public/`: buildless web page, self-hosted fonts and Leaflet assets.
- `backend/`: HTTP routes, in-memory fixtures, access and billing logic.
- `shared/`: typed catalog, fare calculations, API contracts.
- `tests/`: normal-flow tests and four security regressions.
- `tools/`: exploit reproduction, packaging and independent review.

UI reference: https://m.uber.com/go/home. Map attribution: OpenStreetMap contributors. Leaflet and DM Sans licences are included alongside their local assets. This constructed benchmark tests named behaviours; passing it does not establish general security or real-world reliability.
