import React from 'react';
import { VIRIDIS_COLORS } from '../utils/colorUtils';

interface ColorLegendProps {
  field: string;
  min: number;
  max: number;
}

export function ColorLegend({ field, min, max }: ColorLegendProps) {
  const colors = VIRIDIS_COLORS.map(color => color.getStyle());
  
  return (
    <div style={{
      position: 'fixed',
      right: '320px',
      bottom: '20px',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      padding: '10px',
      borderRadius: '4px',
      color: 'white',
      width: '200px',
    }}>
      <div style={{ marginBottom: '5px' }}>{field}</div>
      <div style={{
        height: '20px',
        background: `linear-gradient(to right, ${colors.join(', ')})`,
        borderRadius: '2px',
        marginBottom: '5px'
      }} />
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: '12px'
      }}>
        <span>{min.toFixed(2)}</span>
        <span>{max.toFixed(2)}</span>
      </div>
    </div>
  );
} 