import { useEffect, useRef, useState, useMemo, forwardRef, useImperativeHandle, useCallback, memo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Stars, Text, useTexture, Html } from '@react-three/drei';
import { ExoplanetSystem } from '../types/Exoplanet';
import { loadExoplanetData, equatorialToCartesian } from '../utils/dataLoader';
import { temperatureToColor } from '../utils/colorUtils';
import { StarInfoModal } from './StarInfoModal';
import * as THREE from 'three';
import { ColorBar } from './ColorBar';
import gsap from 'gsap';

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
}

interface PlanetsProps {
  system: ExoplanetSystem;
  visible: boolean;
  isPaused: boolean;
  starRadius: number;
  sizeScale: number;
  systemMaxScale: number;
  planetScaleRatio: number;
}

function Planets({ system, visible, isPaused, starRadius, sizeScale, systemMaxScale, planetScaleRatio }: PlanetsProps) {
  if (!visible) return null;

  const orbitSegments = 64;
  const orbitScaleFactor = 1 / 206265; // Convert AU to parsecs
  const { camera } = useThree();
  
  // Remove the position calculation here since the star is already at its adjusted position
  const distanceToCamera = camera.position.length(); // Distance to origin, since star is now at 0,0,0
  
  // Show planets with different detail levels based on distance
  const showDetailedPlanets = distanceToCamera < 100/206265;
  const showSimplePlanets = distanceToCamera < 0.01;
  
  // Create refs for all planets
  const planetRefs = useRef<THREE.Group[]>([]);
  if (planetRefs.current.length !== system.planets.length) {
    planetRefs.current = system.planets.map(() => new THREE.Group());
  }

  // Track elapsed time and pause state
  const animationRef = useRef({
    elapsedTime: 0,
    lastFrameTime: 0
  });
  const lastCameraDistanceRef = useRef<number | null>(null);
  const pausedAnglesRef = useRef<number[]>([]);
  const wasPausedRef = useRef(false);

  // Create separate shader instances for each planet
  const planetShaders = useRef<THREE.ShaderMaterial[]>([]);
  if (planetShaders.current.length !== system.planets.length) {
    planetShaders.current = system.planets.map(() => {
      const shader = {
        uniforms: {
          lightDirection: { value: new THREE.Vector3(0, 0, 0) },
          dayColor: { value: new THREE.Color(0xffffff) },
          nightColor: { value: new THREE.Color(0xffffff) },
          ambientLight: { value: 0.15 },
          terminatorSharpness: { value: 0.2 }
        },
        vertexShader: `
          uniform vec3 lightDirection;
          varying vec3 vNormal;
          varying vec3 vWorldPosition;
          
          void main() {
            vec4 worldPosition = modelMatrix * vec4(position, 1.0);
            vWorldPosition = worldPosition.xyz;
            // Transform normal to world space
            vNormal = normalize(mat3(modelMatrix) * normal);
            gl_Position = projectionMatrix * viewMatrix * worldPosition;
          }
        `,
        fragmentShader: `
          uniform vec3 lightDirection;
          uniform vec3 dayColor;
          uniform vec3 nightColor;
          uniform float ambientLight;
          uniform float terminatorSharpness;
          varying vec3 vNormal;
          varying vec3 vWorldPosition;
          
          void main() {
            vec3 normal = normalize(vNormal);
            vec3 lightDir = normalize(lightDirection);
            
            // Calculate illumination (dot product)
            float cosTheta = dot(normal, lightDir);
            
            // Create sharp terminator line perpendicular to light direction
            float t = smoothstep(0.0, terminatorSharpness, cosTheta);
            
            // Add ambient light to night side
            vec3 color = mix(nightColor * ambientLight, dayColor, t);
            gl_FragColor = vec4(color, 1.0);
          }
        `
      };
      return new THREE.ShaderMaterial(shader);
    });
  }
  
  useFrame((state, delta) => {
    if (isPaused) return;
    
    animationRef.current.elapsedTime += delta;
    // Update planet positions using animationRef
    
    planetRefs.current.forEach((group, index) => {
      const planet = system.planets[index];
      const orbitRadius = (planet.pl_orbsmax || 
        (planet.pl_orbper ? Math.pow(planet.pl_orbper / 365, 2/3) : index + 1)) / 206265;
      
      // Use orbital period if available (in days), otherwise calculate from semi-major axis
      const orbitalPeriod = planet.pl_orbper ? planet.pl_orbper / 365 : Math.pow(orbitRadius, 1.5);
      const orbitSpeed = (1 / orbitalPeriod) * Math.pow(30000 * distanceToCamera, 1.5);
      
      // Calculate the current angle only when not paused
      let angle;
      if (isPaused) {
        angle = pausedAnglesRef.current[index];
      } else {
        const currentAngle = animationRef.current.elapsedTime * orbitSpeed;
        angle = currentAngle;
        // Store the current angle when pausing
        pausedAnglesRef.current[index] = currentAngle;
      }
      
      // Calculate planet position with eccentricity
      const eccentricity = planet.pl_orbeccen || 0;
      const semiMajorAxis = orbitRadius;
      const semiMinorAxis = semiMajorAxis * Math.sqrt(1 - eccentricity * eccentricity);
      const focusOffset = semiMajorAxis * eccentricity;
      
      // Calculate position on elliptical orbit
      const planetX = semiMajorAxis * Math.cos(angle) - focusOffset;
      const planetZ = semiMinorAxis * Math.sin(angle);

      group.position.x = planetX;
      group.position.z = planetZ;
      
      // Update planet material uniforms
      if (group.children[0] instanceof THREE.Mesh) {
        // Calculate vector from planet to star (this defines the terminator plane)
        const planetPosition = new THREE.Vector3(planetX, 0, planetZ);
        const starPosition = new THREE.Vector3(0, 0, 0); // Star is at origin
        const lightDir = starPosition.clone().sub(planetPosition).normalize();
        
        // Update shader uniform with world space light direction for this planet
        planetShaders.current[index].uniforms.lightDirection.value.copy(lightDir);
      }

      // Add debug logging
      console.log('Planet rendering debug:', {
        name: planet.pl_name,
        systemName: system.hostname,
        distanceToCamera,
        planetRadius: orbitRadius,
        isDetailedMode: showDetailedPlanets,
        position: group.position,
        scale: group.scale
      });
    });
  });

  // Calculate relative sizes based on radius or mass
  const planetSizes = useMemo(() => system.planets.map(planet => {
    // First calculate the real size in AU
    const realSizeAU = planet.pl_rade 
      ? planet.pl_rade * 0.0000046491 // Earth radii to AU
      : planet.pl_masse 
        ? Math.pow(planet.pl_masse, 1/3) * 0.0000046491 // Mass to approximate radius in AU
        : 0.0000046491; // Default to Earth radius in AU

    // Then convert to parsecs (only once)
    const realSize = realSizeAU / 206265;

    // Use the same scaling logic as the star
    const sliderRange = 1000 - 1;
    const t = Math.max(0, Math.sqrt((sizeScale - 1) / sliderRange));
    
    // Scale from real size (when t=0) up to maximum size (when t=1)
    const scaledSize = realSize * (1 + t * systemMaxScale);

    console.log('Planet size calculation:', {
      planetName: planet.pl_name,
      realSizeAU,
      realSize,
      sliderValue: sizeScale,
      t,
      systemMaxScale,
      scaledSize,
      scalingFactor: (1 + t * systemMaxScale)
    });

    return scaledSize;
  }), [system.planets, sizeScale, systemMaxScale]);

  // Add state for hovered planet
  const [hoveredPlanet, setHoveredPlanet] = useState<number | null>(null);
  const planetTextRefs = useRef<THREE.Group[]>([]);
  if (planetTextRefs.current.length !== system.planets.length) {
    planetTextRefs.current = system.planets.map(() => new THREE.Group());
  }

  // Add console.log to debug hover state
  console.log('Hover state:', {
    hoveredPlanet,
    distanceToCamera,
    visible
  });

  useFrame((state) => {
    planetTextRefs.current.forEach((group, index) => {
      if (group) {
        group.quaternion.copy(camera.quaternion);
        const baseScale = 0.04;
        const scaleFactor = distanceToCamera * baseScale;
        group.scale.setScalar(scaleFactor);
      }
    });
  });

  return (
    <>
      {system.planets.map((planet, index) => {
        const orbitRadius = (planet.pl_orbsmax || 
          (planet.pl_orbper ? Math.pow(planet.pl_orbper / 365, 2/3) : index + 1)) * orbitScaleFactor;
        
        // Calculate planet size based on distance
        let planetRadius: number | undefined;
        if (showDetailedPlanets) {
          // Use real planet sizes when very close
          planetRadius = planetSizes[index]
        } else if (showSimplePlanets) {
          // Use fixed-size dots at medium distance
          planetRadius = 0.005 * distanceToCamera; // Fixed size for visibility
        }
        
        const vertices = new Float32Array(
          Array.from({ length: orbitSegments + 1 }, (_, i) => {
            const t = (i / orbitSegments) * Math.PI * 2;
            const eccentricity = planet.pl_orbeccen || 0;
            const semiMajorAxis = (planet.pl_orbsmax || 
              (planet.pl_orbper ? Math.pow(planet.pl_orbper / 365, 2/3) : index + 1)) / 206265;
            const semiMinorAxis = semiMajorAxis * Math.sqrt(1 - eccentricity * eccentricity);
            const focusOffset = semiMajorAxis * eccentricity;
            
            // Parametric equations for ellipse with offset focus
            const x = semiMajorAxis * Math.cos(t) - focusOffset;
            const z = semiMinorAxis * Math.sin(t);
            return [x, 0, z];
          }).flat()
        );
        
        return (
          <group key={planet.pl_name}>
            <line>
              <bufferGeometry>
                <bufferAttribute attach="attributes-position" args={[vertices, 3]} />
              </bufferGeometry>
              <lineBasicMaterial color="#666666" opacity={0.8} transparent />
            </line>

            {/* Calculate planet position */}
            {(() => {
              const eccentricity = planet.pl_orbeccen || 0;
              const semiMajorAxis = orbitRadius;
              const semiMinorAxis = semiMajorAxis * Math.sqrt(1 - eccentricity * eccentricity);
              const focusOffset = semiMajorAxis * eccentricity;
              
              // Calculate orbital speed
              const orbitalPeriod = planet.pl_orbper ? planet.pl_orbper / 365 : Math.pow(semiMajorAxis, 1.5);
              const orbitSpeed = (1 / orbitalPeriod) * Math.pow(30000 * distanceToCamera, 1.5);
              
              // Calculate the current angle
              let angle;
              if (isPaused) {
                angle = pausedAnglesRef.current[index];
              } else {
                const currentAngle = animationRef.current.elapsedTime * orbitSpeed;
                angle = currentAngle;
                // Store the current angle when pausing
                pausedAnglesRef.current[index] = currentAngle;
              }
              
              // Calculate position on elliptical orbit
              const planetX = semiMajorAxis * Math.cos(angle) - focusOffset;
              const planetZ = semiMinorAxis * Math.sin(angle);

              return (
                <>
                  {(showDetailedPlanets || showSimplePlanets) && (
                    <>
                      <group ref={(el) => { if (el) planetRefs.current[index] = el; }}>
                        <mesh 
                          scale={[planetRadius!, planetRadius!, planetRadius!]}
                          onPointerOver={() => {
                            console.log('Planet hovered:', planet.pl_name, 'radius:', planetRadius);
                            setHoveredPlanet(index);
                          }}
                          onPointerOut={() => {
                            console.log('Planet unhovered:', planet.pl_name);
                            setHoveredPlanet(null);
                          }}
                        >
                          <sphereGeometry args={[1, 128, 128]} />
                          {showDetailedPlanets ? (
                            <primitive object={planetShaders.current[index]} />
                          ) : (
                            <meshStandardMaterial 
                              color="#ffffff"
                              roughness={0.8}
                              metalness={0.2}
                              envMapIntensity={2}
                              dithering={true}
                              toneMapped={true}
                              flatShading={false}
                              side={THREE.DoubleSide}
                              transparent={false}
                              opacity={1}
                              depthWrite={true}
                              depthTest={true}
                              polygonOffset={true}
                              polygonOffsetFactor={1}
                              polygonOffsetUnits={1}
                            />
                          )}
                        </mesh>
                      </group>
                      {hoveredPlanet === index && (
                        <group ref={(el) => { if (el) planetTextRefs.current[index] = el; }}>
                          <Text
                            position={[planetX, planetRadius! * 3, planetZ]}
                            fontSize={0.8}
                            color="white"
                            anchorX="center"
                            anchorY="middle"
                            renderOrder={2}
                            outlineWidth={0.08}
                            outlineColor="black"
                          >
                            {planet.pl_name}
                          </Text>
                        </group>
                      )}
                    </>
                  )}
                </>
              );
            })()}
          </group>
        );
      })}
    </>
  );
}

