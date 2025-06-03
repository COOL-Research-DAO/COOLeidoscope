import React, { useRef, useState, useEffect } from 'react';
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
    
    // Calculate top point of the planet based on its radius
    const topOfPlanet = planetPos.clone().add(new THREE.Vector3(0, planetRadius, 0));
    
    // Project both the center and top of the planet to screen space
    const centerVector = planetPos.clone().project(camera);
    const topVector = topOfPlanet.clone().project(camera);
    
    // Calculate screen coordinates
    const centerX = (centerVector.x * 0.5 + 0.5);
    const centerY = -(centerVector.y * 0.5) + 0.5; // Y is inverted in NDC
    
    const topY = -(topVector.y * 0.5) + 0.5;
    
    // Calculate the screen height of the planet in relative units
    const screenHeight = Math.abs(topY - centerY);
    
    // Calculate window height in pixels
    const windowHeight = window.innerHeight;
    
    // Convert screenHeight to pixels
    const planetHeightInPixels = screenHeight * windowHeight;
    
    // Calculate the final position with the fixed pixel offset
    const finalY = centerY - (PIXEL_OFFSET_Y / windowHeight);
    
    // Check if the point is in front of the camera
    const isVisible = centerVector.z > -1 && centerVector.z < 1;
    
    setScreenPosition({ x: centerX, y: finalY, isVisible });
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
            top: `${screenPosition.y * 100}%`, 
            left: `${screenPosition.x * 100}%`,
            transform: 'translate(-50%, -100%)', // Center horizontally, position above
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
