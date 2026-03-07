# SolShare: Solana Native Crypto Expense Splitter

SolShare is a mobile-first application natively built on the Solana blockchain using the Solana Mobile Stack (SMS). It solves the problem of splitting fiat expenses (like dinners, rent, trips) directly into cryptocurrency, providing real-time USD/SOL pricing and executing settlements directly on-chain using the Mobile Wallet Adapter (MWA).

## Features

- **Mobile Foundation First**: Built natively using React Native and Expo. Seamlessly interacts with mobile hardware and Solana Mobile Stack features directly designed for smartphones.
- **Smart AI Receipt Scanner**: Integration with Gemini AI allows users to instantly take a picture of a bill with their camera and dynamically prefill the expense title, extracted currency (e.g., INR or USD), and total split amount.
- **On-chain Settlements & MWA Interface**: Instantly connect your phone's crypto wallet using the Solana MWA. Settle debts permissionlessly on the Solana network with full transaction verification.
- **Real-Time Price Context**: Pulls the live price of SOL/USD and SOL/INR concurrently on a scalable caching backend to give users immediate feedback on exact crypto equivalents of fiat debts.
- **Full Backend Logic**: Custom Node.js Express server to handle robust group coordination, user profile matching, historical activity fetching, and push notifications.

## Tech Stack

- **Frontend App**: React Native, Expo, React Navigation
- **Blockchain Interface**: Solana Web3.js, Solana Mobile Wallet Adapter (@solana-mobile/mobile-wallet-adapter-protocol)
- **Backend Infrastructure**: Node.js, Express, MongoDB (Mongoose)
- **Artificial Intelligence**: Google Gemini Vision AI (`@google/generative-ai`)

## Setting Up the Project Locally

### 1. Backend Server Setup

Navigate into the server directory and create your `.env` file.

```bash
cd server
cp .env.example .env
npm install
npm run dev
```

_Required Environment Variables (`.env`):_

```
PORT=8000
MONGODB_URI=your_mongodb_cluster_uri
JWT_SECRET=your_secret_phrase
GEMINI_API_KEY=your_gemini_api_key
```

### 2. Mobile App Setup

In a new terminal, navigate to the `mobile` app and install its dependencies. Ensure you configure your IP address if running physically.

```bash
cd mobile
cp .env.example .env
npm install
npx expo start -c
```

_Required Environment Variables (`.env`):_

```
EXPO_PUBLIC_API_URL=http://<YOUR_LOCAL_NETWORK_IP>:8000/api
EXPO_PUBLIC_SOLANA_NETWORK=devnet
```

### 3. Running on your device

- **Dev mode**: Install the `Expo Go` app on your Android Phone. Scan the QR code given by `npx expo start`.
- **Native APK Build**:
  Since this app uses native modules (Solana MWA, Camera packages), we highly recommend building it into a standalone APK for the best performance and functionality:
  ```bash
  eas build -p android --profile preview
  ```

## Hackathon Specifics Checklist

- [x] Functional Android APK -> (`eas build`)
- [x] Meaningful Network Interactions -> App creates live blockchain transactions.
- [x] Built for Mobile -> Entirely native React Navigation with deep-linking protocols.

## Screenshots and Demo

<Insert Demo Video Link Here>

<Insert Pitch Deck Link Here>
