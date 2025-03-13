import * as THREE from 'three';

/**
 * Maps a temperature value to a color on a red-white-blue scale using logarithmic scaling.
 * Red represents cooler stars, blue represents hotter stars.
 * @param temp Temperature in Kelvin
 * @returns THREE.Color object
 */
export function temperatureToColor(temp: number): THREE.Color {
  // Get the temperature range from our dataset
  const range = (window as any).starTemperatureRange || { min: 2000, max: 12000 };
  const { min, max } = range;
  
  // Convert to log space
  const logTemp = Math.log10(temp);
  const logMin = Math.log10(min);
  const logMax = Math.log10(max);
  
  // Normalize temperature to 0-1 range in log space
  const t = Math.max(0, Math.min(1, (logTemp - logMin) / (logMax - logMin)));
  
  // Convert to RGB (values between 0 and 1 for THREE.Color)
  let r, g, b;
  
  if (t <= 0.5) {
    // Red to White (cool to medium)
    const u = t * 2;
    r = 1;      // Full red
    g = u;      // Increasing green
    b = u;      // Increasing blue
  } else {
    // White to Blue (medium to hot)
    const u = (t - 0.5) * 2;
    r = 1 - u;  // Decreasing red
    g = 1 - u;  // Decreasing green
    b = 1;      // Full blue
  }
  
  return new THREE.Color(r, g, b);
} 