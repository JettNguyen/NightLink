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

## Tech Stack

| Layer | Tech |
| --- | --- |
| Frontend | React 18 + Vite, CSS modules |
| Auth/Data | Firebase Auth & Firestore |
| Deployment | Vercel + GitHub Actions (CI & CodeQL) |

## CI/CD Flow

1. **GitHub Actions** – Lint + multi-node builds (18/20/22) per push.
2. **CodeQL** – Security scanning for JavaScript/TypeScript.
3. **Deploy** – Vercel hooks (GH Pages workflow available for static fallback).

## License

Released under the [MIT License](LICENSE).
