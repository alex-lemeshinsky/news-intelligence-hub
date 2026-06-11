function trimTrailingSlash(path: string): string {
  if (path.length > 1 && path.endsWith("/")) {
    return path.slice(0, -1);
  }

  return path;
}

export function isWorkspaceNavItemActive(
  pathname: string,
  href: string,
): boolean {
  const normalizedPathname = trimTrailingSlash(pathname);
  const normalizedHref = trimTrailingSlash(href);

  if (normalizedHref === "/workspace") {
    return normalizedPathname === normalizedHref;
  }

  return (
    normalizedPathname === normalizedHref ||
    normalizedPathname.startsWith(`${normalizedHref}/`)
  );
}