const Star = memo(function Star({ system, scale, isFar, onClick, onDoubleClick, isHighlighted, isPaused, position, sizeScale }: StarProps) {
  const [hovered, setHovered] = useState(false);
  const color = temperatureToColor(system.st_teff);
  const textRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const { camera } = useThree();
  
  const distanceToCamera = new THREE.Vector3(...position).distanceTo(camera.position);
  const showPlanets = distanceToCamera < 1; // 100 parsecs
  
  useFrame((state) => {
    if (textRef.current) {
      textRef.current.quaternion.copy(camera.quaternion);
      const baseScale = 0.04;
      
      // Scale inversely with distance when very close (smaller text when closer)
      let scaleFactor;
      scaleFactor = distanceToCamera * baseScale;
      
      textRef.current.scale.setScalar(scaleFactor);
    }
  });
  
  // Calculate minimum orbital gap for the entire system
  const minOrbitalGap = useMemo(() => {
    if (system.planets.length === 1) {
      // If only one planet, use its distance to the star
      return system.planets[0]?.pl_orbsmax || 
        (system.planets[0]?.pl_orbper ? Math.pow(system.planets[0].pl_orbper / 365, 2/3) : 1); // Changed from 5 to 1
    } else {
      // Find minimum distance between consecutive orbits
      const sortedOrbits = [...system.planets]
        .sort((a, b) => (a.pl_orbsmax || 0) - (b.pl_orbsmax || 0));
      
      let minGap = sortedOrbits[0].pl_orbsmax || 5; // Initialize with first planet's distance from star
      for (let i = 1; i < sortedOrbits.length; i++) {
        const gap = (sortedOrbits[i].pl_orbsmax || 0) - (sortedOrbits[i-1].pl_orbsmax || 0);
        if (gap > 0) minGap = Math.min(minGap, gap);
      }
      return minGap;
    }
  }, [system.planets]);

  // Calculate real star size in parsecs from solar radii
  const realStarSize = system.st_rad 
    ? (system.st_rad * 0.004649) / 206265  // Convert solar radii to parsecs
    : 0.00465 / 206265; // Default to roughly 1 solar radius

  // Calculate maximum scale factor for the entire system
  const systemMaxScale = useMemo(() => {
    // Sort planets by orbit radius
    const sortedPlanets = [...system.planets]
      .sort((a, b) => {
        const aOrbit = a.pl_orbsmax || (a.pl_orbper ? Math.pow(a.pl_orbper / 365, 2/3) : 1);
        const bOrbit = b.pl_orbsmax || (b.pl_orbper ? Math.pow(b.pl_orbper / 365, 2/3) : 1);
        return (aOrbit * (1 - (a.pl_orbeccen || 0))) - (bOrbit * (1 - (b.pl_orbeccen || 0)));
      });
    
    // Calculate star's scale factor (to reach halfway to closest approach of first planet)
    const firstOrbit = sortedPlanets[0]?.pl_orbsmax || 
      (sortedPlanets[0]?.pl_orbper ? Math.pow(sortedPlanets[0].pl_orbper / 365, 2/3) : 1); // Changed from 5 to 1 for first planet
    const firstOrbitEccentricity = sortedPlanets[0]?.pl_orbeccen || 0;
    const periapsis = (1 - firstOrbitEccentricity) * firstOrbit;
    const starMaxRadius = (periapsis / 2) / 206265;
    const starMaxScale = starMaxRadius / realStarSize;
    
    // Calculate each planet's maximum scale factor
    const planetScaleFactors = sortedPlanets.map((planet, index) => {
      const thisOrbit = planet.pl_orbsmax || 
        (planet.pl_orbper ? Math.pow(planet.pl_orbper / 365, 2/3) : index + 1);
      const thisEccentricity = planet.pl_orbeccen || 0;
      const thisPerihelion = thisOrbit * (1 - thisEccentricity);
      let maxGapRadius = Infinity;

      // Check distance to star
      if (index === 0) {
        maxGapRadius = thisPerihelion * 0.3;
      }
      
      // Check distance to previous orbit's perihelion
      if (index > 0) {
        const prevOrbit = sortedPlanets[index - 1].pl_orbsmax || index;
        const prevEccentricity = sortedPlanets[index - 1].pl_orbeccen || 0;
        const prevPerihelion = prevOrbit * (1 - prevEccentricity);
        const gap = thisPerihelion - prevPerihelion;
        maxGapRadius = Math.min(maxGapRadius, gap / 2);
      }
      
      // Check distance to next orbit's perihelion
      if (index < sortedPlanets.length - 1) {
        const nextOrbit = sortedPlanets[index + 1].pl_orbsmax || (index + 2);
        const nextEccentricity = sortedPlanets[index + 1].pl_orbeccen || 0;
        const nextPerihelion = nextOrbit * (1 - nextEccentricity);
        const gap = nextPerihelion - thisPerihelion;
        maxGapRadius = Math.min(maxGapRadius, gap / 2);
      }

      // If this is the only planet or at the edges, use a reasonable default gap
      if (maxGapRadius === Infinity) {
        maxGapRadius = thisPerihelion * 0.3; // Use 30% of perihelion as default gap
      }

      // Calculate this planet's real size in AU
      const planetRealSize = planet.pl_rade 
        ? planet.pl_rade * 0.0000046491 // Earth radii to AU
        : planet.pl_masse 
          ? Math.pow(planet.pl_masse, 1/3) * 0.0000046491 // Mass to approximate radius in AU
          : 0.0000046491; // Default to Earth radius in AU

      // Calculate maximum scale factor as ratio of max allowed size to real size
      return maxGapRadius / planetRealSize;
    });

    // Find minimum scale factor among all planets, with a reasonable minimum
    const planetMaxScale = Math.min(1000000, ...planetScaleFactors);
    
    return {
      starMaxScale,
      planetMaxScale
    };
  }, [system.planets, realStarSize]);

  // Calculate star radius based on distance and scale
  let starRadius;
  if (distanceToCamera <= 0.01) {
    const sliderRange = 1000 - 1; // max - min
    const t = Math.sqrt((sizeScale - 1) / sliderRange);
    starRadius = realStarSize * (1 + t * (systemMaxScale.starMaxScale - 1));
  } else if (distanceToCamera <= 0.1) {
    // Transition between real size and standard scaling
    const t = (distanceToCamera - 0.01) / (1 - 0.01); // 0 to 1
    const standardSize = 0.004 * (1 + (1 - distanceToCamera) * 2);
    starRadius = realStarSize * (1 - t) + standardSize * t;
  } else if (distanceToCamera <= 1) {
    // Linear scaling between 0.1 and 1 parsecs
    starRadius = 0.004 * distanceToCamera;
  } else if (distanceToCamera <= 50) {
    // Linear scaling between 1 and 50 parsecs
    starRadius = 0.004 * distanceToCamera;
  } else {
    // Progressive decrease beyond 50 parsecs
    const t = (distanceToCamera - 50) / 50; // Factor for gradual decrease
    starRadius = 0.004 * 50 * Math.pow(0.9, t); // Decrease by 10% for each 50pc step
  }

  // Determine star detail level based on distance
  const getStarDetail = () => {
    if (distanceToCamera > 100) return [8, 8]; // Very far - low detail
    if (distanceToCamera > 50) return [16, 16]; // Far - medium detail
    if (distanceToCamera > 10) return [24, 24]; // Medium - good detail
    return [32, 32]; // Close - high detail
  };
  
  const [segmentsW, segmentsH] = getStarDetail();
  
  return (
    <group position={position}>
      <pointLight
        color={color}
        intensity={2}
        distance={50}
        decay={2}
      />
      
      <mesh
        ref={meshRef}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        scale={[starRadius, starRadius, starRadius]}
      >
        <sphereGeometry args={[1, segmentsW, segmentsH]} />
        <meshBasicMaterial
          color={color}
          toneMapped={false}
        />
      </mesh>
      
      {/* Add a slightly larger glow sphere behind the star */}
      <mesh scale={[starRadius * 1.2, starRadius * 1.2, starRadius * 1.2]}>
        <sphereGeometry args={[1, segmentsW, segmentsH]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.3}
          toneMapped={false}
        />
      </mesh>
      
      <Planets 
        system={system} 
        visible={showPlanets} 
        isPaused={isPaused} 
        starRadius={starRadius}
        sizeScale={sizeScale}
        systemMaxScale={systemMaxScale.planetMaxScale}
        planetScaleRatio={systemMaxScale.planetMaxScale}
      />
      
      {(hovered || isHighlighted) && (
        <group ref={textRef}>
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
        </group>
      )}
    </group>
  );
});

