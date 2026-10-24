# Tirazis Computer — Setup & Deployment Guide (`docs/setup-guide.md`)

## 1. Environment Variables

Configure the following server-only variables in AI Studio **Settings -> Secrets** (or `.env.local` for local development):

```env
WORDPRESS_URL=https://utirazis.flywheelsites.com
WPGRAPHQL_URL=https://utirazis.flywheelsites.com/graphql

WORDPRESS_BASIC_USER=flywheel
WORDPRESS_BASIC_PASSWORD=<your-flywheel-privacy-password>

WOOCOMMERCE_CONSUMER_KEY=<optional-wc-rest-key>
WOOCOMMERCE_CONSUMER_SECRET=<optional-wc-rest-secret>

NEXT_PUBLIC_SITE_URL=http://localhost:3000
GEMINI_API_KEY=<injected-by-ai-studio>
```

## 2. Running Verification, Tests, and Production Build

1. **Unit & Integration Tests (`node:test` via `tsx`)**:
   ```bash
   npx --yes tsx --test src/lib/commerce/commerce.test.ts
   ```
2. **Firestore Security Rules Lint**:
   ```bash
   npx eslint firestore.rules
   ```
3. **TypeScript & Production Build**:
   ```bash
   npm run lint
   npm run build
   ```
4. **Development / Production Server (Port 3000)**:
   ```bash
   npm run dev
   ```
