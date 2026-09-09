import type { SurfaceProfile } from './types';

export const surfaces = {
  mobilePortrait: {
    id: 'mobile-portrait',
    label: 'Mobile portrait',
    width: 360,
    height: 640,
    safeArea: { top: 18, right: 18, bottom: 18, left: 18 },
    touchOnly: true,
    minTapTarget: 44,
    viewingDistance: 'near',
  },
  mobileLandscape: {
    id: 'mobile-landscape',
    label: 'Mobile landscape — constrained',
    width: 640,
    height: 300,
    safeArea: { top: 14, right: 18, bottom: 14, left: 18 },
    touchOnly: true,
    minTapTarget: 44,
    viewingDistance: 'near',
  },
  broadcastLowerThird: {
    id: 'broadcast-lower-third',
    label: 'Broadcast lower-third',
    width: 1920,
    height: 250,
    safeArea: { top: 22, right: 96, bottom: 22, left: 96 },
    touchOnly: false,
    viewingDistance: 'far',
    minTextSize: 32,
  },
  squareRetailKiosk: {
    id: 'square-retail-kiosk',
    label: 'Square retail kiosk',
    width: 1080,
    height: 1080,
    safeArea: { top: 54, right: 54, bottom: 54, left: 54 },
    touchOnly: true,
    minTapTarget: 60,
    viewingDistance: 'near',
  },
} satisfies Record<string, SurfaceProfile>;

export type SurfaceKey = keyof typeof surfaces;
