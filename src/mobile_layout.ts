/** No user data: dimensions and runtime routing only. */
export function isMobileDevice(screenWidth: number, userAgent = ''): boolean {
  return /Android|iPhone|iPad|iPod/i.test(userAgent) || screenWidth <= 600;
}

export function shouldReconcilePriorityTags(screenWidth: number, userAgent = ''): boolean {
  return !isMobileDevice(screenWidth, userAgent);
}

export function popupDimensions(screenWidth: number, screenHeight: number, userAgent = '') {
  const mobile = isMobileDevice(screenWidth, userAgent);
  return mobile
    ? { width: '100%' as const, height: Math.max(280, Math.min(720, screenHeight - 100)) }
    : { width: 1000, height: 720 };
}
