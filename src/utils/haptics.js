import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

const isNativeIOS = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';

const triggerImpact = async (style = ImpactStyle.Light) => {
  if (!isNativeIOS()) return;

  try {
    await Haptics.impact({ style });
  } catch {
    // Ignore haptic failures so UI interactions still complete.
  }
};

export const triggerLightHaptic = () => triggerImpact(ImpactStyle.Light);
export const triggerMediumHaptic = () => triggerImpact(ImpactStyle.Medium);
