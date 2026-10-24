import { AdminSettings, CommerceProvider } from './types';
import { WordPressWooCommerceProvider } from './wordpressProvider';

class ProviderRegistry {
  private providers = new Map<string, CommerceProvider>();
  private activeProviderId = 'wordpress-woocommerce';
  private settings: AdminSettings = {
    activeProvider: 'wordpress-woocommerce',
    catalogRevalidateSeconds: 60,
    priceStockRevalidateSeconds: 15,
    constrainedPageSize: 8,
    fastPageSize: 12,
    strictSocketCheck: true,
    hideDemoProductsByDefault: false,
    updatedAt: new Date().toISOString(),
  };

  constructor() {
    const wpProvider = new WordPressWooCommerceProvider();
    this.register(wpProvider);
  }

  public register(provider: CommerceProvider): void {
    this.providers.set(provider.id, provider);
  }

  public getActiveProvider(): CommerceProvider {
    const provider = this.providers.get(this.activeProviderId);
    if (!provider) {
      throw new Error(`CommerceProvider '${this.activeProviderId}' is not registered.`);
    }
    return provider;
  }

  public listProviders(): { id: string; name: string; active: boolean }[] {
    return Array.from(this.providers.values()).map((p) => ({
      id: p.id,
      name: p.name,
      active: p.id === this.activeProviderId,
    }));
  }

  public getSettings(): AdminSettings {
    return { ...this.settings };
  }

  public updateSettings(partial: Partial<AdminSettings>): AdminSettings {
    this.settings = {
      ...this.settings,
      ...partial,
      activeProvider: 'wordpress-woocommerce',
      updatedAt: new Date().toISOString(),
    };
    const wp = this.providers.get('wordpress-woocommerce');
    if (wp instanceof WordPressWooCommerceProvider) {
      wp.setCacheFreshnessSeconds(this.settings.catalogRevalidateSeconds);
    }
    return this.getSettings();
  }
}

export const providerRegistry = new ProviderRegistry();
export const getActiveCommerceProvider = (): CommerceProvider => providerRegistry.getActiveProvider();
