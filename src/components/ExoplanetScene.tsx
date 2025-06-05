import React, { useRef, useState, useEffect, useMemo, Suspense } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import { ExoplanetSystem } from '../types/Exoplanet';
import { FilterOption } from './FilterPanel';
import { getViridisColor } from '../utils/colorUtils';
import { Planets } from './Planets';
import { useImperativeHandle, forwardRef, useCallback, memo } from 'react';
import { OrbitControls, Stars, useTexture, Html } from '@react-three/drei';
import { loadExoplanetData, equatorialToCartesian } from '../utils/dataLoader';
import { StarInfoModal } from './StarInfoModal';
import gsap from 'gsap';
import { ColorLegend } from './ColorLegend';
import { FilterPanel, systemMatchesFilters } from './FilterPanel';
import { FaFilter } from 'react-icons/fa';
import Star from './Star';
import { ScaleBar, ScaleBarUpdater } from './ScaleBar';
import { PlanetInfoModal } from './PlanetInfoModal';

/**
 * Three.js Coordinate System:
 * - X-axis (Red): Points to the right
 * - Y-axis (Green): Points up
 * - Z-axis (Blue): Points toward the viewer
 * 
 * In our exoplanet visualization:
 * - X-axis: Right ascension (RA) component
 * - Y-axis: Declination (Dec) component
 * - Z-axis: Distance from Earth
 * 
 * The equatorialToCartesian function converts from:
 * - RA (0-360 degrees) → X coordinate
 * - Dec (-90 to 90 degrees) → Y coordinate
 * - Distance (parsecs) → Z coordinate
 */

interface PlanetsProps {
  system: ExoplanetSystem;
  visible: boolean;
  isPaused: boolean;
  starRadius: number;
  sizeScale: number;
  systemMaxScale: number;
  planetScaleRatio: number;
}

interface SceneProps {
  onStarClick: (system: ExoplanetSystem) => void;
  searchQuery: string;
  onStarFound?: (system: ExoplanetSystem) => void;
  onStarDoubleClick?: (system: ExoplanetSystem) => void;
  onPlanetClick?: (system: ExoplanetSystem, planetIndex: number) => void;
  onPlanetDoubleClick?: (system: ExoplanetSystem, planetIndex: number) => void;
  sizeScale: number;
  isPaused: boolean;
  setIsPaused: React.Dispatch<React.SetStateAction<boolean>>;
  activeFilters: FilterOption[];
  colorByField: string | null;
  systems: ExoplanetSystem[];
  showHabitableZones?: boolean;
}

export interface SceneHandle {
  focusOnStar: (system: ExoplanetSystem) => void;
  focusOnPlanet: (system: ExoplanetSystem, planetIndex: number) => void;
  resetView: () => void;
}

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
  const luminosity = system.st_lum || 1.0; // Default to solar luminosity if not available
  
  // Calculate habitable zone
  const hz = calculateHabitableZone(teff, luminosity);
  
  // Convert AU to parsecs (1 AU = 1/206265 parsecs)
  const auToParsec = 1/206265;
  
  // Calculate optimistic habitable zone
  const innerRadius = hz.optimistic.inner * auToParsec;
  const outerRadius = hz.optimistic.outer * auToParsec;
  
  // Calculate conservative habitable zone 
  const conservativeInner = hz.conservative.inner * auToParsec;
  const conservativeOuter = hz.conservative.outer * auToParsec;
  
  return (
    <group>
      {/* Optimistic habitable zone (lighter color) */}
      <mesh rotation={[Math.PI/2, 0, 0]}>
        <torusGeometry args={[(innerRadius + outerRadius) / 2, (outerRadius - innerRadius) / 2, 2, 48]} />
        <meshBasicMaterial color="#009900" transparent opacity={0.1} side={THREE.DoubleSide} />
      </mesh>
      
      {/* Conservative habitable zone (darker color) */}
      <mesh rotation={[Math.PI/2, 0, 0]}>
        <torusGeometry args={[(conservativeInner + conservativeOuter) / 2, (conservativeOuter - conservativeInner) / 2, 2, 48]} />
        <meshBasicMaterial color="#00aa00" transparent opacity={0.2} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
});

