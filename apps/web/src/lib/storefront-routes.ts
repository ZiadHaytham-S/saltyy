// Store URLs live here so future host routing can reuse the same storefront.
// No Host header or browser storeId is used to authorize data access.
export function storePath(slug: string) {
  return '/store/' + encodeURIComponent(slug);
}
export function productPath(storeSlug: string, productSlug: string) {
  return storePath(storeSlug) + '/products/' + encodeURIComponent(productSlug);
}
