import React from 'react';
import { temperatureToColor } from '../utils/colorUtils';

interface ColorBarProps {
  minTemp: number;
  maxTemp: number;
}

export function ColorBar({ minTemp, maxTemp }: ColorBarProps) {
  const steps = 100;
  const tempRange = maxTemp - minTemp;
  const stepSize = tempRange / steps;

  const gradientStops = Array.from({ length: steps }, (_, i) => {
    const temp = minTemp + (i * stepSize);
    const color = temperatureToColor(temp);
    return `${color.getStyle()} ${(i / (steps - 1)) * 100}%`;
  }).join(', ');

  return (
    <div style={{
      position: 'fixed',
      bottom: '1rem',
      right: '1rem',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      padding: '1rem',
      borderRadius: '8px',
      color: 'white',
      zIndex: 1000,
    }}>
      <div style={{
        width: '200px',
        height: '20px',
        background: `linear-gradient(to right, ${gradientStops})`,
        borderRadius: '4px',
        marginBottom: '0.5rem',
      }} />
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: '0.8rem',
      }}>
        <span>{Math.round(minTemp)}K</span>
        <span>Star Temperature</span>
        <span>{Math.round(maxTemp)}K</span>
      </div>
    </div>
  );
} 