const Scene = forwardRef<SceneHandle, SceneProps>(({ 
  onStarClick, 
  searchQuery, 
  onStarFound, 
  onStarDoubleClick, 
  onPlanetClick,
  onPlanetDoubleClick,
  sizeScale,
  isPaused,
  setIsPaused,
  activeFilters,
  colorByField,
  systems,
  showHabitableZones = false,
}, ref) => {
  
  const [scale, setScale] = useState(1);
  const [highlightedSystem, setHighlightedSystem] = useState<ExoplanetSystem | null>(null);
  const { camera } = useThree();
  const controlsRef = useRef<any>(null);
  const [compactSystem, setCompactSystem] = useState<ExoplanetSystem | null>(null);
  const [selectedSystem, setSelectedSystem] = useState<ExoplanetSystem | null>(null);
  const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [cameraDistance, setCameraDistance] = useState(0);
  const [universeOffset, setUniverseOffset] = useState(new THREE.Vector3(0, 0, 0));
  const [useUniverseOffset, setUseUniverseOffset] = useState(true);
  const [focusedObjectRadius, setFocusedObjectRadius] = useState<number>(0.0001/206265);
  
  // Add state to track focused planet
  const [focusedPlanet, setFocusedPlanet] = useState<{
    system: ExoplanetSystem;
    planetIndex: number;
    zoomDistance: number;
    initialCameraOffset?: THREE.Vector3; // Store initial camera position relative to planet
  } | null>(null);
  
  // Add state to temporarily disable tracking during manual control
  const [trackingEnabled, setTrackingEnabled] = useState(true);
  const lastOffsetRef = useRef(new THREE.Vector3());
  const targetOffsetRef = useRef(new THREE.Vector3());
  const offsetVelocityRef = useRef(new THREE.Vector3()); // Track velocity for dampening
  const manualControlTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const initialCameraQuaternionRef = useRef<THREE.Quaternion | null>(null);
  const isAnimatingRef = useRef(false);
  const lastPlanetAngleRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef(0);
  const universeOffsetRef = useRef(new THREE.Vector3(0, 0, 0));
  const rafIdRef = useRef<number | null>(null);
  
  // Add state for tracking indicator
  const [showTrackingIndicator, setShowTrackingIndicator] = useState(false);

  // Add function to reset the view to initial state
  const resetView = useCallback(() => {
    // Reset universe offset
    setUniverseOffset(new THREE.Vector3(0, 0, 0));
    universeOffsetRef.current.set(0, 0, 0);
    
    // Reset camera position
    camera.position.set(0, 20, 50);
    camera.lookAt(0, 0, 0);
    
    // Reset controls
    if (controlsRef.current) {
      controlsRef.current.reset();
      controlsRef.current.update();
    }
    
    // Clear any focused object
    setFocusedPlanet(null);
    setTrackingEnabled(true);
    
    // Clear selected objects
    setCompactSystem(null);
    setSelectedSystem(null);
  }, [camera, setUniverseOffset, setFocusedPlanet, setTrackingEnabled, setCompactSystem, setSelectedSystem]);

  // Expose methods to parent component
  useImperativeHandle(ref, () => ({
    focusOnStar,
    focusOnPlanet,
    resetView
  }));

  // Sync universeOffset state with ref for smoother animations
  useEffect(() => {
    universeOffsetRef.current.copy(universeOffset);
  }, [universeOffset]);

  // Handle space bar press and tracking toggle
  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      const searchInput = document.querySelector('input[placeholder*="Search for stars"]');
      if (document.activeElement === searchInput) {
        return;
      }
      
      if (event.code === 'Space') {
        event.preventDefault();
        setIsPaused((prev: boolean) => !prev);
      }
      
      // Toggle tracking with 'T' key
      if (event.code === 'KeyT' && focusedPlanet) {
        event.preventDefault();
        setTrackingEnabled(prev => !prev);
        // Show indicator briefly
        setShowTrackingIndicator(true);
        setTimeout(() => setShowTrackingIndicator(false), 2000);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [setIsPaused, focusedPlanet]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
      }
    };
  }, []);

  const handleStarClick = (system: ExoplanetSystem) => {
    // Clear any existing timeout
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
    }
    
    // Set a timeout to show the info panel
    clickTimeoutRef.current = setTimeout(() => {
      onStarClick(system);
      setCompactSystem(null);
    }, 200); // 200ms delay to allow for double click
  };

  const handleStarDoubleClick = (system: ExoplanetSystem) => {
    // Clear the single click timeout
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
    }
    
    focusOnStar(system);
    setCompactSystem(system);
    setSelectedSystem(null);
    
    // Call the onStarDoubleClick prop if provided
    if (onStarDoubleClick) {
      onStarDoubleClick(system);
    }
  };

  const focusOnStar = useCallback((system: ExoplanetSystem) => {
    const position = equatorialToCartesian(system.ra, system.dec, system.sy_dist);
    const targetPosition = new THREE.Vector3(...position);
    
    // Get the scaled star size from the first planet's reference (star size is stored with planet index -1)
    const starSizeKey = `${system.hostname}--1-size`;
    const scaledStarSize = planetSizesRef.current.get(starSizeKey);
    if (scaledStarSize) {
      setFocusedObjectRadius(scaledStarSize);
    }
    
    // Longer duration for more visible travel
    const duration = 3.0;
    
    // Set up the animation
    const startOffset = universeOffset.clone();
    const endOffset = targetPosition.clone();
    
    // Get initial camera position
    const initialCameraPos = camera.position.clone();
    
    // Calculate zoom distance based on this specific system's largest orbit
    const maxOrbitRadius = Math.max(
      ...system.planets.map(p => {
        // Get orbit size in parsecs (convert from AU)
        const orbitRadius = (p.pl_orbsmax || 
          (p.pl_orbper ? Math.pow(p.pl_orbper / 365, 2/3) : 0)) / 206265;
        return orbitRadius;
      })
    );
    const finalZoomDistance = maxOrbitRadius * 2;
    
    // Start animation
    let startTime = performance.now();
    const animate = (currentTime: number) => {
      const elapsed = (currentTime - startTime) / 1000;
      const progress = Math.min(1, elapsed / duration);
      
      // Cubic easing for smooth motion
      const easeProgress = progress < 0.5 
        ? 4 * progress * progress * progress 
        : 1 - Math.pow(-2 * progress + 2, 3) / 2;
      
      if (controlsRef.current) {
        // 1. First, update universe offset to center the target star (rotate universe)
        const newOffset = new THREE.Vector3();
        newOffset.lerpVectors(startOffset, endOffset, easeProgress);
        setUniverseOffset(newOffset);
        
        // 2. Then, zoom the camera from its initial distance to the appropriate zoom distance
        // Calculate intermediate zoom distance
        const initialDistance = initialCameraPos.length();
        const currentZoomDistance = initialDistance * (1 - easeProgress) + finalZoomDistance * easeProgress;
        
        // Get direction from camera to origin (0,0,0)
        const direction = new THREE.Vector3(0, 0, 0).sub(camera.position).normalize();
        
        // Set camera position: keep same direction but adjust distance
        camera.position.copy(direction.multiplyScalar(-currentZoomDistance));
        
        // Keep looking at origin
        controlsRef.current.target.set(0, 0, 0);
        controlsRef.current.update();
      }
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    
    requestAnimationFrame((time) => {
      startTime = time;
      animate(time);
    });
  }, [camera, universeOffset, sizeScale]);

  // Handle search
  useEffect(() => {
    if (!searchQuery || searchQuery.length < 2) {
      setHighlightedSystem(null);
      return;
    }
    
    // Normalize search query: convert to lowercase and remove special characters except hyphens
    const searchNormalized = searchQuery.toLowerCase().replace(/[^a-z0-9-]/g, '');
    
    const foundSystem = systems.find(system => {
      // Normalize system hostname the same way
      const hostnameNormalized = system.hostname.toLowerCase().replace(/[^a-z0-9-]/g, '');
      
      // Check if any planet name matches (also normalized)
      const planetMatches = system.planets.some(planet => {
        const planetNameNormalized = planet.pl_name.toLowerCase().replace(/[^a-z0-9-]/g, '');
        return planetNameNormalized.includes(searchNormalized);
      });
      
      return hostnameNormalized.includes(searchNormalized) || planetMatches;
    });
    
    if (foundSystem) {
      setHighlightedSystem(foundSystem);
    } else {
      setHighlightedSystem(null);
    }
  }, [searchQuery, systems]);
  
  // Calculate which systems are far away based on camera distance
  const farThreshold = 50;
  const isFar = (system: ExoplanetSystem, position: THREE.Vector3) => {
    const adjustedPosition = new THREE.Vector3(...position).sub(universeOffset);
    return adjustedPosition.length() > farThreshold;
  };
  
  const visibleSystems = useMemo(() => {
    const filteredSystems = systems.filter((system: ExoplanetSystem) => {
      const basePosition = equatorialToCartesian(system.ra, system.dec, system.sy_dist);
      const position = useUniverseOffset 
        ? new THREE.Vector3(...basePosition).sub(universeOffset)
        : new THREE.Vector3(...basePosition);
      return position.length() < 1000; // Only show stars within 1000 parsecs of current view
    });
    return filteredSystems;
  }, [systems, universeOffset, useUniverseOffset]);

  // Add references to planet positions and sizes
  const planetAnglesRef = useRef<Map<string, number>>(new Map());
  const planetSizesRef = useRef<Map<string, number>>(new Map());

  // Add a function to register planet angles and sizes
  const registerPlanetAngle = (systemName: string, planetIndex: number, angle: number, size?: number) => {
    const angleKey = `${systemName}-${planetIndex}`;
    planetAnglesRef.current.set(angleKey, angle);
    
    if (size !== undefined) {
      const sizeKey = `${systemName}-${planetIndex}-size`;
      planetSizesRef.current.set(sizeKey, size);
    }
  };

  // Animation function for planet focus
  const animatePlanetFocus = (
    startOffset: THREE.Vector3,
    endOffset: THREE.Vector3,
    finalZoomDistance: number,
    initialCameraPos: THREE.Vector3
  ) => {
    // Two-phase animation (first center, then zoom)
    const centeringDuration = 1.0; // Duration for centering phase
    const zoomingDuration = 1.5; // Duration for zooming phase
    const totalDuration = centeringDuration + zoomingDuration;
    
    let startTime = performance.now();
    const animate = (currentTime: number) => {
      const elapsed = (currentTime - startTime) / 1000;
      
      // Two animation phases
      if (elapsed < centeringDuration) {
        // Phase 1: Center the planet (0 to centeringDuration)
        const centerProgress = Math.min(1, elapsed / centeringDuration);
        const easeCenterProgress = centerProgress < 0.5 
          ? 4 * centerProgress * centerProgress * centerProgress 
          : 1 - Math.pow(-2 * centerProgress + 2, 3) / 2;
        
        if (controlsRef.current) {
          // Update universe offset to center the planet/moon
          const newOffset = new THREE.Vector3();
          newOffset.lerpVectors(startOffset, endOffset, easeCenterProgress);
          setUniverseOffset(newOffset);
          
          // Keep camera at same distance during centering
          controlsRef.current.target.set(0, 0, 0);
          controlsRef.current.update();
        }
      } else {
        // Phase 2: Zoom in (centeringDuration to totalDuration)
        const zoomProgress = Math.min(1, (elapsed - centeringDuration) / zoomingDuration);
        const easeZoomProgress = zoomProgress < 0.5 
          ? 4 * zoomProgress * zoomProgress * zoomProgress 
          : 1 - Math.pow(-2 * zoomProgress + 2, 3) / 2;
        
        if (controlsRef.current) {
          // Keep universe offset at final position (planet centered)
          setUniverseOffset(endOffset);
          
          // Calculate intermediate zoom distance
          const initialDistance = initialCameraPos.length();
          const currentZoomDistance = initialDistance * (1 - easeZoomProgress) + finalZoomDistance * easeZoomProgress;
          
          // Get direction from camera to origin and apply zoom
          const direction = new THREE.Vector3(0, 0, 0).sub(camera.position).normalize();
          camera.position.copy(direction.multiplyScalar(-currentZoomDistance));
          
          // Keep looking at origin
          controlsRef.current.target.set(0, 0, 0);
          controlsRef.current.update();
        }
      }
      
      if (elapsed < totalDuration) {
        requestAnimationFrame(animate);
      }
    };
    
    requestAnimationFrame((time) => {
      startTime = time;
      animate(time);
    });
  };

  // Add a new function to focus on a planet
  const focusOnPlanet = useCallback((system: ExoplanetSystem, planetIndex: number) => {
    // First, get the star position
    const starPosition = equatorialToCartesian(system.ra, system.dec, system.sy_dist);
    
    // Set up the animation
    const startOffset = universeOffset.clone();
    
    // Get initial camera position
    const initialCameraPos = camera.position.clone();
    
    // Calculate planet-specific zoom parameters
    const planet = planetIndex >= 0 ? system.planets[planetIndex] : null;
    
    if (planet) {
      // Get the scaled planet size
      const planetSizeKey = `${system.hostname}-${planetIndex}-size`;
      const scaledPlanetSize = planetSizesRef.current.get(planetSizeKey);
      if (scaledPlanetSize) {
        setFocusedObjectRadius(scaledPlanetSize);
      }
      
      // First, place the star at origin
      const endStarOffset = new THREE.Vector3(...starPosition);
      
      // Get the planet's current angle from our reference
      const planetKey = `${system.hostname}-${planetIndex}`;
      const planetAngle = planetAnglesRef.current.get(planetKey) || 0;
      lastPlanetAngleRef.current = planetAngle; // Store initial angle
      
      // Calculate orbit radius in parsecs
      const orbitRadius = (planet.pl_orbsmax || 
        (planet.pl_orbper ? Math.pow(planet.pl_orbper / 365, 2/3) : planetIndex + 1)) / 206265;
      
      // Calculate current planet position using its current angle
      const planetX = orbitRadius * Math.cos(planetAngle);
      const planetZ = orbitRadius * Math.sin(planetAngle);
      const planetPosition = new THREE.Vector3(planetX, 0, planetZ);
      
      // Offset that places planet at origin
      const endOffset = endStarOffset.clone().add(planetPosition);
      
      // Reset the velocity when starting a new focus
      offsetVelocityRef.current.set(0, 0, 0);
      
      // Initialize target offset at the end position
      targetOffsetRef.current.copy(endOffset);
      
      // Set zoom distance based on the planet's scaled size
      let finalZoomDistance;
      if (scaledPlanetSize) {
        // Calculate distance needed for planet to fill half the screen
        // Using the formula: distance = radius / tan(FOV/4)
        // FOV/4 gives us half the horizontal field of view divided by 2
        // Default camera FOV is usually 75 degrees
        const fov = 75 * (Math.PI / 180); // Convert to radians
        const halfFovTangent = Math.tan(fov / 4);
        
        // Scale factor is applied to adjust distance if needed
        const scaleFactor = 1.0;
        finalZoomDistance = (scaledPlanetSize / halfFovTangent) * scaleFactor;
      } else {
        // Fallback to a reasonable default if no size is available
        finalZoomDistance = 0.0001/206265 * 200;
      }
      
      // Calculate direction from planet to star (daylight direction)
      // After centering, the planet will be at (0,0,0) and the star at -planetPosition
      // So the direction from planet to star is -planetPosition normalized
      const dayLightDirection = planetPosition.clone().multiplyScalar(-1).normalize();
      
      // Position camera on the daylight side of the planet (same side as the star)
      const cameraPosition = dayLightDirection.clone().multiplyScalar(finalZoomDistance);
      
      // Store the quaternion that makes the camera look at the planet
      camera.position.copy(cameraPosition);
      camera.lookAt(0, 0, 0);
      initialCameraQuaternionRef.current = camera.quaternion.clone();
      
      // Calculate camera offset from planet (will be maintained during tracking)
      const initialCameraOffset = cameraPosition.clone();
      
      // Set the focused planet for continuous tracking
      setFocusedPlanet({
        system,
        planetIndex,
        zoomDistance: finalZoomDistance,
        initialCameraOffset
      });
      
      // Start two-phase animation (first center, then zoom)
      animatePlanetFocus(startOffset, endOffset, finalZoomDistance, initialCameraPos);
    }
  }, [camera, universeOffset, sizeScale]);

  // Add event listeners for orbit controls
  useEffect(() => {
    const handleControlStart = () => {
      // Disable tracking when user starts manual control
      setTrackingEnabled(false);
      
      // Clear any existing timeout
      if (manualControlTimeoutRef.current) {
        clearTimeout(manualControlTimeoutRef.current);
      }
    };
    
    const handleControlEnd = () => {
      // Re-enable tracking after a short delay
      if (manualControlTimeoutRef.current) {
        clearTimeout(manualControlTimeoutRef.current);
      }
      
      manualControlTimeoutRef.current = setTimeout(() => {
        setTrackingEnabled(true);
      }, 1500); // Delay before re-enabling tracking
    };
    
    // Add event listeners to orbit controls
    if (controlsRef.current) {
      controlsRef.current.addEventListener('start', handleControlStart);
      controlsRef.current.addEventListener('end', handleControlEnd);
    }
    
    // Cleanup
    return () => {
      if (controlsRef.current) {
        controlsRef.current.removeEventListener('start', handleControlStart);
        controlsRef.current.removeEventListener('end', handleControlEnd);
      }
      
      if (manualControlTimeoutRef.current) {
        clearTimeout(manualControlTimeoutRef.current);
      }
    };
  }, [controlsRef.current]);
  
  // Use a more efficient approach for updating universe offset
  useEffect(() => {
    // Function to update position with fixed time step
    const updateUniverseOffset = () => {
      setUniverseOffset(universeOffsetRef.current.clone());
    };

    // Throttled update function to reduce state updates
    const throttledUpdate = throttle(updateUniverseOffset, 16); // ~60fps
    
    // Return the throttle function for cleanup
    return () => {
      throttledUpdate.cancel();
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, []);

  // Throttle function to limit updates
  function throttle(func: Function, limit: number) {
    let inThrottle = false;
    let lastFunc: ReturnType<typeof setTimeout>;
    let lastRan: number;
    
    const throttled = function(this: any, ...args: any[]) {
      if (!inThrottle) {
        func.apply(this, args);
        lastRan = Date.now();
        inThrottle = true;
        setTimeout(() => {
          inThrottle = false;
        }, limit);
      } else {
        clearTimeout(lastFunc);
        lastFunc = setTimeout(() => {
          if (Date.now() - lastRan >= limit) {
            func.apply(this, args);
            lastRan = Date.now();
          }
        }, limit - (Date.now() - lastRan));
      }
    };
    
    throttled.cancel = function() {
      clearTimeout(lastFunc);
    };
    
    return throttled;
  }

  // Complete rewrite of planet tracking for maximum smoothness
  useFrame(() => {
    if (focusedPlanet && !isPaused && trackingEnabled) {
      const { system, planetIndex, zoomDistance } = focusedPlanet;
      const planet = system.planets[planetIndex];
      
      if (planet) {
        // Get star position
        const starPosition = equatorialToCartesian(system.ra, system.dec, system.sy_dist);
        const starVector = new THREE.Vector3(...starPosition);
        
        // Get current planet angle
        const planetKey = `${system.hostname}-${planetIndex}`;
        const currentPlanetAngle = planetAnglesRef.current.get(planetKey) || 0;
        
        // Calculate orbit radius in parsecs
        const orbitRadius = (planet.pl_orbsmax || 
          (planet.pl_orbper ? Math.pow(planet.pl_orbper / 365, 2/3) : planetIndex + 1)) / 206265;
        
        // Calculate current planet position relative to its star
        const planetX = orbitRadius * Math.cos(currentPlanetAngle);
        const planetZ = orbitRadius * Math.sin(currentPlanetAngle);
        const planetLocalPosition = new THREE.Vector3(planetX, 0, planetZ);
        
        // Calculate planet's absolute position in space
        const planetWorldPosition = starVector.clone().add(planetLocalPosition);
        
        // CRITICAL CHANGE: Set universe offset directly without any smoothing or state updates
        // This immediately centers the planet in the viewport
        universeOffsetRef.current.copy(planetWorldPosition);
        
        // Calculate camera target position (on the day side of the planet)
        // This is the direction from planet to star (the sun-lit side)
        const sunDirection = planetLocalPosition.clone().multiplyScalar(-1).normalize();
        
        // Position camera at a fixed distance from the planet, on the sun-lit side
        const idealCameraPosition = sunDirection.clone().multiplyScalar(zoomDistance);
        
        // If camera is not yet positioned properly, snap it to the ideal position
        if (!isAnimatingRef.current) {
          camera.position.copy(idealCameraPosition);
          camera.lookAt(0, 0, 0);
          isAnimatingRef.current = true;
        } else {
          // Very gentle interpolation for camera movement
          camera.position.lerp(idealCameraPosition, 0.05);
          
          // Keep the camera pointed at the origin (where the planet is)
          camera.lookAt(0, 0, 0);
        }
        
        // Directly update the universe offset state every frame for perfect sync
        // This is the key to eliminating jerkiness
        setUniverseOffset(planetWorldPosition.clone());
        
        // Make sure controls are updated but don't allow them to change the target
        if (controlsRef.current) {
          controlsRef.current.target.set(0, 0, 0);
          controlsRef.current.update();
        }
      }
    }
  });
  
  // Manage orbit controls based on tracking state
  useEffect(() => {
    if (!controlsRef.current) return;
    
    if (trackingEnabled && focusedPlanet) {
      // Disable rotation when tracking to maintain same view of planet
      controlsRef.current.enableRotate = false;
    } else {
      // Enable rotation when not tracking
      controlsRef.current.enableRotate = true;
    }
  }, [trackingEnabled, focusedPlanet]);
  
  // Allow resetting the focused planet when clicking elsewhere
  const handleSceneClick = useCallback((e: any) => {
    // Only handle direct background clicks
    if (focusedPlanet) {
      setFocusedPlanet(null);
      
      // Ensure tracking is enabled for next planet focus
      setTrackingEnabled(true);
    }
  }, [focusedPlanet]);
  
  // Create tracking indicator component
  const TrackingIndicator = () => {
    if (!focusedPlanet) return null;
    
    const planetName = focusedPlanet.system.planets[focusedPlanet.planetIndex].pl_name;
    const trackingStatus = trackingEnabled ? "Tracking" : "Tracking Paused";
    
    return (
      <Html position={[0, 0, 0]} center style={{ pointerEvents: 'none' }}>
        <div style={{
          position: 'absolute',
          top: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.7)',
          color: trackingEnabled ? '#4CAF50' : '#FF9800',
          padding: '8px 16px',
          borderRadius: '4px',
          fontFamily: 'Arial, sans-serif',
          fontSize: '14px',
          opacity: showTrackingIndicator ? 1 : 0,
          transition: 'opacity 0.5s',
        }}>
          {trackingStatus}: {planetName}
          <div style={{ fontSize: '12px', opacity: 0.8, marginTop: '4px' }}>
            Press T to {trackingEnabled ? 'disable' : 'enable'} tracking
          </div>
          {!trackingEnabled && (
            <button 
              onClick={(e) => {
                e.stopPropagation();
                // Reset camera view to maintain same phase
                if (initialCameraQuaternionRef.current && camera) {
                  camera.quaternion.copy(initialCameraQuaternionRef.current);
                  setTrackingEnabled(true);
                }
              }}
              style={{
                marginTop: '8px',
                padding: '4px 8px',
                background: '#4CAF50',
                border: 'none',
                borderRadius: '4px',
                color: 'white',
                cursor: 'pointer',
                fontSize: '12px',
                pointerEvents: 'auto'
              }}
            >
              Reset View
            </button>
          )}
        </div>
      </Html>
    );
  };
  
  return (
    <>
      <ambientLight intensity={1.0} />
      <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade />
      
      {/* Add invisible sphere for background clicks */}
      <mesh onClick={handleSceneClick} renderOrder={-1000}>
        <sphereGeometry args={[500, 32, 32]} />
        <meshBasicMaterial transparent opacity={0} side={THREE.BackSide} />
      </mesh>
      
      {/* Show tracking indicator when focused on a planet */}
      {focusedPlanet && <TrackingIndicator />}
      
      {useMemo(() => {
        return visibleSystems.map((system) => {
          const isFiltered = !systemMatchesFilters(system, activeFilters);
          const colorByValue = colorByField === 'planetCount' ? 
            system.planets.length : 
            colorByField ? (system as any)[colorByField] : null;
          const basePosition = equatorialToCartesian(system.ra, system.dec, system.sy_dist);
          const position = useUniverseOffset 
            ? new THREE.Vector3(...basePosition).sub(universeOffset)
            : new THREE.Vector3(...basePosition);
          
          return (
        <Star 
          key={system.hostname} 
          system={system} 
          position={position}
          scale={scale} 
          isFar={isFar(system, position)}
          onClick={() => handleStarClick(system)}
          onDoubleClick={() => handleStarDoubleClick(system)}
          onPlanetClick={(sys, planetIndex) => onPlanetClick?.(sys, planetIndex)}
          onPlanetDoubleClick={(sys, planetIndex) => onPlanetDoubleClick?.(sys, planetIndex)}
          registerPlanetAngle={registerPlanetAngle}
          isHighlighted={system === highlightedSystem}
          isPaused={isPaused}
          sizeScale={sizeScale}
          isFiltered={isFiltered}
          colorByField={colorByField}
          colorByValue={colorByValue}
          activeFilters={activeFilters}
          systemMaxScale={1000}
          planetScaleRatio={100}
          showHabitableZones={showHabitableZones}
        />
          );
        });

      }, [visibleSystems, universeOffset, scale, highlightedSystem, isPaused, useUniverseOffset, sizeScale, activeFilters, colorByField, registerPlanetAngle, onPlanetClick, showHabitableZones])}

      <OrbitControls
        ref={controlsRef}
        enableDamping={false}
        dampingFactor={0.01}
        rotateSpeed={0.4}
        panSpeed={1.5}
        zoomSpeed={5.0}
        minDistance={Math.max(focusedObjectRadius * (1.1 / (1000 / sizeScale)), 0.0001/206265)}
        maxDistance={10000}
        screenSpacePanning={true}
        target={[0, 0, 0]}
        maxPolarAngle={Math.PI / 2}
        mouseButtons={{
          LEFT: THREE.MOUSE.PAN,
          MIDDLE: THREE.MOUSE.DOLLY,
          RIGHT: THREE.MOUSE.ROTATE
        }}
        makeDefault
        onUpdate={(self: any) => {
          // If we're too close, force the camera back to minimum distance
          const distance = camera.position.length();
          const minDist = Math.max(focusedObjectRadius * (1.1 / (1000 / sizeScale)), 0.0001/206265);
          if (distance < minDist) {
            const direction = camera.position.clone().normalize();
            camera.position.copy(direction.multiplyScalar(minDist));
            self.target.set(0, 0, 0);
          }
        }}
      />
    </>
  );
});

