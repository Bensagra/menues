// URL pública de una imagen procesada (bucket public-media).
export function publicMediaUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  return `${base}/storage/v1/object/public/public-media/${path.split("/").map(encodeURIComponent).join("/")}`;
}
