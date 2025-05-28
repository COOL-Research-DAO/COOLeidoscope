import React, { memo, useState, useMemo, useRef, useEffect, Suspense } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { Text, Billboard } from '@react-three/drei';
import { ExoplanetSystem } from '../types/Exoplanet';
import { Planets } from './Planets';
import { FilterOption } from './FilterPanel';
import { getViridisColor, temperatureToColor } from '../utils/colorUtils';

// Constants for habitable zone calculations
const HZ_CONSTANTS = {
  // Conservative habitable zone
  conservative: {
    inner: { S_eff: 1.1, a: 1.405e-4, b: 2.622e-8, c: 3.716e-12, d: -4.557e-16 },
    outer: { S_eff: 0.356, a: 6.171e-5, b: 1.698e-9, c: -3.198e-12, d: -5.575e-16 }
  },
  // Optimistic habitable zone
  optimistic: {
    inner: { S_eff: 1.5, a: 2.486e-4, b: 5.263e-8, c: 1.019e-11, d: -1.337e-15 },
    outer: { S_eff: 0.32, a: 5.547e-5, b: 1.527e-9, c: -2.874e-12, d: -5.011e-16 }
  }
};

// Calculate habitable zone distances based on stellar parameters
function calculateHabitableZone(teff: number, luminosity: number) {
  // If we don't have temperature, use approximation
  if (!teff) {
    // Default values
    return {
      conservative: { inner: 0.95 * Math.sqrt(luminosity), outer: 1.67 * Math.sqrt(luminosity) },
      optimistic: { inner: 0.75 * Math.sqrt(luminosity), outer: 1.77 * Math.sqrt(luminosity) }
    };
  }
  
  // Calculate scaled temperature difference from solar (5780K)
  const tStar = teff - 5780;
  
  // Calculate effective stellar flux for each boundary
  const calcSeff = (params: { S_eff: number, a: number, b: number, c: number, d: number }) => {
    const { S_eff, a, b, c, d } = params;
    return S_eff + a * tStar + b * tStar * tStar + c * Math.pow(tStar, 3) + d * Math.pow(tStar, 4);
  };
  
  // Calculate distances
  const conservativeInnerSeff = calcSeff(HZ_CONSTANTS.conservative.inner);
  const conservativeOuterSeff = calcSeff(HZ_CONSTANTS.conservative.outer);
  const optimisticInnerSeff = calcSeff(HZ_CONSTANTS.optimistic.inner);
  const optimisticOuterSeff = calcSeff(HZ_CONSTANTS.optimistic.outer);
  
  return {
    conservative: {
      inner: Math.sqrt(luminosity / conservativeInnerSeff),
      outer: Math.sqrt(luminosity / conservativeOuterSeff)
    },
    optimistic: {
      inner: Math.sqrt(luminosity / optimisticInnerSeff),
      outer: Math.sqrt(luminosity / optimisticOuterSeff)
    }
  };
}

// HabitableZone component to visualize the zone around a star
interface HabitableZoneProps {
  system: ExoplanetSystem;
  visible: boolean;
}

