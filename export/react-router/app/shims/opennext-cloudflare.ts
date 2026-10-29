export async function getCloudflareContext(): Promise<never> {
  throw new Error("Cloudflare bindings are not available in the Netlify export");
}
