# NightLink Web

Dream journal and social network - Progressive Web App version.

## Features

- Dream journaling with text entry
- Tag and categorize dreams
- Anonymous feed to view shared dreams
- User profiles with customization
- Dark mode support
- Works on any device (mobile, tablet, desktop)
- Install as PWA (works like native app)

## Tech Stack

- React 18
- Vite
- Firebase (Auth, Firestore)
- React Router
- Progressive Web App (PWA)

## Setup

### 1. Install Dependencies

```bash
cd NightLink
npm install
```

### 2. Configure Environment (keeps secrets out of the repo)

1. Copy the example: `cp .env.example .env.local`
2. Fill in Firebase values from your Firebase console under *Project Settings → General → Web app (`</>`)*:
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`
3. (Optional) Set `VITE_AI_ENDPOINT` to your deployed Netlify function URL if you want AI insights.

Firebase config is now read from env vars at runtime; no secrets are committed to source.

### 3. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Firebase Security Rules

Make sure you have proper Firestore rules set:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth.uid == userId;
    }
    
    match /dreams/{dreamId} {
      allow read: if request.auth != null && (
        resource.data.userId == request.auth.uid ||
        resource.data.visibility == 'anonymous'
      );
      allow create: if request.auth != null && 
        request.resource.data.userId == request.auth.uid;
      allow update, delete: if request.auth != null && 
        resource.data.userId == request.auth.uid;
    }
  }
}
```

## Add AI (free, easiest): Netlify Functions

No paid Firebase plan needed. We already added the files for you.

1) Install deps (includes openai for the function)
```
npm install
```

2) Add your OpenAI key to Netlify
- In Netlify site settings, Environment variables, add `OPENAI_API_KEY`.

3) Deploy to Netlify (free tier ok)
- Connect this repo to Netlify (or drag-and-drop) and deploy. Netlify will pick up `netlify/functions/ai.js` automatically.

4) Grab the function URL
- It will look like `https://<your-site>.netlify.app/.netlify/functions/ai`.

5) Tell the web app to use it
```
cp .env.local.example .env.local
# edit .env.local -> set VITE_AI_ENDPOINT=https://<your-site>.netlify.app/.netlify/functions/ai
```

6) Restart dev server and test
```
npm run dev
```
- Create a dream, hit Analyze, and AI title/insights should appear.

Notes: If you prefer another model/provider, swap the body of `netlify/functions/ai.js` but keep the response shape `{ title, insights }`. The UI already falls back to local heuristics on errors.

**NightLink Web** - Your dreams, anywhere you go.