function ExoplanetScene({ gl }: { gl: THREE.WebGLRenderer }) {
  const [selectedSystem, setSelectedSystem] = useState<ExoplanetSystem | null>(null);
  const [selectedPlanet, setSelectedPlanet] = useState<{system: ExoplanetSystem, planetIndex: number} | null>(null);
  const [compactSystem, setCompactSystem] = useState<ExoplanetSystem | null>(null);
  const [showHelp, setShowHelp] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<ExoplanetSystem[]>([]);
  const [systems, setSystems] = useState<ExoplanetSystem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const sceneRef = useRef<SceneHandle>(null);
  const [lastSearchedSystem, setLastSearchedSystem] = useState<string | null>(null);
  const [sizeScale, setSizeScale] = useState(1000);
  const sizeSliderRef = useRef<HTMLInputElement>(null);
  const currentValueRef = useRef(1000);
  const [isPaused, setIsPaused] = useState(false);
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [activeFilters, setActiveFilters] = useState<FilterOption[]>([]);
  const [colorByField, setColorByField] = useState<string | null>(null);
  const [showHabitableZones, setShowHabitableZones] = useState(false);

  // Simple change handler for non-drag updates
  const handleSizeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = Math.max(1, Number(e.target.value));
    currentValueRef.current = newValue;
    setSizeScale(newValue);
  };

  // IMPORTANT: Set up the direct DOM manipulation for the slider
  useEffect(() => {
    const slider = sizeSliderRef.current;
    if (!slider) return;

    let isDragging = false;
    let rafId: number | null = null;
    
    const startDrag = () => {
      isDragging = true;
      // Set will-change for better performance
      slider.style.willChange = 'value';
    };
    
    const endDrag = () => {
      if (isDragging) {
        isDragging = false;
        // Remove will-change
        slider.style.willChange = 'auto';
        // Ensure final state update
        setSizeScale(currentValueRef.current);
      }
      
      // Cancel any pending animation frame
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    };
    
    const onMove = (clientX: number) => {
      if (!isDragging || !slider) return;
      
      // Cancel any previous animation frame
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      
      // Schedule update on next animation frame
      rafId = requestAnimationFrame(() => {
        const rect = slider.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        
        // Calculate value directly: left = 1 (min), right = 1000 (max)
        const value = Math.round(1 + ratio * 999); // min=1, max=1000
        
        // Update DOM value immediately
        slider.value = String(value);
        currentValueRef.current = value;
        
        // Update React state during drag for immediate feedback
        setSizeScale(value);
      });
    };
    
    // Mouse events
    const onMouseDown = () => startDrag();
    const onMouseMove = (e: MouseEvent) => onMove(e.clientX);
    const onMouseUp = () => endDrag();
    
    // Touch events for mobile
    const onTouchStart = () => startDrag();
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches[0]) onMove(e.touches[0].clientX);
    };
    const onTouchEnd = () => endDrag();
    
    // Attach all event listeners
    slider.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    
    slider.addEventListener('touchstart', onTouchStart);
    window.addEventListener('touchmove', onTouchMove);
    window.addEventListener('touchend', onTouchEnd);
    
    return () => {
      // Clean up all event listeners
      slider.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      
      slider.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      
      // Cancel any pending animation frame
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, []);

  useEffect(() => {
    console.log('Loading exoplanet data...');
    setIsLoading(true);
    loadExoplanetData().then(data => {
      console.log('Loaded systems:', data.length);
      setSystems(data);
      // Add a delay before hiding the loading message to ensure stars have time to render
      setTimeout(() => {
        setIsLoading(false);
      }, 1500); // 2 second delay
    });
  }, []);

  // Update suggestions when search query changes
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (!searchQuery || searchQuery.length < 2) {
      setSuggestions([]);
      return;
    }

    searchTimeoutRef.current = setTimeout(() => {
      console.log('Searching for:', searchQuery);
      console.log('Number of systems:', systems.length);
      
      const searchLower = searchQuery.toLowerCase();
      const matches = systems
        .filter(system => {
          const hostnameMatch = system.hostname.toLowerCase().includes(searchLower);
          const planetMatch = system.planets.some(planet => 
            planet.pl_name?.toLowerCase().includes(searchLower)
          );
          return hostnameMatch || planetMatch;
        })
        .sort((a, b) => {
          const aName = a.hostname.toLowerCase();
          const bName = b.hostname.toLowerCase();
          // Exact matches first
          if (aName === searchLower) return -1;
          if (bName === searchLower) return 1;
          // Then matches at start of name
          if (aName.startsWith(searchLower) && !bName.startsWith(searchLower)) return -1;
          if (bName.startsWith(searchLower) && !aName.startsWith(searchLower)) return 1;
          // Then alphabetical
          return aName.localeCompare(bName);
        })
        .slice(0, 10);

      console.log('Found matches:', matches.length);
      console.log('Matches:', matches.map(m => m.hostname));
      setSuggestions(matches);
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery, systems]);

  // Handle search input key press
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && searchQuery.length >= 2) {
      // Normalize search query: convert to lowercase and remove special characters except hyphens
      const searchNormalized = searchQuery.toLowerCase().replace(/[^a-z0-9-]/g, '');
      
      // Find the system
      const foundSystem = systems.find(system => {
        // Normalize system hostname the same way
        const hostnameNormalized = system.hostname.toLowerCase().replace(/[^a-z0-9-]/g, '');
        
        // Check if any planet name matches (also normalized)
        const planetMatches = system.planets.some(planet => {
          const planetNameNormalized = planet.pl_name.toLowerCase().replace(/[^a-z0-9-]/g, '');
          return planetNameNormalized.includes(searchNormalized);
        });
        
        return hostnameNormalized.includes(searchNormalized) || planetMatches;
      });
      
      if (foundSystem) {
        // Now focus the camera on the star
        if (sceneRef.current) {
          sceneRef.current.focusOnStar(foundSystem);
        }
        
        setCompactSystem(foundSystem);
        setSelectedSystem(null);
        setSelectedPlanet(null);
        setLastSearchedSystem(foundSystem.hostname);
        
        // Clear search after successful search
        setSearchQuery('');
        setSuggestions([]);
      }
    }
  };

  const handlePlanetClick = useCallback((system: ExoplanetSystem, planetIndex: number) => {
    setSelectedPlanet({ system, planetIndex });
  }, []);

  const handlePlanetDoubleClick = useCallback((system: ExoplanetSystem, planetIndex: number) => {
    // Focus on the planet instead of showing the info panel
    if (sceneRef.current) {
      sceneRef.current.focusOnPlanet(system, planetIndex);
      // Clear any selected planet info panel
      setSelectedPlanet(null);
    }
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      <style>
        {`
          .suggestion-item:hover {
            background-color: rgba(255, 255, 255, 0.1);
          }
          .suggestions-container {
            position: absolute;
            top: 100%;
            left: 0;
            right: 0;
            background-color: rgba(0, 0, 0, 0.9);
            border: 1px solid #666;
            border-radius: 4px;
            margin-top: 4px;
            max-height: 200px;
            overflow-y: auto;
            z-index: 1001;
          }
        `}
      </style>
      <Canvas
        camera={{ 
          position: [0, 20, 50],
          fov: 60, 
          near: 0.0001/206265,
          far: 10000 * 206265
        }}
        gl={{ 
          antialias: true, 
          alpha: true,
          powerPreference: "high-performance"
        }}
        dpr={[1, 2]}
        frameloop="always"
        style={{ background: '#000' }}
        onCreated={({ gl, scene, camera }) => {
          gl.setClearColor('#000000', 1);
          // Add initial lighting
          const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
          scene.add(ambientLight);
          
          const directionalLight = new THREE.DirectionalLight(0xffffff, 2);
          directionalLight.position.set(0, 1, 0);
          scene.add(directionalLight);
          
          // Adjust camera to look at origin
          camera.lookAt(0, 0, 0);
        }}
      >
        <Scene 
          ref={sceneRef}
          onStarClick={(system) => {
            setSelectedSystem(system);
            setCompactSystem(null);
            setSelectedPlanet(null);
          }}
          onStarDoubleClick={(system) => {
            if (system.hostname !== lastSearchedSystem) {
              setCompactSystem(system);
              setSelectedSystem(null);
              setSelectedPlanet(null);
              setLastSearchedSystem(null);
            }
          }}
          onPlanetClick={handlePlanetClick}
          onPlanetDoubleClick={handlePlanetDoubleClick}
          searchQuery={searchQuery}
          onStarFound={(system) => {
            setCompactSystem(system);
            setSelectedSystem(null);
            setSelectedPlanet(null);
            setLastSearchedSystem(system.hostname);
          }}
          sizeScale={sizeScale}
          isPaused={isPaused}
          setIsPaused={setIsPaused}
          activeFilters={activeFilters}
          colorByField={colorByField}
          systems={systems}
          showHabitableZones={showHabitableZones}
        />
        <ScaleBarUpdater />
      </Canvas>
      <ScaleBar />
      
      {/* Loading message */}
      {isLoading && (
        <div style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          padding: '1rem',
          borderRadius: '8px',
          color: 'white',
          zIndex: 1000,
          fontFamily: 'Arial, sans-serif',
          fontSize: '1.5rem',
          textAlign: 'center'
        }}>
          Loading COOLeidoscope...
        </div>
      )}
      
      {/* Size scale slider */}
      <div 
        style={{
          position: 'absolute',
          bottom: '55px',
          left: '350px',
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          color: 'white',
          padding: '8px',
          borderRadius: '4px',
          width: '280px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}
      >
        <span style={{ fontSize: '0.8em' }}>Real size</span>
        <input
          ref={sizeSliderRef}
          type="range"
          min="1"
          max="1000"
          step="1"
          defaultValue={String(sizeScale)}
          onChange={handleSizeChange}
          onKeyDown={(e) => {
            if (e.code === 'Space') {
              e.preventDefault();
              e.stopPropagation();
              setIsPaused(prev => !prev);
            }
          }}
          style={{ 
            flex: 1,
            cursor: 'pointer'
          }}
        />
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: '0.8em' }}>Enlarged</span>
      </div>

      {colorByField && activeFilters.find(f => f.field === colorByField)?.range && (
        <ColorLegend 
          field={activeFilters.find(f => f.field === colorByField)?.label || ''}
          min={activeFilters.find(f => f.field === colorByField)?.range?.colorRange.min || 0}
          max={activeFilters.find(f => f.field === colorByField)?.range?.colorRange.max || 0}
        />
      )}

      <div style={{
        position: 'fixed',
        top: '1rem',
        right: '1rem',
        zIndex: 1000,
      }}>
        <div style={{ position: 'relative' }}>
          <input
            type="text"
            placeholder="Search for stars or planets... (min. 2 chars)"
            value={searchQuery}
            onChange={(e) => {
              console.log('Search input changed:', e.target.value);
              setSearchQuery(e.target.value);
            }}
            onKeyDown={handleSearchKeyDown}
            style={{
              padding: '0.5rem',
              borderRadius: '4px',
              border: '1px solid #666',
              height: '38px',
              backgroundColor: 'rgba(0, 0, 0, 0.7)',
              color: 'white',
              width: '300px',
            }}
          />
          {suggestions.length > 0 && (
            <div className="suggestions-container">
              {suggestions.map((system) => (
                <div
                  key={system.hostname}
                  onClick={() => {
                    if (sceneRef.current) {
                      sceneRef.current.focusOnStar(system);
                    }
                    setSearchQuery('');
                    setCompactSystem(system);
                    setSelectedSystem(null);
                    setSelectedPlanet(null);
                    setSuggestions([]);
                    setLastSearchedSystem(system.hostname);
                  }}
                  className="suggestion-item"
                  style={{
                    padding: '0.5rem',
                    cursor: 'pointer',
                    color: 'white',
                    borderBottom: '1px solid #444'
                  }}
                >
                  <div>{system.hostname}</div>
                  <div style={{ fontSize: '0.8em', color: '#aaa' }}>
                    {system.planets.length} planet{system.planets.length !== 1 ? 's' : ''}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {/* Home button */}
      <button
        onClick={() => {
          if (sceneRef.current) {
            sceneRef.current.resetView();
          }
          // Close any open panels
          setCompactSystem(null);
          setSelectedSystem(null);
          setSelectedPlanet(null);
        }}
        style={{
          position: 'fixed',
          top: '1rem',
          right: '22.6em',
          padding: '8px',
          width: '38px',
          height: '38px',
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          border: '1px solid #666',
          borderRadius: '4px',
          color: 'white',
          cursor: 'pointer',
          zIndex: 1000,
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2.5L2 11.5H5V20.5H19V11.5H22L12 2.5Z" fill="white"/>
        </svg>
      </button>

      {/* COOL Research DAO Logo */}
      <div style={{
        position: 'fixed',
        top: '1rem',
        left: '1rem',
        zIndex: 1000,
      }}>
        <img 
          src="https://raw.githubusercontent.com/COOL-Research-DAO/Database/main/logo/COOLeidoscope_logo_black.png" 
          alt="COOLeidoscope Logo" 
          style={{
            height: '80px',
            backgroundColor: 'white',
            padding: '0px',
            borderRadius: '0px',
          }}
        />
      </div>

      {showHelp && (
        <div style={{
          position: 'fixed',
          top: '6rem',
          left: '0.5rem',
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          padding: '1rem',
          borderRadius: '8px',
          color: 'white',
          zIndex: 1000,
        }}>
          <h3 style={{ margin: '0 0 0.5rem 0' }}>Controls</h3>
          <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
            <li>Left-click + drag to pan</li>
            <li>Right-click + drag to rotate</li>
            <li>Scroll to zoom</li>
            <li>Click on stars to see detailed info</li>
            <li>Click on planets to see detailed info and display knowledge graphs</li>
            <li>Double-click on stars and planets to focus</li>
            <li>Space bar to pause/resume planet motion</li>
            <li>Use search bar to find stars</li>
          </ul>
          <button
            onClick={() => setShowHelp(false)}
            style={{
              marginTop: '0.5rem',
              padding: '0.25rem 0.5rem',
              backgroundColor: '#333',
              border: 'none',
              borderRadius: '4px',
              color: 'white',
              cursor: 'pointer',
            }}
          >
            Got it!
          </button>
        </div>
      )}
      {selectedSystem && (
        <div style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 1000,
        }}>
          <StarInfoModal 
            system={selectedSystem} 
            onClose={() => setSelectedSystem(null)} 
            compact={false}
            showHabitableZones={showHabitableZones}
            onToggleHabitableZones={() => setShowHabitableZones(!showHabitableZones)}
          />
        </div>
      )}
      {selectedPlanet && (
        <div style={{
          position: 'fixed',
          bottom: '1rem',
          right: '1rem',
          zIndex: 1000,
        }}>
          <PlanetInfoModal 
            planet={selectedPlanet.system.planets[selectedPlanet.planetIndex]}
            onClose={() => setSelectedPlanet(null)}
          />
        </div>
      )}
      <div style={{
        position: 'fixed',
        bottom: '1rem', 
        left: '0.5rem',
        zIndex: 999,
        maxWidth: '300px',
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        borderRadius: '8px',
        padding: compactSystem ? '1rem' : 0,
      }}>
        <StarInfoModal 
          system={compactSystem} 
          onClose={() => setCompactSystem(null)} 
          compact={true}
          showHabitableZones={showHabitableZones}
          onToggleHabitableZones={() => setShowHabitableZones(!showHabitableZones)}
        />
      </div>
      
      {/* Filter button */}
      <button
        onClick={() => setIsFilterPanelOpen(true)}
        style={{
          position: 'fixed',
          top: '1rem',
          right: '320px',
          padding: '8px',
          width: '38px',
          height: '38px',
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          border: '1px solid #666',
          borderRadius: '4px',
          color: 'white',
          cursor: 'pointer',
          zIndex: 1000,
        }}
      >
        <FaFilter />
      </button>
      
      <FilterPanel
        systems={systems}
        onFiltersChange={setActiveFilters}
        onColorByChange={setColorByField}
        isOpen={isFilterPanelOpen}
        onClose={() => setIsFilterPanelOpen(false)}
      />
      {/* Pause/Play indicator */}
      <div 
        key={isPaused ? 'paused' : 'playing'}
        style={{
          position: 'fixed',
          bottom: '5%',  
          left: '50%',
          transform: 'translate(-50%, -50%)',
          backgroundColor: 'transparent',
          color: 'white',
          padding: '0',
          borderRadius: '4px',
          fontFamily: 'monospace',
          fontSize: '56px',
          zIndex: 1000,
          animation: 'fadeOut 1.7s ease-out forwards',
        }}
      >
        {isPaused ? '⏸' : '⏵'}
      </div>

      {/* Footer */}
      <div style={{
        position: 'fixed',
        bottom: '0.5rem',
        left: '0',
        width: '100%',
        textAlign: 'center',
        color: '#b5b5b5',
        fontSize: '0.9rem',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '4px'
      }}>
        <img 
          src="https://raw.githubusercontent.com/COOL-Research-DAO/Database/main/logo/COOLeidoscope_logo_black.png" 
          alt="COOLeidoscope Logo" 
          style={{
            height: '28px',
            backgroundColor: 'white',
            padding: '0px',
            borderRadius: '0px',
          }}
        />
        built by COOL Research Labs 2025 | <a href="https://coolresearch.io/" target="_blank" rel="noopener noreferrer" style={{ color: '#3B82F6', textDecoration: 'underline' }}>coolresearch.io</a>
      </div>
      
      <style>
        {`
          @keyframes fadeOut {
            0% { opacity: 1; }
            100% { opacity: 0; }
          }
        `}
      </style>
    </div>
  );
} 

export default ExoplanetScene; 