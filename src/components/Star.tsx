import React, { memo, useState, useMemo, useRef, useEffect, Suspense } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { Text, Billboard } from '@react-three/drei';
import { ExoplanetSystem } from '../types/Exoplanet';
import { Planets } from './Planets';
import { FilterOption } from './FilterPanel';
import { getViridisColor } from '../utils/colorUtils';

interface StarProps {
  system: ExoplanetSystem;
  scale: number;
  isFar: boolean;
  onClick: () => void;
  onDoubleClick: () => void;
  isHighlighted?: boolean;
  isPaused: boolean;
  position: THREE.Vector3;
  sizeScale: number;
  isFiltered: boolean;
  colorByField: string | null;
  colorByValue: number | null;
  activeFilters: FilterOption[];
  systemMaxScale: number;
  planetScaleRatio: number;
}

const Star = memo(function Star({ system, colorByField, colorByValue, ...props }: StarProps) {
  const [hovered, setHovered] = useState(false);
  const { camera } = useThree();
  const [starTexture, setStarTexture] = useState<THREE.Texture | null>(null);
  const [isLoadingTexture, setIsLoadingTexture] = useState(false);
  
  const distanceToCamera = new THREE.Vector3(...props.position).distanceTo(camera.position);
  const showPlanets = distanceToCamera < 10; // Show planets within 10 parsecs
  const showImage = distanceToCamera < 2; // Increased threshold for better visibility
  
  // Calculate star radius using real astronomical scales
  const realStarRadius = system.st_rad || 1; // Solar radii, default to 1 if unknown
  const solarRadiusInAU = 0.00465047; // Solar radius in AU
  const realSizeInParsecs = (realStarRadius * solarRadiusInAU) / 206265; // Convert to parsecs
  
  // Find closest planet's perihelion to limit star size
  const closestPerihelion = Math.min(...system.planets.map(planet => {
    const semiMajorAxis = planet.pl_orbsmax || 
      (planet.pl_orbper ? Math.pow(planet.pl_orbper / 365, 2/3) : 1);
    const eccentricity = planet.pl_orbeccen || 0;
    return (semiMajorAxis * (1 - eccentricity)) / 206265; // Convert AU to parsecs
  }));
  
  // Maximum star size should be half the closest perihelion
  const maxScale = (closestPerihelion * 0.5) / realSizeInParsecs;
  
  // Calculate scale factor based on slider (0 to 1)
  const sliderRange = props.systemMaxScale - 1;
  const t = Math.max(0, Math.min(1, (props.sizeScale - 1) / sliderRange));
  
  // Final radius combines real size and maximum allowed scale
  const starRadius = useMemo(() => {
    if (distanceToCamera <= 0.01) {
      return realSizeInParsecs * (1 + t * maxScale);
    } else if (distanceToCamera <= 0.1) {
      // Transition between real size and standard scaling
      const t = (distanceToCamera - 0.01) / (0.1 - 0.01); // 0 to 1
      const standardSize = 0.004 * (1 + (1 - distanceToCamera) * 2);
      return realSizeInParsecs * (1 - t) + standardSize * t;
    } else if (distanceToCamera <= 1) {
      // Linear scaling between 0.1 and 1 parsecs
      return 0.004 * distanceToCamera;
    } else if (distanceToCamera <= 50) {
      // Linear scaling between 1 and 50 parsecs
      return 0.004 * distanceToCamera;
    } else {
      // Progressive decrease beyond 50 parsecs
      const t = (distanceToCamera - 50) / 50; // Factor for gradual decrease
      return 0.004 * 50 * Math.pow(0.9, t); // Decrease by 10% for each 50pc step
    }
  }, [distanceToCamera, realSizeInParsecs, t, maxScale]);

  // Calculate color (used for point light and fallback)
  const color = useMemo(() => {
    if (!colorByField || colorByValue === null) {
      return new THREE.Color(0xFFFF00); // Default yellow
    }
    
    const filter = props.activeFilters?.find(f => f.field === colorByField);
    const range = filter?.range;
    
    if (colorByField === 'planetCount') {
      const count = system.planets.length;
      return getViridisColor(count, range?.min || 1, range?.max || 10, false);
    }

    return getViridisColor(colorByValue, range?.min || 0, range?.max || 1, true);
  }, [colorByField, colorByValue, props.activeFilters, system.planets.length]);

  // Load star texture
  useEffect(() => {
    if (showImage && !starTexture && !isLoadingTexture) {
      setIsLoadingTexture(true);
      
      const textureLoader = new THREE.TextureLoader();
      textureLoader.load(
        '/images/2k_sun.jpg',
        (texture) => {
          texture.flipY = false;
          setStarTexture(texture);
          setIsLoadingTexture(false);
        },
        undefined,
        () => setIsLoadingTexture(false)
      );
    }
  }, [showImage, starTexture, isLoadingTexture]);

  // Common elements
  const labelElement = (hovered || props.isHighlighted) && (
    <Billboard>
      <Text
        position={[0, 2, 0]}
        fontSize={0.8}
        color="white"
        anchorX="center"
        anchorY="middle"
        renderOrder={1}
        outlineWidth={0.08}
        outlineColor="black"
      >
        {system.hostname}
      </Text>
    </Billboard>
  );

  const pointLightElement = (
    <pointLight
      color={color}
      intensity={2}
      distance={50}
      decay={2}
    />
  );

  // Render either sphere or image
  return (
    <group position={props.position}>
      {pointLightElement}
      
      {showImage ? (
        <Suspense fallback={null}>
          <mesh
            onPointerOver={() => setHovered(true)}
            onPointerOut={() => setHovered(false)}
            onClick={props.onClick}
            onDoubleClick={props.onDoubleClick}
            scale={[starRadius, starRadius, starRadius]}
          >
            <sphereGeometry args={[1, 32, 32]} />
            <meshBasicMaterial
              map={starTexture}
              color={0xFFFFFF}
              transparent={props.isFiltered}
              opacity={props.isFiltered ? 0.3 : 1}
              side={THREE.DoubleSide}
            />
          </mesh>
        </Suspense>
      ) : (
        <>
          <mesh
            onPointerOver={() => setHovered(true)}
            onPointerOut={() => setHovered(false)}
            onClick={props.onClick}
            onDoubleClick={props.onDoubleClick}
            scale={[starRadius, starRadius, starRadius]}
          >
            <sphereGeometry args={[1, 32, 32]} />
            <meshBasicMaterial
              color={color}
              transparent={true}
              opacity={props.isFiltered ? 0.3 : 1}
              depthWrite={!props.isFiltered}
            />
          </mesh>
        </>
      )}

      <Planets 
        system={system} 
        visible={showPlanets} 
        isPaused={props.isPaused} 
        starRadius={starRadius}
        sizeScale={props.sizeScale}
        systemMaxScale={props.systemMaxScale}
        planetScaleRatio={props.planetScaleRatio}
      />
      
      {labelElement}
    </group>
  );
}, (prevProps, nextProps) => {
  // Return false if any of these props change to trigger a re-render
  return (
    prevProps.system === nextProps.system &&
    prevProps.position.equals(nextProps.position) &&
    prevProps.colorByField === nextProps.colorByField &&
    prevProps.colorByValue === nextProps.colorByValue &&
    prevProps.sizeScale === nextProps.sizeScale &&
    prevProps.isFiltered === nextProps.isFiltered &&
    prevProps.isPaused === nextProps.isPaused &&
    prevProps.isHighlighted === nextProps.isHighlighted &&
    prevProps.isFar === nextProps.isFar &&
    prevProps.scale === nextProps.scale &&
    JSON.stringify(prevProps.activeFilters) === JSON.stringify(nextProps.activeFilters)
  );
});

export default Star; 