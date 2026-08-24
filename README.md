# NutriTrack

A personal nutrition tracking app with barcode scanning, AI food photo recognition, and a Claude-powered macro advisor.

## Project Structure

```
nutritrack/
├── backend/          # Node.js + Express API (port 3000)
└── app/              # React Native app (Expo)
```

---

## Backend Setup

### 1. Install dependencies

```bash
cd backend
npm install
```

### 2. Add API keys

Edit `backend/.env`:

```env
GEMINI_API_KEY=your_gemini_key_here
ANTHROPIC_API_KEY=your_anthropic_key_here
```

- **Gemini key** — [Google AI Studio](https://aistudio.google.com/app/apikey) (free tier available)
- **Anthropic key** — [Anthropic Console](https://console.anthropic.com/)

### 3. Run the backend

```bash
node server.js
```

The API will start on `http://localhost:3000`. A SQLite database (`nutritrack.db`) is created automatically on first run.

---

## App Setup

### 1. Install dependencies

```bash
cd app
npx expo install
```

### 2. Configure the backend URL

If running on a **physical device**, edit `app/services/api.js` and replace `localhost` with your machine's local IP address:

```js
const BASE_URL = 'http://192.168.x.x:3000';
```

On the iOS Simulator or Android Emulator, `localhost` / `10.0.2.2` (Android) typically works.

### 3. Run the app

```bash
npx expo start
```

Then press `i` for iOS Simulator, `a` for Android Emulator, or scan the QR code with the Expo Go app.

---

## Features

| Tab | Description |
|-----|-------------|
| **Log** | Today's macro progress bars + meal list |
| **Scan** | Barcode scanner → OpenFoodFacts lookup |
| **Camera** | Photo food scanner → Gemini AI nutrition estimate |
| **Goals** | Set daily calorie and macro targets (with presets) |
| **Advisor** | Chat with Claude (`claude-opus-4-7`) for personalised macro advice |

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/food/barcode/:barcode` | OpenFoodFacts product lookup |
| POST | `/api/ai/vision` | Gemini food photo analysis |
| POST | `/api/ai/advice` | Claude macro advice chat |
| GET | `/api/log` | Today's food logs |
| POST | `/api/log` | Add a food log entry |
| PUT | `/api/log/:id` | Update a log entry |
| DELETE | `/api/log/:id` | Delete a log entry |
| GET | `/api/log/goals` | Get daily goals |
| POST | `/api/log/goals` | Save daily goals |