interface SceneProps {
  onStarClick: (system: ExoplanetSystem) => void;
  searchQuery: string;
  onStarFound?: (system: ExoplanetSystem) => void;
  onStarDoubleClick?: (system: ExoplanetSystem) => void;
  sizeScale: number;
  isPaused: boolean;
  setIsPaused: React.Dispatch<React.SetStateAction<boolean>>;
}

export interface SceneHandle {
  focusOnStar: (system: ExoplanetSystem) => void;
}

const Scene = forwardRef<SceneHandle, SceneProps>(({ 
  onStarClick, 
  searchQuery, 
  onStarFound, 
  onStarDoubleClick, 
  sizeScale,
  isPaused,
  setIsPaused 
}, ref) => {
  const [systems, setSystems] = useState<ExoplanetSystem[]>([]);
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

  // Handle space bar press
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
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [setIsPaused]);

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
    
    const duration = 1.5;
    const startOffset = universeOffset.clone();
    const endOffset = targetPosition.clone(); // This will be our new universe offset
    
    // Calculate zoom distance as before
    const maxOrbitRadius = Math.max(...system.planets.map(p => (p.pl_orbsmax || 0) / 206265), 5 / 206265);
    const zoomDistance = maxOrbitRadius * 5;
    
    let startTime = performance.now();
    const animate = (currentTime: number) => {
      const elapsed = (currentTime - startTime) / 1000;
      const progress = Math.min(1, elapsed / duration);
      const easeProgress = progress * (2 - progress); // easeOut quad
      
      if (controlsRef.current) {
        // Interpolate the universe offset
        const newOffset = new THREE.Vector3();
        newOffset.lerpVectors(startOffset, endOffset, easeProgress);
        setUniverseOffset(newOffset);
        
        // Reset camera and controls to look at origin
        controlsRef.current.target.set(0, 0, 0);
        camera.position.set(0, 0, zoomDistance);
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
  }, [camera, universeOffset]);

  useImperativeHandle(ref, () => ({
    focusOnStar
  }), [focusOnStar]);

  useEffect(() => {
    console.log('Starting to load exoplanet data...');
    loadExoplanetData()
      .then((data: ExoplanetSystem[]) => {
        console.log('Data loaded successfully:', data.length, 'systems');
        setSystems(data);
      })
      .catch((error: Error) => {
        console.error('Error loading exoplanet data:', error);
      });
  }, []);

  // Handle search
  useEffect(() => {
    if (!searchQuery || searchQuery.length < 2) {
      setHighlightedSystem(null);
      return;
    }
    
    const searchLower = searchQuery.toLowerCase();
    const foundSystem = systems.find(system => 
      system.hostname.toLowerCase().includes(searchLower) ||
      system.planets.some(planet => planet.pl_name.toLowerCase().includes(searchLower))
    );
    
    if (foundSystem) {
      // Only highlight the system, don't focus the camera yet
      setHighlightedSystem(foundSystem);
      // Remove the automatic camera focus
      // focusOnStar(foundSystem);
      // Don't call onStarFound yet, wait for explicit completion
    } else {
      setHighlightedSystem(null);
    }
  }, [searchQuery, systems, camera]);
  
  useFrame((state) => {
    // Adjust scale based on camera distance
    const distance = camera.position.length();
    setScale(Math.max(0.1, Math.min(1, distance / 100)));

    // Update camera distance on each frame
    setCameraDistance(distance);
  });
  
  // Calculate which systems are far away based on camera distance
  const farThreshold = 50;
  const isFar = (system: ExoplanetSystem, position: THREE.Vector3) => {
    const adjustedPosition = new THREE.Vector3(...position).sub(universeOffset);
    return adjustedPosition.length() > farThreshold;
  };
  
  const visibleSystems = useMemo(() => {
    return systems.filter(system => {
      const basePosition = equatorialToCartesian(system.ra, system.dec, system.sy_dist);
      const position = useUniverseOffset 
        ? new THREE.Vector3(...basePosition).sub(universeOffset)
        : new THREE.Vector3(...basePosition);
      return position.length() < 1000; // Only show stars within 1000 parsecs of current view
    });
  }, [systems, universeOffset, useUniverseOffset]);

  return (
    <>
      <ambientLight intensity={1.0} />
      <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade />
      {useMemo(() => visibleSystems.map((system) => {
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
            isHighlighted={system === highlightedSystem}
            isPaused={isPaused}
            sizeScale={sizeScale}
          />
        );
      }), [visibleSystems, universeOffset, scale, highlightedSystem, isPaused, useUniverseOffset, sizeScale])}
      <OrbitControls
        ref={controlsRef}
        enableDamping
        dampingFactor={0.05}
        rotateSpeed={0.1}
        panSpeed={1.0}
        zoomSpeed={1.0}
        minDistance={0.1/206265} // 1 AU
        maxDistance={10000} // 10000 parsecs 
        screenSpacePanning={true}
        target={[0, 0, 0]}
        maxPolarAngle={Math.PI / 2}
        mouseButtons={{
          LEFT: THREE.MOUSE.PAN,
          MIDDLE: THREE.MOUSE.DOLLY,
          RIGHT: THREE.MOUSE.ROTATE
        }}
      />
      <Html position={[0, 0, 0]} style={{ pointerEvents: 'none' }}>
        <div style={{
          position: 'fixed',
          bottom: '20px',
          left: '20px',
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          color: 'white',
          padding: '8px 12px',
          borderRadius: '4px',
          fontFamily: 'monospace',
          fontSize: '14px',
          zIndex: 1000
        }}>
          Distance: {cameraDistance.toFixed(2)} parsecs ({(cameraDistance * 206265).toFixed(0)} AU)
        </div>
        <div 
          key={isPaused ? 'paused' : 'playing'}
          style={{
            position: 'fixed',
            bottom: '-400px',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            color: 'white',
            padding: '12px 16px',
            borderRadius: '4px',
            fontFamily: 'monospace',
            fontSize: '56px',
            zIndex: 1000,
            animation: 'fadeOut 1.7s ease-out forwards',
          }}
        >
          {isPaused ? '⏸' : '⏵'}
        </div>
        <style>
          {`
            @keyframes fadeOut {
              0% { opacity: 1; }
              100% { opacity: 0; }
            }
          `}
        </style>
      </Html>
    </>
  );
});

