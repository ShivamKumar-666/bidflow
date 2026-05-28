# BidFlow Frontend — React + Vite Client

This directory contains the source code for the BidFlow web client, built using React, Vite, and designed with a premium glassmorphic visual aesthetic.

## 🌟 Key Features

- **Dynamic Glassmorphism Design System**: Harmonious tailorable colors, blur effects, gradients, and custom animations.
- **Bi-directional Layout & Multi-lingual**: Powered by `react-i18next` with support for English, Hindi, Gujarati, Spanish, French, German, and RTL Arabic.
- **Two-Factor Authentication (2FA) Setup Flow**: Interactive Admin QR Code scanner, backup-code handling, and temporary authentication token validation.
- **Real-Time Notification Centre**: Dynamic dropdown feed in the navigation bar triggered by WebSocket events.
- **Interactive Calendar View**: Shows upcoming bid submission dates with prioritized tag cues.
- **Public Customer Portal**: Shared view of enquiry progression that completely hides backend ML parameters and has 90-day automatic token expiration.

## 📂 Project Structure

```text
frontend/
├── public/                 # Static assets
├── src/
│   ├── assets/             # Brand logos and images
│   ├── components/         # Reusable UI components (Navbar, ProtectedRoute)
│   ├── contexts/           # React context providers (AuthContext, NotificationContext)
│   ├── i18n/               # Translation dictionary JSON files
│   ├── pages/              # Router page views (Dashboard, Login, Profile, etc.)
│   ├── services/           # Axios API client config with auto-retry interceptor
│   ├── App.jsx             # Client routing and context provider nesting
│   ├── index.css           # Global typography, colors, and styling systems
│   └── main.jsx            # React root entrypoint
├── eslint.config.js        # ESLint code style config
├── package.json            # NPM dependencies and run scripts
└── vite.config.js          # Vite compilation & proxy configuration
```

## 🛠️ Local Setup

1. Make sure you have [Node.js](https://nodejs.org/) installed (v18+ recommended).
2. Install npm dependencies:
   ```bash
   npm install
   ```
3. Run the development server locally:
   ```bash
   npm run dev
   ```
   The client will be running at `http://localhost:5173`.

## 🔒 Security Hardening

- **Origin Restrictions**: The server-side CORS and Socket.IO configuration explicitly white-lists requests originating from the client (`http://localhost:5173`).
- **Submit Debouncing**: Form submission buttons (such as bid creations) are dynamically debounced and disabled while requests are active to prevent double-click creation actions.
- **Secure Route Protection**: The client-side `ProtectedRoute` intercepts and redirects unauthorized requests, validating user scopes for executive vs. admin layout views.
