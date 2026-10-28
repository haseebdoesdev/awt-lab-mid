/** Thin wrappers around the Notifications and Badging web APIs. */

export const notificationsSupported = () => typeof window !== 'undefined' && 'Notification' in window;

export function notificationPermission(): NotificationPermission | 'unsupported' {
  return notificationsSupported() ? Notification.permission : 'unsupported';
}

export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!notificationsSupported()) return 'unsupported';
  return Notification.requestPermission();
}

export function showNotification(title: string, body: string, tag: string, onClick: () => void) {
  if (notificationPermission() !== 'granted') return;
  const notification = new Notification(title, { body, tag, icon: '/favicon.svg' });
  notification.onclick = () => {
    window.focus();
    onClick();
    notification.close();
  };
}

/** Shows the unread total on the installed-app / tab icon where supported. */
export function setAppBadge(count: number) {
  const nav = navigator as Navigator & {
    setAppBadge?: (count?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  const result = count > 0 ? nav.setAppBadge?.(count) : nav.clearAppBadge?.();
  result?.catch(() => undefined);
}