export default function ExoplanetScene() {
  const [selectedSystem, setSelectedSystem] = useState<ExoplanetSystem | null>(null);
  const [compactSystem, setCompactSystem] = useState<ExoplanetSystem | null>(null);
  const [showHelp, setShowHelp] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<ExoplanetSystem[]>([]);
  const [systems, setSystems] = useState<ExoplanetSystem[]>([]);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const sceneRef = useRef<SceneHandle>(null);
  const [lastSearchedSystem, setLastSearchedSystem] = useState<string | null>(null);
  const [sizeScale, setSizeScale] = useState(1);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    loadExoplanetData().then(setSystems);
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
      const searchLower = searchQuery.toLowerCase();
      const matches = systems
        .filter(system => 
          system.hostname.toLowerCase().includes(searchLower) ||
          system.planets.some(planet => planet.pl_name.toLowerCase().includes(searchLower))
        )
        .slice(0, 5); // Limit to 5 suggestions
      setSuggestions(matches);
    }, 300); // Debounce delay

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery, systems]);

  // Handle search input key press
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && searchQuery.length >= 2) {
      // Find the system
      const searchLower = searchQuery.toLowerCase();
      const foundSystem = systems.find(system => 
        system.hostname.toLowerCase().includes(searchLower) ||
        system.planets.some(planet => planet.pl_name.toLowerCase().includes(searchLower))
      );
      
      if (foundSystem) {
        // Now focus the camera on the star
        if (sceneRef.current) {
          sceneRef.current.focusOnStar(foundSystem);
        }
        
        setCompactSystem(foundSystem);
        setSelectedSystem(null);
        setLastSearchedSystem(foundSystem.hostname);
        
        // Clear search after successful search
        setSearchQuery('');
        setSuggestions([]);
      }
    }
  };

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      <style>
        {`
          .suggestion-item:hover {
            background-color: rgba(255, 255, 255, 0.1);
          }
        `}
      </style>
      <Canvas
        camera={{ 
          position: [0, 0, 50],
          fov: 45, 
          near: 0.1/206265,
          far: 10000 * 206265
        }}
        gl={{ 
          antialias: true, 
          alpha: true,
          powerPreference: "high-performance"
        }}
        dpr={[1, 4]}
        frameloop="always"
        style={{ background: '#000' }}
        onCreated={({ gl }) => {
          gl.setClearColor('#000000', 1);
        }}
      >
        <Scene 
          ref={sceneRef}
          onStarClick={(system) => {
            setSelectedSystem(system);
            setCompactSystem(null);
          }}
          onStarDoubleClick={(system) => {
            // Only update if this isn't the system we just searched for
            if (system.hostname !== lastSearchedSystem) {
              setCompactSystem(system);
              setSelectedSystem(null);
              setLastSearchedSystem(null);
            }
          }}
          searchQuery={searchQuery}
          onStarFound={(system) => {
            setCompactSystem(system);
            setSelectedSystem(null);
            setLastSearchedSystem(system.hostname);
            // Don't clear search automatically
          }}
          sizeScale={sizeScale}
          isPaused={isPaused}
          setIsPaused={setIsPaused}
        />
      </Canvas>
      
      {/* Size scale slider */}
      <div 
        style={{
          position: 'absolute',
          bottom: '100px',
          right: '50px',
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          color: 'white',
          padding: '8px',
          borderRadius: '4px',
          width: '200px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}
      >
        <span style={{ fontSize: '0.8em' }}>Real size</span>
        <input
          type="range"
          min="1"
          max="1000"
          step="1"
          value={Math.max(1, sizeScale)}
          onChange={(e) => setSizeScale(Math.max(1, Number(e.target.value)))}
          onKeyDown={(e) => {
            if (e.code === 'Space') {
              e.preventDefault();
              e.stopPropagation();
              setIsPaused(prev => !prev);
            }
          }}
          style={{ flex: 1 }}
        />
        <span style={{ fontSize: '0.8em' }}>Enlarged</span>
      </div>

      <ColorBar 
        minTemp={(window as any).starTemperatureRange?.min || 2000}
        maxTemp={(window as any).starTemperatureRange?.max || 12000}
      />
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
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            style={{
              padding: '0.5rem',
              borderRadius: '4px',
              border: '1px solid #666',
              backgroundColor: 'rgba(0, 0, 0, 0.7)',
              color: 'white',
              width: '300px',
            }}
          />
          {suggestions.length > 0 && (
            <div style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.9)',
              border: '1px solid #666',
              borderRadius: '4px',
              marginTop: '4px',
              maxHeight: '200px',
              overflowY: 'auto',
            }}>
              {suggestions.map((system) => (
                <div
                  key={system.hostname}
                  onClick={() => {
                    // Focus the camera on the selected star
                    if (sceneRef.current) {
                      sceneRef.current.focusOnStar(system);
                    }
                    
                    setSearchQuery('');
                    setCompactSystem(system);
                    setSelectedSystem(null);
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
      {showHelp && (
        <div style={{
          position: 'fixed',
          top: '1rem',
          left: '1rem',
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
            <li>Double-click on stars to focus and see quick info</li>
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
          />
        </div>
      )}
      <div style={{
        position: 'fixed',
        bottom: '1rem',
        left: '1rem',
        zIndex: 1000,
        maxWidth: '300px',
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        borderRadius: '8px',
        padding: compactSystem ? '1rem' : 0,
      }}>
        <StarInfoModal 
          system={compactSystem} 
          onClose={() => setCompactSystem(null)} 
          compact={true}
        />
      </div>
    </div>
  );
} 