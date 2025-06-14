import { useThree, useFrame } from '@react-three/fiber';
import { useEffect, useState } from 'react';
import { create } from 'zustand';

// Create a store to share the scale between 3D and HTML contexts
interface ScaleStore {
  scale: { astro: string; light: string };
  setScale: (scale: { astro: string; light: string }) => void;
}

const useScaleStore = create<ScaleStore>((set: any) => ({
  scale: { astro: '1 pc', light: '3.26 ly' },
  setScale: (scale: { astro: string; light: string }) => set({ scale }),
}));

function formatDistance(parsecs: number): { astro: string; light: string } {
  const au = parsecs * 206265;
  const lightYears = parsecs * 3.26156;
  const lightDays = lightYears * 365.25;
  const lightMinutes = lightDays * 24 * 60;

  if (parsecs >= 0.01) {
    return {
      astro: `${parsecs.toFixed(2)} pc`,
      light: `${lightYears.toFixed(2)} ly`
    };
  } else if (au >= 0.01) {
    if (lightDays >= 0.01) {
      return {
        astro: `${au.toFixed(2)} AU`,
        light: `${lightDays.toFixed(2)} light days`
      };
    } else {
      return {
        astro: `${au.toFixed(2)} AU`,
        light: `${lightMinutes.toFixed(2)} light minutes`
      };
    }
  } else {
    // Convert AU to km (1 AU = 149,597,870.7 km)
    const km = au * 149597870.7;
    return {
      astro: `${Math.round(km)} km`,
      light: `${lightMinutes.toFixed(2)} light minutes`
    };
  }
}

// This component lives inside the Canvas
export function ScaleBarUpdater() {
  const { camera } = useThree();
  const setScale = useScaleStore((state) => state.setScale);

  useFrame(() => {
    const distance = camera.position.length() / 5;
    setScale(formatDistance(distance));
  });

  return null;
}

// This component lives outside the Canvas
export function ScaleBar() {
  const scale = useScaleStore((state) => state.scale);

  return (
    <div style={{
      position: 'absolute',
      bottom: '40px',
      left: '50%',
      transform: 'translateX(-50%)',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      padding: '10px',
      borderRadius: '4px',
      color: 'white',
      fontSize: '14px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '4px',
      zIndex: 1000,
    }}>
      <div style={{
        width: '200px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '4px',
      }}>
        <div style={{
          width: '100%',
          height: '2px',
          backgroundColor: 'white',
          position: 'relative',
        }}>
          <div style={{
            position: 'absolute',
            left: 0,
            height: '8px',
            width: '2px',
            backgroundColor: 'white',
            transform: 'translateY(-3px)',
          }} />
          <div style={{
            position: 'absolute',
            right: 0,
            height: '8px',
            width: '2px',
            backgroundColor: 'white',
            transform: 'translateY(-3px)',
          }} />
        </div>
        <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between' }}>
          <div>{scale.astro}</div>
          <div>{scale.light}</div>
        </div>
      </div>
    </div>
  );
} 