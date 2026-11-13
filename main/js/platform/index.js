/**
 * Platform adapter selection.
 *
 * The UI only ever talks to this interface, so every platform-dependent feature
 * (notifications, reminders, file export, theme) has exactly one implementation
 * per platform and never "works on the web but not in the APK".
 */

import { createWebPlatform } from './web.js';
import { createNativePlatform, nativeAvailable } from './native.js';

export function createPlatform(env = {}) {
  const win = env.window || (typeof window !== 'undefined' ? window : null);
  if (nativeAvailable(win)) {
    try {
      return createNativePlatform({ window: win });
    } catch (error) {
      // A failing bridge must never take the app down: fall back to the web one.
      // eslint-disable-next-line no-console
      console.error('[DELIES] native bridge failed, using web platform', error);
    }
  }
  return createWebPlatform({ window: win, navigator: env.navigator });
}
