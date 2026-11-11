/** No user data: dimensions and runtime routing only. */
export function isMobileDevice(screenWidth: number, userAgent = ''): boolean {
  return /Android|iPhone|iPad|iPod/i.test(userAgent) || screenWidth <= 600;
}

export function isMobileRuntime(
  operatingSystem: string | undefined,
  screenWidth: number,
  userAgent = '',
): boolean {
  return operatingSystem === 'android' || operatingSystem === 'ios' ||
    isMobileDevice(screenWidth, userAgent);
}

export function isConfirmedDesktopRuntime(
  operatingSystem: string | undefined,
  screenWidth: number,
  userAgent = '',
  maxTouchPoints = 0,
  coarsePointer = false,
): boolean {
  const desktopOS = operatingSystem === 'mac' ||
    operatingSystem === 'windows' || operatingSystem === 'linux';
  return desktopOS && !isMobileDevice(screenWidth, userAgent) &&
    maxTouchPoints === 0 && !coarsePointer;
}

export function isFlashcardsHomeURL(url: string): boolean {
  try {
    return new URL(url, 'https://www.remnote.com').pathname.replace(/\/$/, '') ===
      '/flashcards_home';
  } catch {
    return false;
  }
}

export function popupDimensions(
  screenWidth: number,
  screenHeight: number,
  userAgent = '',
  mobileOverride?: boolean,
) {
  const mobile = mobileOverride ?? isMobileDevice(screenWidth, userAgent);
  return mobile
    ? { width: '100%' as const, height: Math.max(280, Math.min(720, screenHeight - 100)) }
    : { width: 1000, height: 720 };
}
