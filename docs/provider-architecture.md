# Tirazis Computer — Commerce Provider Architecture (`docs/provider-architecture.md`)

## 1. Provider Abstraction Contract (`CommerceProvider`)

All UI components, route handlers, the PC Builder compatibility engine, and product comparison views consume the normalized `CommerceProvider` contract defined in `src/lib/commerce/types.ts`:

```ts
export interface CommerceProvider {
  readonly id: string;
  readonly name: string;
  getProducts(input: ProductQuery): Promise<ProductPage>;
  getProductBySlug(slug: string): Promise<Product | null>;
  getCategories(): Promise<Category[]>;
  getBrands(): Promise<Brand[]>;
  searchProducts(input: SearchQuery): Promise<ProductPage>;
  getPosts(limit?: number): Promise<EditorialPost[]>;
  getHealth(): Promise<ProviderHealth>;
}
```

## 2. Active Provider & Registry (`providerRegistry`)

- `WordPressWooCommerceProvider` (`src/lib/commerce/wordpressProvider.ts`) is the primary production commerce provider connecting to `WORDPRESS_URL` (`https://utirazis.flywheelsites.com`) and `WPGRAPHQL_URL` (`https://utirazis.flywheelsites.com/graphql`).
- `providerRegistry` (`src/lib/commerce/providerRegistry.ts`) manages registered providers and exposes `getActiveCommerceProvider()`.
- When `WORDPRESS_BASIC_PASSWORD` is configured in AI Studio Secrets (or `.env`), `WordPressWooCommerceProvider` authenticates against Flywheel's Basic Auth layer on the server, queries WPGraphQL and WooCommerce Store API `/wp-json/wc/store/v1/`, flags any WooCommerce demo apparel items (`isDemoProduct: true`), and serves normalized `Product` entities.
- When the remote WordPress instance returns `401 Basic Auth Required` (because `WORDPRESS_BASIC_PASSWORD` has not yet been entered in Secrets) or experiences a temporary outage, the provider surfaces the exact HTTP/GraphQL diagnostic in `ProviderHealth` and clearly marks any fallback hardware catalog records with epistemic provenance badges (`[Live WooCommerce]` vs. `[Verified Hardware Reference Seed — Awaiting WP Basic Auth Secret]`) so the storefront, PC Builder, and automated tests remain fully functional without ever faking live connection status.
