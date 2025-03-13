import { useEffect, useRef, useState, useMemo, forwardRef, useImperativeHandle, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Stars, Text, useTexture } from '@react-three/drei';
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
}

interface PlanetsProps {
  system: ExoplanetSystem;
  visible: boolean;
  isPaused: boolean;
  starRadius: number;
}

function Planets({ system, visible, isPaused, starRadius }: PlanetsProps) {
  if (!visible) return null;

  const orbitSegments = 64;
  const orbitScaleFactor = 0.00485; // 1/206,265 to match parsec scale
  const { camera } = useThree();
  
  const position = equatorialToCartesian(system.ra, system.dec, system.sy_dist);
  const distanceToCamera = new THREE.Vector3(...position).distanceTo(camera.position);
  
  // Only show planets when very close to the system
  const showPlanets = distanceToCamera < 10;
  const showOrbitsWithDots = distanceToCamera < 20;
  
  // Create refs for all planets
  const planetRefs = useRef<THREE.Group[]>([]);
  if (planetRefs.current.length !== system.planets.length) {
    planetRefs.current = system.planets.map(() => new THREE.Group());
  }

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
  
  useFrame((state) => {
    if (isPaused) return;
    
    planetRefs.current.forEach((group, index) => {
      const planet = system.planets[index];
      const orbitRadius = (planet.pl_orbsmax || (index + 1)) * orbitScaleFactor;
      
      // Adjust speed based on camera distance - slower when closer
      const speedScale = Math.max(0.01, Math.min(1, distanceToCamera / 50));
      
      // Use orbital period if available (in days), otherwise calculate from semi-major axis
      // We divide by 365 to convert days to years for a more reasonable speed
      const orbitalPeriod = planet.pl_orbper ? planet.pl_orbper / 365 : Math.pow(orbitRadius, 1.5);
      const orbitSpeed = (50 / orbitalPeriod) * speedScale;
      const angle = state.clock.getElapsedTime() * orbitSpeed;
      
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
    });
  });

  // Calculate relative sizes based on radius or mass
  const planetSizes = system.planets.map(planet => {
    if (planet.pl_rade) {
      // Convert Earth radius to Sun radius (1 Earth radius ≈ 0.009167 Sun radius)
      return planet.pl_rade * 0.009167;
    } else if (planet.pl_masse) {
      // Convert mass to approximate radius using cube root
      // Assuming similar density to Earth, mass in Earth masses
      return Math.pow(planet.pl_masse, 1/3) * 0.009167;
    }
    return 0.009167; // Default size if neither radius nor mass is available (1 Earth radius)
  });

  // Add state for hovered planet
  const [hoveredPlanet, setHoveredPlanet] = useState<number | null>(null);

  return (
    <>
      {system.planets.map((planet, index) => {
        const orbitRadius = (planet.pl_orbsmax || (index + 1)) * orbitScaleFactor;
        // Use actual planet size relative to star size
        const planetRadius = showPlanets ? 
          planetSizes[index] * starRadius * 1 : 0.02;
        
        const vertices = new Float32Array(
          Array.from({ length: orbitSegments + 1 }, (_, i) => {
            const t = (i / orbitSegments) * Math.PI * 2;
            const eccentricity = planet.pl_orbeccen || 0;
            const semiMajorAxis = orbitRadius;
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
            
            {showPlanets ? (
              <group ref={(el) => { if (el) planetRefs.current[index] = el; }}>
                <mesh 
                  scale={[planetRadius, planetRadius, planetRadius]}
                  onPointerOver={() => setHoveredPlanet(index)}
                  onPointerOut={() => setHoveredPlanet(null)}
                >
                  <sphereGeometry args={[1, 32, 32]} />
                  <primitive object={planetShaders.current[index]} />
                </mesh>
                
                <PlanetInfoPanel 
                  planet={planet} 
                  visible={hoveredPlanet === index}
                  position={[0, planetRadius, 0]}
                  distanceToCamera={distanceToCamera}
                />
              </group>
            ) : showOrbitsWithDots && (
              <mesh position={[orbitRadius, 0, 0]} scale={[0.05, 0.05, 0.05]}>
                <sphereGeometry args={[1, 8, 8]} />
                <meshBasicMaterial color="#ffffff" />
              </mesh>
            )}
          </group>
        );
      })}
    </>
  );
}

function Star({ system, scale, isFar, onClick, onDoubleClick, isHighlighted, isPaused }: StarProps) {
  const [hovered, setHovered] = useState(false);
  const position = equatorialToCartesian(system.ra, system.dec, system.sy_dist);
  const color = temperatureToColor(system.st_teff);
  const textRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const { camera } = useThree();
  
  const distanceToCamera = new THREE.Vector3(...position).distanceTo(camera.position);
  const showPlanets = distanceToCamera < 20;
  
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
  
  // Calculate the smallest orbit radius
  const minOrbitRadius = Math.min(...system.planets.map(p => p.pl_orbsmax || 1)) * 0.00000485;
  // Make star size proportional to smallest orbit radius but never larger than it
  const realStarSize = Math.min(
    (system.st_rad ? system.st_rad * 0.5 : 0.5),
    minOrbitRadius * 0.8
  );
  const fixedSize = 0.3;
  const minVisibleSize = 0.1; // Minimum size for visibility
  
  // Smooth transition between 8 and 12 distance units
  const transitionStart = 8;
  const transitionEnd = 12;
  const t = Math.max(0, Math.min(1, 
    (distanceToCamera - transitionStart) / (transitionEnd - transitionStart)
  ));
  
  const starRadius = Math.max(minVisibleSize, fixedSize * t + realStarSize * (1 - t));

  // Determine star detail level based on distance
  const getStarDetail = () => {
    if (distanceToCamera > 100) return [8, 8]; // Very far - low detail
    if (distanceToCamera > 50) return [16, 16]; // Far - medium detail
    if (distanceToCamera > 20) return [24, 24]; // Medium - good detail
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
      
      <Planets system={system} visible={showPlanets} isPaused={isPaused} starRadius={starRadius} />
      
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
}

interface SceneProps {
  onStarClick: (system: ExoplanetSystem) => void;
  searchQuery: string;
  onStarFound?: (system: ExoplanetSystem) => void;
  onStarDoubleClick?: (system: ExoplanetSystem) => void;
}

export interface SceneHandle {
  focusOnStar: (system: ExoplanetSystem) => void;
}

const Scene = forwardRef<SceneHandle, SceneProps>(({ onStarClick, searchQuery, onStarFound, onStarDoubleClick }, ref) => {
  const [systems, setSystems] = useState<ExoplanetSystem[]>([]);
  const [scale, setScale] = useState(1);
  const [highlightedSystem, setHighlightedSystem] = useState<ExoplanetSystem | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const { camera } = useThree();
  const controlsRef = useRef<any>(null);
  const [compactSystem, setCompactSystem] = useState<ExoplanetSystem | null>(null);
  const [selectedSystem, setSelectedSystem] = useState<ExoplanetSystem | null>(null);
  const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Handle space bar press
  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        event.preventDefault(); // Prevent page scroll
        setIsPaused(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);

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
    const startTarget = new THREE.Vector3();
    controlsRef.current?.target.clone(startTarget);
    
    // Calculate the zoom distance based on the largest orbit radius
    const maxOrbitRadius = Math.max(...system.planets.map(p => p.pl_orbsmax || 0), 5) * 0.000485;
    const zoomDistance = maxOrbitRadius * 2; // Reduced from 4 to 2 to allow closer view
    
    // Calculate the new camera position by moving along the current view direction
    const currentDirection = new THREE.Vector3();
    camera.getWorldDirection(currentDirection);
    const newCameraPosition = new THREE.Vector3()
      .copy(targetPosition)
      .add(currentDirection.multiplyScalar(zoomDistance));
    
    let startTime = performance.now();
    const animate = (currentTime: number) => {
      const elapsed = (currentTime - startTime) / 1000;
      const progress = Math.min(1, elapsed / duration);
      const easeProgress = progress * (2 - progress); // easeOut quad
      
      if (controlsRef.current) {
        // Move both the camera and its target
        camera.position.lerpVectors(camera.position, newCameraPosition, easeProgress);
        controlsRef.current.target.lerpVectors(startTarget, targetPosition, easeProgress);
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
  }, [camera]);

  useImperativeHandle(ref, () => ({
    focusOnStar
  }), [focusOnStar]);

  useEffect(() => {
    loadExoplanetData().then(setSystems);
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
  });
  
  // Calculate which systems are far away based on camera distance
  const farThreshold = 50;
  const isFar = (system: ExoplanetSystem) => {
    const position = equatorialToCartesian(system.ra, system.dec, system.sy_dist);
    return new THREE.Vector3(...position).distanceTo(camera.position) > farThreshold;
  };
  
  return (
    <>
      <ambientLight intensity={1.0} />
      <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade />
      {systems.map((system) => (
        <Star 
          key={system.hostname} 
          system={system} 
          scale={scale} 
          isFar={isFar(system)}
          onClick={() => handleStarClick(system)}
          onDoubleClick={() => handleStarDoubleClick(system)}
          isHighlighted={system === highlightedSystem}
          isPaused={isPaused}
        />
      ))}
      <OrbitControls
        ref={controlsRef}
        enableDamping
        dampingFactor={0.05}
        rotateSpeed={0.1}
        panSpeed={1.0}
        zoomSpeed={1}
        minDistance={0.00000485}
        maxDistance={1000}
        screenSpacePanning={true}
        target={[0, 0, 0]}
        maxPolarAngle={Math.PI / 2}
        mouseButtons={{
          LEFT: THREE.MOUSE.PAN,
          MIDDLE: THREE.MOUSE.DOLLY,
          RIGHT: THREE.MOUSE.ROTATE
        }}
      />
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
        camera={{ position: [0, 0, 50], fov: 45 }}
        gl={{ antialias: true }}
        dpr={[1, 2]}
        style={{ background: '#000' }}
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
        />
      </Canvas>
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

function PlanetInfoPanel({ planet, visible, position, distanceToCamera }: { 
  planet: any, 
  visible: boolean, 
  position: [number, number, number] | THREE.Vector3,
  distanceToCamera: number
}) {
  const { camera } = useThree();
  const textRef = useRef<THREE.Group>(null);
  const panelHeight = 2.2; // Height of the background plane
  const panelOffset = -0.5; // Distance from planet to bottom of panel
  
  useFrame(() => {
    if (textRef.current) {
      // Make text always face the camera
      textRef.current.quaternion.copy(camera.quaternion);
      
      // Use the same scaling approach as the star name
      const baseScale = 0.04;
      const scaleFactor = distanceToCamera * baseScale;
      
      textRef.current.scale.setScalar(scaleFactor);
    }
  });
  
  if (!visible) return null;
  
  // Format values with units
  const formatValue = (value: number | null, precision: number = 2, unit: string = ''): string => {
    if (value === null || isNaN(value)) return 'Unknown';
    return `${value.toFixed(precision)}${unit}`;
  };
  
  // Determine which properties are available
  const hasRadius = planet.pl_rade !== null && !isNaN(planet.pl_rade);
  const hasMass = planet.pl_masse !== null && !isNaN(planet.pl_masse);
  const hasPeriod = planet.pl_orbper !== null && !isNaN(planet.pl_orbper);
  const hasSMA = planet.pl_orbsmax !== null && !isNaN(planet.pl_orbsmax);
  
  // Count available properties to adjust panel height
  const availableProps = [hasRadius, hasMass, hasPeriod, hasSMA].filter(Boolean).length;
  
  // Adjust panel height based on available properties
  // Base height for planet name + padding, plus height per property
  const dynamicPanelHeight = 1.0 + (availableProps * 0.5);
  
  // Calculate position so bottom of panel is at a fixed distance above the planet
  // The panel's pivot is at its center, so we need to offset by half its height plus the desired gap
  const panelY = (dynamicPanelHeight / 2) + panelOffset;
  
  // Handle both Vector3 and array position types
  const posX = position instanceof THREE.Vector3 ? position.x : position[0];
  const posY = position instanceof THREE.Vector3 ? position.y : position[1];
  const posZ = position instanceof THREE.Vector3 ? position.z : position[2];
  
  // Calculate positions for each text element
  let textPositions = [];
  let currentY = 0.7; // Start position for the planet name
  
  // Add planet name
  textPositions.push({ text: planet.pl_name, y: currentY, isTitle: true });
  
  // Add available properties with proper spacing
  const spacing = 0.4;
  currentY -= spacing;
  
  if (hasRadius) {
    textPositions.push({ 
      text: `Radius: ${formatValue(planet.pl_rade, 2, ' R⊕')}`, 
      y: currentY, 
      isTitle: false 
    });
    currentY -= spacing;
  }
  
  if (hasMass) {
    textPositions.push({ 
      text: `Mass: ${formatValue(planet.pl_masse, 2, ' M⊕')}`, 
      y: currentY, 
      isTitle: false 
    });
    currentY -= spacing;
  }
  
  if (hasPeriod) {
    textPositions.push({ 
      text: `Period: ${formatValue(planet.pl_orbper, 1, ' days')}`, 
      y: currentY, 
      isTitle: false 
    });
    currentY -= spacing;
  }
  
  if (hasSMA) {
    textPositions.push({ 
      text: `Semi-major axis: ${formatValue(planet.pl_orbsmax, 3, ' AU')}`, 
      y: currentY, 
      isTitle: false 
    });
  }
  
  return (
    <group position={[posX, posY + panelY, posZ]} ref={textRef}>
      <mesh position={[0, 0, 0]}>
        <planeGeometry args={[5, dynamicPanelHeight]} />
        <meshBasicMaterial color="black" transparent opacity={0.7} />
      </mesh>
      
      {textPositions.map((item, index) => (
        <Text
          key={index}
          position={[0, item.y, 0.01]}
          fontSize={item.isTitle ? 0.45 : 0.35}
          color="white"
          anchorX="center"
          anchorY="middle"
          fontWeight={item.isTitle ? "bold" : "normal"}
          outlineWidth={item.isTitle ? 0.08 : 0}
          outlineColor="black"
          renderOrder={1}
        >
          {item.text}
        </Text>
      ))}
    </group>
  );
} 