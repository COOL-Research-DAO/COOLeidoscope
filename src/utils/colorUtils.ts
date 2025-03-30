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

// Viridis color map
export const VIRIDIS_COLORS = [
  new THREE.Color('rgb(68, 1, 84)'),    // Dark purple
  new THREE.Color('rgb(72, 36, 117)'),  // Purple
  new THREE.Color('rgb(65, 68, 135)'),  // Blue
  new THREE.Color('rgb(53, 95, 141)'),  // Light blue
  new THREE.Color('rgb(42, 120, 142)'), // Cyan
  new THREE.Color('rgb(33, 145, 140)'), // Teal
  new THREE.Color('rgb(38, 168, 133)'), // Green
  new THREE.Color('rgb(65, 189, 109)'), // Light green
  new THREE.Color('rgb(123, 204, 71)'), // Lime
  new THREE.Color('rgb(193, 212, 33)')  // Yellow
];

export function getViridisColor(value: number | null | undefined, minValue: number, maxValue: number, useLog = true): THREE.Color {
  // Handle unknown values
  if (value === null || value === undefined || isNaN(value)) {
    return new THREE.Color(0xCCCCCC); // Light grey for unknown values
  }

  let t;
  if (useLog) {
    // Log scale normalization with protection against zero/negative values
    const epsilon = 1e-10;
    const logValue = Math.log(Math.max(epsilon, value));
    const logMin = Math.log(Math.max(epsilon, minValue));
    const logMax = Math.log(Math.max(epsilon, maxValue));
    t = (logValue - logMin) / (logMax - logMin);
  } else {
    t = (value - minValue) / (maxValue - minValue);
  }
  
  t = Math.max(0, Math.min(1, t));
  const index = Math.min(Math.floor(t * (VIRIDIS_COLORS.length - 1)), VIRIDIS_COLORS.length - 2);
  const nextIndex = index + 1;
  const localT = (t * (VIRIDIS_COLORS.length - 1)) - index;
  
  const result = new THREE.Color();
  return result.copy(VIRIDIS_COLORS[index]).lerp(VIRIDIS_COLORS[nextIndex], localT);
} 