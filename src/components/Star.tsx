import React, { memo, useState, useMemo, useRef, useEffect, Suspense } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { Text, Billboard } from '@react-three/drei';
import { ExoplanetSystem } from '../types/Exoplanet';
import { Planets } from './Planets';
import { FilterOption } from './FilterPanel';
import { getViridisColor } from '../utils/colorUtils';

// Global texture singleton for all stars to share
let globalStarTexture: THREE.Texture | null = null;
let isLoadingGlobalTexture = false;

// Create a radial gradient texture for the glow
const glowTexture = (() => {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
  gradient.addColorStop(0.2, 'rgba(255, 255, 255, 0.3)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
})();

interface StarProps {
  system: ExoplanetSystem;
  scale: number;
  isFar: boolean;
  onClick: () => void;
  onDoubleClick: () => void;
  onPlanetDoubleClick?: (system: ExoplanetSystem, planetIndex: number) => void;
  registerPlanetAngle?: (systemName: string, planetIndex: number, angle: number) => void;
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
  const showImage = distanceToCamera < 2; // Only load textures when very close
  const showGlow = distanceToCamera >= 2; // Glow effect for all non-close stars
  
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
  
  // Maximum star size should be 1/3 of the closest perihelion
  const maxStarSize = closestPerihelion / 3;
  
  // Calculate scale factor based on slider (0 to 1)
  const sliderRange = props.systemMaxScale - 1;
  const t = Math.max(0, Math.min(1, (props.sizeScale - 1) / sliderRange));
  
  // Final radius combines real size and maximum allowed scale, capped by closest perihelion
  const starRadius = useMemo(() => {
    if (distanceToCamera <= 0.01) {
      // When very close, scale up to max allowed size based on slider
      const maxScaleFactor = maxStarSize / realSizeInParsecs;
      return realSizeInParsecs * (1 + t * maxScaleFactor);
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
  }, [distanceToCamera, realSizeInParsecs, t, maxStarSize]);

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

  // Only load textures when we're actually showing them
  useEffect(() => {
    if (showImage && !starTexture && !isLoadingTexture) {
      setIsLoadingTexture(true);
      
      const textureLoader = new THREE.TextureLoader();
      textureLoader.load(
        '/images/2k_sun.jpg',
        (texture) => {
          // Configure texture for optimal appearance
          texture.flipY = false;
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.RepeatWrapping;
          texture.minFilter = THREE.LinearFilter;
          texture.magFilter = THREE.LinearFilter;
          texture.anisotropy = 16; // Increase anisotropy for better quality when viewed at an angle
          texture.needsUpdate = true;
          setStarTexture(texture);
          setIsLoadingTexture(false);
        },
        undefined,
        (error) => {
          console.error("Error loading star texture:", error);
          setIsLoadingTexture(false);
        }
      );
    }
  }, [showImage, starTexture, isLoadingTexture]);

  // Use a global texture for all stars (singleton pattern)
  useEffect(() => {
    // Only load the global texture when we might show images
    if (showImage && !globalStarTexture && !isLoadingGlobalTexture) {
      isLoadingGlobalTexture = true;
      
      const textureLoader = new THREE.TextureLoader();
      textureLoader.load(
        '/images/2k_sun.jpg', 
        (texture) => {
          texture.flipY = false;
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.RepeatWrapping;
          texture.minFilter = THREE.LinearFilter;
          texture.magFilter = THREE.LinearFilter;
          texture.anisotropy = 16;
          texture.needsUpdate = true;
          globalStarTexture = texture;
          isLoadingGlobalTexture = false;
          // Update this star's texture too
          if (!starTexture) {
            setStarTexture(texture);
          }
        },
        undefined,
        (error) => {
          console.error("Error loading global star texture:", error);
          isLoadingGlobalTexture = false;
        }
      );
    } else if (showImage && globalStarTexture && !starTexture) {
      // Use already loaded global texture
      setStarTexture(globalStarTexture);
    }
  }, [starTexture, showImage]);

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

  const pointLightElement = showImage && (
    <pointLight
      color={color}
      intensity={2}
      distance={50}
      decay={2}
    />
  );

  // Render based on distance
  return (
    <group position={props.position}>
      {pointLightElement}
      
      {showImage ? (
        // Close stars with texture
        <Suspense fallback={
          <mesh scale={[starRadius, starRadius, starRadius]}>
            <sphereGeometry args={[1, 32, 32]} />
            <meshBasicMaterial
              color={color}
              transparent={props.isFiltered}
              opacity={props.isFiltered ? 0.3 : 1}
            />
          </mesh>
        }>
          <mesh
            onPointerOver={() => setHovered(true)}
            onPointerOut={() => setHovered(false)}
            onClick={props.onClick}
            onDoubleClick={props.onDoubleClick}
            scale={[starRadius, starRadius, starRadius]}
          >
            <sphereGeometry args={[1, 64, 64]} /> {/* Higher resolution geometry */}
            <meshBasicMaterial
              map={starTexture || globalStarTexture}
              color={new THREE.Color(0xFFFFFF).multiplyScalar(props.isFiltered ? 0.75 : 2.5)} /* Adjust brightness based on filter */
              transparent={props.isFiltered}
              opacity={props.isFiltered ? 0.3 : 1}
              side={THREE.DoubleSide}
              alphaTest={0.1} /* Prevent z-fighting */
              depthWrite={true} /* Ensure proper depth sorting */
              depthTest={true}
            />
          </mesh>
        </Suspense>
      ) : showGlow ? (
        // Medium-distance and far stars with glow effect
        <>
          {/* Core star */}
          <mesh
            onPointerOver={() => setHovered(true)}
            onPointerOut={() => setHovered(false)}
            onClick={props.onClick}
            onDoubleClick={props.onDoubleClick}
            scale={[starRadius, starRadius, starRadius]}
          >
            <sphereGeometry args={[1, 16, 16]} />
            <meshBasicMaterial
              color={color.clone().multiplyScalar(props.isFiltered ? 0.2 : 1)}
              transparent={props.isFiltered}
              opacity={props.isFiltered ? 0.3 : 1}
              depthWrite={!props.isFiltered}
            />
          </mesh>
          
          {/* Gradient glow effect */}
          <Billboard>
            <mesh scale={[starRadius * 8.0, starRadius * 8.0, 1]}>
              <planeGeometry args={[1, 1]} />
              <meshBasicMaterial
                color={color}
                transparent={true}
                opacity={props.isFiltered ? 0.09 : 1.0}
                depthWrite={false}
                side={THREE.DoubleSide}
                map={glowTexture}
                alphaMap={glowTexture}
                blending={THREE.AdditiveBlending}
              />
            </mesh>
          </Billboard>
        </>
      ) : (
        // Empty group for consistency
        <group />
      )}

      <Planets 
        system={system} 
        visible={showPlanets} 
        isPaused={props.isPaused} 
        starRadius={starRadius}
        sizeScale={props.sizeScale}
        systemMaxScale={props.systemMaxScale}
        planetScaleRatio={props.planetScaleRatio}
        onPlanetDoubleClick={props.onPlanetDoubleClick}
        registerPlanetAngle={props.registerPlanetAngle}
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