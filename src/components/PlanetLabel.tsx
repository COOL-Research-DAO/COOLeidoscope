import React, { useRef, useState } from 'react';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';

interface PlanetLabelProps {
  name: string;
  position: THREE.Vector3;
  planetRadius?: number;
  visible: boolean;
}

export function PlanetLabel({ name, position, planetRadius = 0.0001, visible }: PlanetLabelProps) {
  if (!visible) return null;
  
  const { camera } = useThree();
  const [screenPosition, setScreenPosition] = useState({ x: 0, y: 0, isVisible: false });
  const labelRef = useRef<HTMLDivElement>(null);
  
  // Fixed pixel offset (the label will be this many pixels above the planet)
  const PIXEL_OFFSET_Y = 35;
  
  // Track planet position and update HTML overlay position
  useFrame(() => {
    if (!visible) return;
    
    // Project planet position to 2D screen space
    const planetPos = new THREE.Vector3(position.x, position.y, position.z);
    const vector = planetPos.project(camera);
    
    // Convert to normalized device coordinates
    const x = (vector.x * 0.5 + 0.5);
    const y = -(vector.y * 0.5) + 0.5; // Y is inverted in NDC
    
    // Check if the point is in front of the camera
    const isVisible = vector.z > -1 && vector.z < 1;
    
    setScreenPosition({ x, y, isVisible });
  });
  
  return (
    <Html
      fullscreen
      zIndexRange={[999, 999]} // Ensure it's always on top
      style={{ pointerEvents: 'none' }} // Don't block mouse events
    >
      {screenPosition.isVisible && (
        <div
          ref={labelRef}
          style={{
            position: 'absolute',
            top: `calc(${screenPosition.y * 100}% - ${PIXEL_OFFSET_Y}px)`, 
            left: `${screenPosition.x * 100}%`,
            transform: 'translate(-50%, -50%)', // Center the text on the point
            color: 'white',
            fontSize: '24px', // Smaller than star labels (24px)
            textShadow: '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 2px 2px 3px rgba(0,0,0,0.5)',
            whiteSpace: 'nowrap',
            userSelect: 'none',
            zIndex: 1000
          }}
        >
          {name}
        </div>
      )}
    </Html>
  );
}
