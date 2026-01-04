# [NightLink](https://nightlink.dev)

[![Node.js CI](https://github.com/JettNguyen/NightLink/actions/workflows/ci.yml/badge.svg)](https://github.com/JettNguyen/NightLink/actions/workflows/ci.yml)
[![CodeQL](https://github.com/JettNguyen/NightLink/actions/workflows/github-code-scanning/codeql/badge.svg)](https://github.com/JettNguyen/NightLink/actions/workflows/github-code-scanning/codeql)

> A dream journal and social network. Log your dreams, get AI-generated titles and summaries, and share with friends, family, or the world.

## Features

- Private dream journal with tags and visibility controls
- AI dream analysis (title and summary generation)
- Social feed showing dreams from people you follow
- User search and profile customization
- Comment on dreams
- React to dreams and comments

> Screens / clips live in [docs/ux-case-study.md](docs/ux-case-study.md).

## Tech Stack

| Layer | Tech |
| --- | --- |
| Frontend | React 18 + Vite, CSS |
| Auth/Data | Firebase Auth + Firestore |
| AI | API proxy at `/api/ai` |
| Tooling | ESLint 9, Vite PWA plugin, GitHub Actions |
| Hosting | Vercel (with GH Pages fallback workflow) |

## CI/CD Flow

1. **GitHub Actions** – Lint + multi-node builds (18/20/22) per push.
2. **CodeQL** – Security scanning for JavaScript/TypeScript.
3. **Deploy** – Vercel hooks (GH Pages workflow available for static fallback).

## License

Released under the [MIT License](LICENSE).
