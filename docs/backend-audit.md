# Tirazis Computer — Phase 1 Backend Discovery & Audit (`docs/backend-audit.md`)

**Date of Live Inspection:** 2026-10-24  
**Target WordPress Base URL:** `https://utirazis.flywheelsites.com`  
**Target WPGraphQL Endpoint:** `https://utirazis.flywheelsites.com/graphql`  
**Target WooCommerce Store API Base:** `https://utirazis.flywheelsites.com/wp-json/wc/store/v1/`

---

## 1. Live HTTP & Authentication Probe Results

During Phase 1 live probing from the server runtime against `https://utirazis.flywheelsites.com`, the following responses were recorded:

| Endpoint | HTTP Method | Unauthenticated Status | `WWW-Authenticate` Header | Finding |
| :--- | :--- | :--- | :--- | :--- |
| `/graphql` | `POST` | `401 Unauthorized` | `Basic realm="The username is 'flywheel'. Please enter your password.", charset="UTF-8"` | Protected by Flywheel edge HTTP Basic Auth |
| `/wp-json/wc/store/v1/products` | `GET` | `401 Unauthorized` | `Basic realm="The username is 'flywheel'. Please enter your password.", charset="UTF-8"` | Store API is also behind Flywheel edge HTTP Basic Auth |
| `/wp-json/wc/store/v1/cart` | `GET` | `401 Unauthorized` | `Basic realm="The username is 'flywheel'. Please enter your password.", charset="UTF-8"` | Cart/Session endpoints require server-side Basic Auth proxy |
| `/wp-json/` | `GET` | `401 Unauthorized` | `Basic realm="The username is 'flywheel'. Please enter your password.", charset="UTF-8"` | Core WP REST API & media routes share the same Basic Auth gate |

### Key Security & Architectural Implications
1. **Server-Only Basic Auth Forwarding**: Because Flywheel Privacy Mode protects `/graphql`, `/wp-json/wc/store/v1/*`, and media assets with HTTP Basic Authentication (`username: flywheel`), the browser **cannot** call WordPress or load `utirazis.flywheelsites.com` media directly without exposing credentials or triggering a browser Basic Auth dialog.
2. **Narrowly Allowlisted Media Proxy (`/api/media/proxy`)**: All remote product images hosted on `utirazis.flywheelsites.com` are routed through `/api/media/proxy?url=...`, which validates that the hostname strictly matches `utirazis.flywheelsites.com` and injects the `Authorization: Basic ...` header server-side.
3. **Cart Token & Nonce Proxy (`/api/cart/*` & `/api/checkout/*`)**: WooCommerce Store API session headers (`Cart-Token` and `Nonce` / `X-WC-Store-API-Nonce`) are persisted in `HttpOnly`, `SameSite=Lax` cookies managed by the server-side proxy routes and forwarded alongside the server's Basic Auth header.

---

## 2. WPGraphQL & WooGraphQL Schema Verification

Verified root query operations on the target instance:
- `RootQuery`: `products`, `product`, `productCategories`, `productAttributes`, `productBrands`, `productTypes`, `productVariations`, `mediaItems`, `posts`
- Verified minimal product query:
  ```graphql
  query TestProducts {
    products(first: 5) {
      nodes {
        id
        name
        slug
        __typename
      }
    }
  }
  ```
- **Multi-Tier Field Discovery & Fallback Strategy**:
  Because field-level availability in WPGraphQL / WooGraphQL varies depending on plugin version and whether `Product` is a union/interface (`SimpleProduct`, `VariableProduct`, `ExternalProduct`), `WordPressWooCommerceProvider` implements a 3-stage adaptive query strategy:
  1. **Stage 1 (Full WooGraphQL Inline Fragments + Store API Enrichment)**: Queries `products(first, after, where)` with inline fragments for `SimpleProduct`, `VariableProduct`, and `ExternalProduct` (`price`, `regularPrice`, `salePrice`, `stockStatus`, `sku`, `image { sourceUrl altText }`, `productCategories`, `attributes`), and cross-checks `/wp-json/wc/store/v1/products` when available because Store API v1 returns normalized `prices` (`price`, `regular_price`, `sale_price`, `currency_code`, `currency_minor_unit`), `is_in_stock`, `images`, and `attributes` in a uniform JSON schema.
  2. **Stage 2 (Minimal Verified GraphQL Query)**: Falls back automatically to the verified `id`, `name`, `slug`, `__typename` query if extended GraphQL fields return schema errors, Marking price/stock as `unknown` rather than inventing values.
  3. **Stage 3 (Explicit Demo Catalog Detection & Diagnostic Reporting)**: Inspects returned product names/slugs for generic WooCommerce sample items (e.g., *V-Neck T-Shirt*, *Sunglasses*, *Beanie*, *Hoodie*, *Cap*, *Belt*, *Album*, *Single*) and flags `containsDemoProducts: true` in the catalog audit banner so generic apparel/accessories are never silently misrepresented as computer hardware.

---

## 3. Currency, Stock, Shipping, and Payment Gateway Audit

- **Currency Handling**: Normalizes WooCommerce currency codes (`IRR` ریال, `IRT` تومان, `USD`) directly from the Store API `prices` payload without fabricating exchange rates or discounts.
- **Stock States**: Explicitly distinguishes four states:
  - `IN_STOCK` (Verified available)
  - `OUT_OF_STOCK` (Verified unavailable)
  - `ON_BACKORDER` (Backorder supported)
  - `UNKNOWN` (Field unavailable or unverified in current schema response)
- **Checkout & Payment Gateway Handoff**:
  - Before checkout submission, `/api/checkout/revalidate` recalculates live item prices, stock status, variation selection, coupons, taxes, shipping rates, and final payable total against `/wp-json/wc/store/v1/cart`.
  - When the installed WooCommerce payment gateway (e.g. ZarinPal, IDPay, Mellat, Saman, or WooCommerce hosted checkout) requires a redirect or 3-D Secure / Shaparak flow, the checkout handler returns the official WooCommerce `payment_result.redirect_url` or transfers the synchronized session to the official WooCommerce checkout endpoint rather than faking payment completion.
