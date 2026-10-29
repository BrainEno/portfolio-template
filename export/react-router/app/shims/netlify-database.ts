export function getConnectionString() {
  const value = process.env.NETLIFY_DB_URL || process.env.DATABASE_URL;
  if (!value) throw new Error("Netlify Database is not configured");
  return value;
}