const HabitableZone = memo(({ system, visible }: HabitableZoneProps) => {
  if (!visible) return null;
  
  // Get star parameters
  const teff = system.st_teff || 5780; // Default to solar temperature if not available
  let luminosity = system.st_lum || null; // Get luminosity if available
  
  // If luminosity is missing, calculate it more accurately based on star type
  if (luminosity === null) {
    // Use radius if available (most accurate method via Stefan-Boltzmann law)
    if (system.st_rad) {
      // L/L☉ = (R/R☉)² × (T/T☉)⁴
      const t_ratio = teff / 5780;
      luminosity = Math.pow(system.st_rad, 2) * Math.pow(t_ratio, 4);
    } 
    // If radius is missing but mass is available, use mass-luminosity relation
    else if (system.st_mass) {
      if (system.st_mass < 0.43) {
        // M-dwarfs: L ∝ M^2.3 (for M < 0.43 M☉)
        luminosity = Math.pow(system.st_mass, 2.3);
      } else if (system.st_mass < 2) {
        // K, G, F dwarfs: L ∝ M^4 (for 0.43 < M < 2 M☉)
        luminosity = Math.pow(system.st_mass, 4);
      } else {
        // A, B stars: L ∝ M^3.5 (for 2 < M < 20 M☉)
        luminosity = Math.pow(system.st_mass, 3.5);
      }
    }
    // Last resort: estimate based on temperature alone
    else {
      // Based on temperature, identify stellar type and estimate luminosity
      if (teff < 3500) {
        // M dwarfs and ultracool dwarfs
        const normalizedTemp = Math.max(teff, 2300) / 5780;
        // For very cool stars, luminosity drops dramatically
        // This is a better approximation for M dwarfs and cooler
        luminosity = Math.pow(normalizedTemp, 7);
      } else if (teff < 5000) {
        // K dwarfs
        const normalizedTemp = teff / 5780;
        luminosity = Math.pow(normalizedTemp, 5);
      } else if (teff < 7000) {
        // G and F stars
        const normalizedTemp = teff / 5780;
        luminosity = Math.pow(normalizedTemp, 4);
      } else {
        // A, B, O stars
        const normalizedTemp = teff / 5780;
        luminosity = Math.pow(normalizedTemp, 3.5);
      }
    }
  }
  
  // Validate luminosity (safeguard against extreme values)
  luminosity = Math.max(0.000001, Math.min(1000000, luminosity));
  
  // Calculate habitable zone
  const hz = calculateHabitableZone(teff, luminosity);
  
  // Convert AU to parsecs (1 AU = 1/206265 parsecs)
  const auToParsec = 1/206265;
  
  // Remove scaleFactor - use actual physical sizes based on stellar parameters
  
  // Calculate conservative habitable zone
  const conservativeInner = hz.conservative.inner * auToParsec;
  const conservativeOuter = hz.conservative.outer * auToParsec;
  
  return (
    <group>
      {/* Conservative habitable zone (green color) - flat disk in ecliptic plane */}
      <mesh rotation={[Math.PI/2, 0, 0]}>
        <ringGeometry args={[conservativeInner, conservativeOuter, 64]} />
        <meshBasicMaterial color="#4CAF50" transparent opacity={0.3} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
});

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
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1.0)');   // Core
  gradient.addColorStop(0.1, 'rgba(255, 255, 255, 0.8)'); // Inner halo
  gradient.addColorStop(0.2, 'rgba(255, 255, 255, 0.4)'); // Transition
  gradient.addColorStop(0.4, 'rgba(255, 255, 255, 0.2)'); // Outer halo start
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');     // Fade to transparent
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
  showHabitableZones?: boolean;
}

