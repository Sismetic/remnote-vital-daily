/** No user data: dimensions only. A hidden index iframe has zero viewport. */
export function popupDimensions(screenWidth: number, screenHeight: number, userAgent = '') {
  const mobile = /Android|iPhone|iPad|iPod/i.test(userAgent) || screenWidth <= 600;
  return mobile
    ? { width: '100%' as const, height: Math.max(280, Math.min(720, screenHeight - 100)) }
    : { width: 1000, height: 720 };
}
