# [NightLink](https://jettnguyen.github.io/NightLink)

A web client for a dream-sharing community. It mixes a private journal, a “people you follow” feed, and optional anonymous sharing so you can post without oversharing.

## Features

- Log dreams with titles, tags, and visibility settings (private, public, anonymous, or people you follow)
- Browse personal history or jump into the social feed to see what your circle published
- Lightweight PWA: installable, works offline-ish, and fast on phones

## Tech Stack

React 18 + Vite, Firebase Auth/Firestore, and a tiny Netlify Function for AI summaries (coming soon).

## Deploying on Vercel (with free AI)

1. **Install the CLI (once):** `npm i -g vercel`
2. **Link & deploy:** run `vercel` from the repo root (accept defaults, it auto-detects Vite + `vercel.json`).
3. **Set server env:** `vercel env add HF_API_TOKEN production` (paste your Hugging Face token with *Inference Provider* scope). Repeat for preview if needed.
4. **Expose the endpoint to the client:** on Vercel Project Settings → Environment Variables, add `VITE_AI_ENDPOINT=https://<your-app>.vercel.app/api/ai-hf`. For local dev you can add the same URL (or `http://localhost:3000/api/ai-hf`) to `.env.local`.
5. **Test locally:** run `vercel dev` to spin up both the Vite app and the `/api/ai-hf` function together.

The new `api/ai-hf.js` function mirrors the Netlify version (rate limit + caching + Hugging Face Inference API), lives under `/api`, and ships automatically with Vercel deployments.
