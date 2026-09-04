/** App handle from apps/web/shopify.app.toml — the slug in Admin app URLs. */
export const APP_HANDLE = 'drseller-alpha';

/** Strip protocol/trailing slash and the .myshopify.com suffix. */
export function storeHandleOf(shop: string) {
  return shop
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '')
    .replace(/\.myshopify\.com$/i, '');
}

/**
 * Where a merchant must land after install: the app running inside the Admin.
 * Shopify requires embedded apps to open in the Admin, not on an external page.
 *
 * The embedded UI itself is apps/storefront, served at the domain root — this
 * package only handles OAuth, webhooks and /privacy.
 */
export function buildAdminAppUrl(shop: string, appHandle = APP_HANDLE) {
  return `https://admin.shopify.com/store/${storeHandleOf(shop)}/apps/${appHandle}`;
}
