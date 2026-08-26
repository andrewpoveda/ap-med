export const SITE_URL = "https://ap-med.org";
export const SITE_NAME = "AP MED Mentors";

export function absoluteUrl(path = "/") {
  const normalizedPath = path === "/" ? "" : `/${path.replace(/^\/+|\/+$/g, "")}`;
  return `${SITE_URL}${normalizedPath}`;
}