const Star = memo(function Star({ system, colorByField, colorByValue, ...props }: StarProps) {
  const [hovered, setHovered] = useState(false);
  const { camera } = useThree();
  const [starTexture, setStarTexture] = useState<THREE.Texture | null>(null);
  const [isLoadingTexture, setIsLoadingTexture] = useState(false);
  const starRef = useRef<THREE.Mesh>(null);
  const rotationAngleRef = useRef(0);
  
  // Calculate distance and visibility flags in a single memo to prevent recalculation on hover
  const { distanceToCamera, showPlanets, showImage, showRotation, showGlow, showHabitableZone } = useMemo(() => {
    const distance = new THREE.Vector3(...props.position).distanceTo(camera.position);
    return {
      distanceToCamera: distance,
      showPlanets: distance < 10,
      showImage: distance < 0.1,
      showRotation: distance < 0.1,
      showGlow: true, // Always show glow for all distances
      showHabitableZone: distance < 10 // Only show habitable zone when close enough (same as planets)
    };
  }, [props.position, camera.position]);
  
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
    // Real physical size with scale slider
    const scaledRealSize = realSizeInParsecs * (1 + t * (maxStarSize / realSizeInParsecs - 1));
    
    // Base apparent size we want to maintain
    const baseApparentSize = 0.002; // Keep stars visible at large distances
    
    // Calculate size needed to maintain apparent size at current distance
    const sizeForConstantAppearance = baseApparentSize * distanceToCamera;
    
    // At far distances: use size that creates constant apparent size
    // At close distances: transition to real physical size
    return Math.max(scaledRealSize, sizeForConstantAppearance);
  }, [distanceToCamera, realSizeInParsecs, t, maxStarSize]);

  // Calculate halo size - should always scale with distance for consistent appearance
  const haloRadius = useMemo(() => {
    const baseHaloSize = 0.002;
    return baseHaloSize * distanceToCamera;
  }, [distanceToCamera]);

  // Calculate color (used for point light and fallback)
  const color = useMemo(() => {
    if (!colorByField) {
      return new THREE.Color(0xffff4f); // Default bright yellow when no filter
    }
    
    // Return white for null or NaN values when filter is applied
    if (colorByValue === null || isNaN(colorByValue)) {
      return new THREE.Color(0xFFFFFF);
    }
    
    const filter = props.activeFilters?.find(f => f.field === colorByField);
    const range = filter?.range;
    
    if (colorByField === 'planetCount') {
      const count = system.planets.length;
      return getViridisColor(count, range?.min || 1, range?.max || 10, false);
    }

    return getViridisColor(colorByValue, range?.min || 0, range?.max || 1, true);
  }, [colorByField, colorByValue, props.activeFilters, system.planets.length]);

  // Handle star rotation - only at extremely close distances
  useFrame((state, delta) => {
    if (!showRotation || props.isPaused || !starRef.current) return;

    // Get rotation period in days, default to Sun's rotation period if not available
    const rotationPeriod = system.st_rotp || 24.47;

    // Convert rotation period to radians per second (positive for clockwise rotation)
    const rotationSpeed = (2 * Math.PI) / (rotationPeriod * 24 * 60 * 60);

    // Update rotation angle
    rotationAngleRef.current += rotationSpeed * delta * 100000; // Scale up for visibility
    
    // Apply rotation
    starRef.current.rotation.y = rotationAngleRef.current;
  });

  // Only load textures when we're actually showing them
  useEffect(() => {
    if (showImage && !starTexture && !isLoadingTexture && !globalStarTexture) {
      setIsLoadingTexture(true);
      
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
          setStarTexture(texture);
          setIsLoadingTexture(false);
          globalStarTexture = texture;
        },
        undefined,
        (error) => {
          console.error("Error loading star texture:", error);
          setIsLoadingTexture(false);
        }
      );
    } else if (showImage && globalStarTexture && !starTexture) {
      setStarTexture(globalStarTexture);
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
      
      {/* Habitable Zone */}
      <HabitableZone system={system} visible={(props.showHabitableZones || false) && showHabitableZone} />
      
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
          <>
          <mesh
            ref={starRef}
            onPointerOver={() => setHovered(true)}
            onPointerOut={() => setHovered(false)}
            onClick={props.onClick}
            onDoubleClick={props.onDoubleClick}
            scale={[starRadius, starRadius, starRadius]}
            userData={{ type: 'star', hostname: system.hostname }}
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
          
          {/* Gradient glow effect for textured stars */}
          <Billboard>
            {/* Outer halo */}
            <mesh scale={[starRadius * 5.0, starRadius * 5.0, 1]}>
              <planeGeometry args={[1, 1]} />
              <meshBasicMaterial
                color={color}
                transparent={true}
                opacity={props.isFiltered ? 0.09 : 1.5}
                depthWrite={false}
                side={THREE.DoubleSide}
                map={glowTexture}
                alphaMap={glowTexture}
                blending={THREE.AdditiveBlending}
              />
            </mesh>
            {/* Inner halo */}
            <mesh scale={[starRadius * 2.4, starRadius * 2.4, 1]}>
              <planeGeometry args={[1, 1]} />
              <meshBasicMaterial
                color={color}
                transparent={true}
                opacity={props.isFiltered ? 0.09 : 3.0}
                depthWrite={false}
                side={THREE.DoubleSide}
                map={glowTexture}
                alphaMap={glowTexture}
                blending={THREE.AdditiveBlending}
              />
            </mesh>
          </Billboard>
          </>
        </Suspense>
      ) : showGlow ? (
        // Medium-distance and far stars with glow effect
        <>
          {/* Core star */}
          <mesh
            ref={starRef}
            onPointerOver={() => setHovered(true)}
            onPointerOut={() => setHovered(false)}
            onClick={props.onClick}
            onDoubleClick={props.onDoubleClick}
            scale={[starRadius, starRadius, starRadius]}
            userData={{ type: 'star', hostname: system.hostname }}
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
            {/* Outer halo */}
            <mesh scale={[haloRadius * 16.0, haloRadius * 16.0, 1]}>
              <planeGeometry args={[1, 1]} />
              <meshBasicMaterial
                color={color}
                transparent={true}
                opacity={props.isFiltered ? 0.09 : 0.6}
                depthWrite={false}
                side={THREE.DoubleSide}
                map={glowTexture}
                alphaMap={glowTexture}
                blending={THREE.AdditiveBlending}
              />
            </mesh>
            {/* Inner halo */}
            <mesh scale={[haloRadius * 4.0, haloRadius * 4.0, 1]}>
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
    prevProps.showHabitableZones === nextProps.showHabitableZones &&
    JSON.stringify(prevProps.activeFilters) === JSON.stringify(nextProps.activeFilters)
  );
});

export default Star; 