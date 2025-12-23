# Quick Start - NightLink Web

Get your web app running in 10 minutes.

## Step 1: Install Node.js (if not installed)

Download from [nodejs.org](https://nodejs.org) (LTS version recommended)

Verify installation:
```bash
node --version
npm --version
```

## Step 2: Navigate to Web Directory

```bash
cd "/Users/jettschool/Library/CloudStorage/OneDrive-UniversityofFlorida/Code/XCode/NightLink/NightLink-Web"
```

## Step 3: Install Dependencies

```bash
npm install
```

This will take 1-2 minutes.

## Step 4: Configure Firebase

### Option A: Use Same Firebase Project as iOS App

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your NightLink project
3. Click gear icon ⚙️ > Project settings
4. Scroll to "Your apps"
5. Click `</>` (Add web app)
6. Enter nickname: "NightLink Web"
7. Click "Register app"
8. **Copy the firebaseConfig code**

9. Open `src/firebase.js` in your editor
10. Replace the config with your values:

```javascript
const firebaseConfig = {
  apiKey: "paste-your-api-key-here",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "your-sender-id",
  appId: "your-app-id"
};
```

11. Save the file

### Enable Web Access in Firebase

1. Go to Firebase Console > Authentication
2. Click "Settings" tab
3. Under "Authorized domains", make sure `localhost` is listed
4. Add your deployment domain later (e.g., `your-app.web.app`)

## Step 5: Run the App

```bash
npm run dev
```

You should see:
```
  VITE ready in XXX ms

  ➜  Local:   http://localhost:3000/
  ➜  press h + enter to show help
```

Open [http://localhost:3000](http://localhost:3000) in your browser!

## Step 6: Test the App

1. Sign up with email/password or continue as guest
2. Create a dream
3. Add some tags
4. Check the Feed tab
5. Edit your profile

Everything should work just like the iOS app!

## Deploy to the Internet (Optional)

### Easiest: Firebase Hosting (Free)

```bash
# Install Firebase CLI
npm install -g firebase-tools

# Login
firebase login

# Initialize (one time)
firebase init hosting

# Select:
# - Use existing project > your-project
# - Public directory: dist
# - Single-page app: Yes
# - Don't overwrite index.html

# Build and deploy
npm run build
firebase deploy
```

Your app will be live at `https://your-project.web.app`!

### Alternative: Netlify Drop (Drag & Drop)

```bash
# Build the app
npm run build

# Go to https://app.netlify.com/drop
# Drag the 'dist' folder
# Done! Your app is live
```

## Share with Others

Once deployed, anyone can:

1. **Use in browser**: Just visit your URL
2. **Install as app on iPhone**:
   - Open in Safari
   - Tap Share → Add to Home Screen
   - Icon appears on home screen
3. **Install as app on Android**:
   - Open in Chrome
   - Tap "Install app" banner
4. **Install on computer**:
   - Open in Chrome/Edge
   - Click install icon in address bar

## Troubleshooting

### Port 3000 already in use
```bash
# Stop the process using port 3000
# Or change port in vite.config.js
```

### Firebase errors
- Double-check your config in `src/firebase.js`
- Make sure Firebase Authentication is enabled
- Verify Firestore is set up

### "Module not found" errors
```bash
rm -rf node_modules
npm install
```

### Can't create dreams
- Check Firestore security rules are set up
- Create the required index: Dreams collection with userId + createdAt

## Next Steps

1. **Customize**: Change colors in `src/index.css`
2. **Add features**: AI reflections, friend system
3. **Deploy**: Share with friends and family
4. **Monitor**: Check Firebase console for usage

## Comparison

| Feature | iOS App | Web App |
|---------|---------|---------|
| Dream Journal | ✅ | ✅ |
| Tags | ✅ | ✅ |
| Dark Mode | ✅ | ✅ |
| Feed | ✅ | ✅ |
| Profile | ✅ | ✅ |
| Voice Recording | ✅ | ❌ |
| AI Reflections | ✅ | ⚠️ (Easy to add) |
| Friends | ✅ | ⚠️ (Easy to add) |
| Works Offline | Limited | Limited |
| Install as App | iOS only | iOS, Android, Desktop |
| Cost | $99/year | Free (Firebase) |

## Cost Breakdown

### Free Tier (Perfect for personal use):
- Firebase: 50K reads/day, 20K writes/day
- Hosting: Unlimited bandwidth on Netlify/Firebase
- Domain: Optional ($12/year for custom domain)

### If you grow (1000+ users):
- Firebase: ~$25/month
- Still way cheaper than App Store!

## Support

Questions? Check:
1. `README.md` for detailed docs
2. Browser console for error messages
3. Firebase console for backend issues
4. [Firebase docs](https://firebase.google.com/docs/web/setup)

---

That's it! You now have a fully functional web version of NightLink that works on any device. 🚀
