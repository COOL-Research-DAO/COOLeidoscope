import React, { useRef, useState, useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import { ExoplanetSystem } from '../types/Exoplanet';

interface PlanetsProps {
  system: ExoplanetSystem;
  visible: boolean;
  isPaused: boolean;
  starRadius: number;
  sizeScale: number;
  systemMaxScale: number;
  planetScaleRatio: number;
}

export function Planets({ system, visible, isPaused, starRadius, sizeScale, systemMaxScale, planetScaleRatio }: PlanetsProps) {
  const orbitSegments = 64;
  const orbitScaleFactor = 1 / 206265; // Convert AU to parsecs
  const { camera } = useThree();
  const distanceToCamera = camera.position.length(); // Distance to origin, since star is now at 0,0,0
  
  // Show planets with different detail levels based on distance
  const showDetailedPlanets = distanceToCamera < 100/206265;
  const showSimplePlanets = distanceToCamera < 0.01;
  
  // Create refs for all planets
  const planetRefs = useRef<THREE.Group[]>([]);
  const planetTextRefs = useRef<THREE.Group[]>([]);
  const [hoveredPlanet, setHoveredPlanet] = useState<number | null>(null);
  
  // Track elapsed time and pause state
  const animationRef = useRef({
    elapsedTime: 0,
    lastFrameTime: 0
  });
  const lastCameraDistanceRef = useRef<number | null>(null);
  const currentAnglesRef = useRef<number[]>([]);
  const wasPausedRef = useRef(false);

  // Initialize refs if needed
  useEffect(() => {
    if (planetRefs.current.length !== system.planets.length) {
      planetRefs.current = system.planets.map(() => new THREE.Group());
    }
    if (planetTextRefs.current.length !== system.planets.length) {
      planetTextRefs.current = system.planets.map(() => new THREE.Group());
    }
    if (currentAnglesRef.current.length !== system.planets.length) {
      currentAnglesRef.current = new Array(system.planets.length).fill(0);
    }
  }, [system.planets.length]);

  // Create separate shader instances for each planet
  const planetShaders = useRef<THREE.ShaderMaterial[]>([]);
  
  // Initialize shaders if needed
  useEffect(() => {
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
  }, [system.planets.length]);

  // Calculate relative sizes based on radius or mass
  const planetSizes = useMemo(() => {
    // Constants for size calculations
    const earthRadiusInAU = 0.0000046491; // Earth radius in AU
    const auToParsecs = 1 / 206265; // Conversion factor from AU to Parsecs
    const defaultSizeAU = earthRadiusInAU; // Default to Earth size if no data

    // 1. Prepare Planet Data & Sort by Perihelion
    const planetsWithData = system.planets.map((planet, index) => {
      // Calculate real planet size in AU
      const realSizeAU = planet.pl_rade
        ? planet.pl_rade * earthRadiusInAU // Use provided Earth radii
        : planet.pl_masse
          ? Math.pow(planet.pl_masse, 1/3) * earthRadiusInAU // Estimate from Earth masses
          : defaultSizeAU; // Fallback to default size

      // Calculate orbit perihelion in AU
      const orbitRadiusAU = planet.pl_orbsmax ||
        (planet.pl_orbper ? Math.pow(planet.pl_orbper / 365, 2/3) : index + 1); // Use index+1 as fallback semi-major axis if needed
      const eccentricity = planet.pl_orbeccen || 0;
      const perihelionAU = orbitRadiusAU * (1 - eccentricity);

      return { planet, realSizeAU, perihelionAU };
    }).sort((a, b) => a.perihelionAU - b.perihelionAU); // Sort by closest approach to star

    // Handle single planet case or systems where sorting fails
    if (planetsWithData.length < 2) {
      return system.planets.map(planet => {
        const realSizeAU = planet.pl_rade
          ? planet.pl_rade * earthRadiusInAU
          : planet.pl_masse
            ? Math.pow(planet.pl_masse, 1/3) * earthRadiusInAU
            : defaultSizeAU;
        const realSizeInParsecs = realSizeAU * auToParsecs;
        // Apply slider scale without orbital constraints using a default max multiplier
        const sliderRange = systemMaxScale > 1 ? systemMaxScale - 1 : 1;
        const t = systemMaxScale > 1 ? Math.max(0, Math.min(1, (sizeScale - 1) / sliderRange)) : 0;
        const defaultMaxMultiplier = 1000; // Allows scaling up to 1000x real size via slider
        return realSizeInParsecs * (1 + t * defaultMaxMultiplier);
      });
    }

    // 2. Calculate Individual Max Scale Factors based on Gaps
    const individualMaxScaleFactors = planetsWithData.map((current, index) => {
      const prevPerihelionAU = index === 0 ? 0 : planetsWithData[index - 1].perihelionAU; // Star is at 0
      const nextPerihelionAU = index === planetsWithData.length - 1 ? Infinity : planetsWithData[index + 1].perihelionAU; // No next planet for the last one

      const prevGapAU = Math.max(0, current.perihelionAU - prevPerihelionAU); // Ensure non-negative gap
      const nextGapAU = nextPerihelionAU === Infinity ? Infinity : Math.max(0, nextPerihelionAU - current.perihelionAU); // Ensure non-negative gap

      // Determine the limiting gap (minimum of previous and next)
      const limitingGapAU = Math.min(prevGapAU, nextGapAU);

      // Allowed radius is 1/3rd of the limiting gap
      const allowedRadiusAU = limitingGapAU / 3;

      // Calculate the maximum scale factor for this planet
      // Avoid division by zero; if real size is 0, max scale is effectively infinite
      const planetMaxScaleFactor = current.realSizeAU > 1e-10 ? allowedRadiusAU / current.realSizeAU : Infinity;
      return planetMaxScaleFactor;
    });

    // 3. Determine System-Wide Max Scale Factor (Minimum of individuals)
    const systemPlanetMaxScale = Math.min(...individualMaxScaleFactors);

    // Add a reasonable upper cap to prevent extreme scaling if gaps are very large
    const cappedSystemPlanetMaxScale = Math.min(systemPlanetMaxScale, 1_000_000); // Cap at 1 million times real size

    // 4. Calculate Final Planet Sizes using the System-Wide Max Scale Factor
    return system.planets.map(planet => {
      // Recalculate real size in AU for the current planet
      const realSizeAU = planet.pl_rade
        ? planet.pl_rade * earthRadiusInAU
        : planet.pl_masse
          ? Math.pow(planet.pl_masse, 1/3) * earthRadiusInAU
          : defaultSizeAU;
      const realSizeInParsecs = realSizeAU * auToParsecs;

      // Calculate slider influence (t factor: 0 to 1)
      const sliderRange = systemMaxScale > 1 ? systemMaxScale - 1 : 1; // Prevent division by zero/negative range
      const t = systemMaxScale > 1 ? Math.max(0, Math.min(1, (sizeScale - 1) / sliderRange)) : 0;

      // Final size = real size * (1 + slider_influence * system_max_scale_factor)
      const scaledSize = realSizeInParsecs * (1 + t * cappedSystemPlanetMaxScale);

      // Ensure a minimum visible size (optional, but can be helpful)
      const minVisibleSize = 1e-7; // Adjust as needed
      return Math.max(minVisibleSize, scaledSize);
    });
  }, [system.planets, sizeScale, systemMaxScale]); // Dependencies for the memoization

  // Calculate orbit parameters and position for a given planet and angle
  const calculateOrbitPosition = (planet: any, index: number, angle: number) => {
    // Calculate orbit parameters in AU first, then convert to parsecs
    const orbitRadius = (planet.pl_orbsmax || 
      (planet.pl_orbper ? Math.pow(planet.pl_orbper / 365, 2/3) : index + 1)) / 206265;
    
    const eccentricity = planet.pl_orbeccen || 0;
    const semiMajorAxis = orbitRadius;
    const semiMinorAxis = semiMajorAxis * Math.sqrt(1 - eccentricity * eccentricity);
    const focusOffset = semiMajorAxis * eccentricity;
    
    // Calculate position in polar coordinates
    const r = semiMajorAxis * (1 - eccentricity * eccentricity) / (1 + eccentricity * Math.cos(angle));
    
    // Convert to Cartesian coordinates with star at focus (0,0,0)
    const x = r * Math.cos(angle);
    const z = r * Math.sin(angle);
    
    return {
      x,
      z,
      orbitRadius,
      semiMajorAxis,
      semiMinorAxis,
      eccentricity,
      focusOffset
    };
  };

  // Create orbit line points
  const createOrbitPoints = (planet: any, index: number) => {
    const points = [];
    for (let i = 0; i <= orbitSegments; i++) {
      const angle = (i / orbitSegments) * Math.PI * 2;
      const pos = calculateOrbitPosition(planet, index, angle);
      points.push(pos.x, 0, pos.z);
    }
    return new Float32Array(points);
  };

  // Update planet positions and labels
  useFrame((state, delta) => {
    const { camera } = state; // Get camera from state
    const distanceToCamera = camera.position.length(); // Recalculate in case it changed

    // --- Update Text Labels ---
    // This should run even when paused so labels appear on hover
    planetTextRefs.current.forEach((group, index) => {
      if (group && hoveredPlanet === index) { // Only update the hovered label
        const planetGroup = planetRefs.current[index];
        if (planetGroup) {
          // --- Define Min/Max for Offset and Scale ---
          const minLabelOffset = 0.00000001; // Minimum distance above planet (world units)
          const maxLabelOffset = 0.0000001;  // Maximum distance above planet (world units)
          const minLabelScale  = 0.000005; // Minimum visual scale (world units)
          const maxLabelScale  = 0.001;   // Maximum visual scale (world units)
          const baseScaleFactor = 0.05; // Base factor for distance scaling

          // --- Calculate Clamped Offset ---
          const rawOffset = (planetSizes[index] || 0.0000001) * 0.0001; // Original offset calculation
          const clampedOffset = Math.min(maxLabelOffset, Math.max(minLabelOffset, rawOffset));

          // Position the label slightly above the planet using clamped offset
          group.position.copy(planetGroup.position);
          group.position.y += clampedOffset; // Apply clamped offset

          // Make label face the camera
          group.quaternion.copy(camera.quaternion);

          // --- Calculate Clamped Scale ---
          const rawScale = distanceToCamera * baseScaleFactor; // Original scale calculation
          const clampedScale = Math.min(maxLabelScale, Math.max(minLabelScale, rawScale));

          // Scale label based on distance, using clamped scale
          group.scale.setScalar(clampedScale); // Apply clamped scale
        }
      } else if (group && hoveredPlanet !== index) {
         // Ensure non-hovered labels are hidden or reset scale
         group.scale.setScalar(0); // Hide non-hovered labels
      }
    });

    // --- Return if Paused ---
    // Planet motion logic below should not run if paused
    if (isPaused) {
      // Ensure shader light direction is updated even when paused if hovered
      if (hoveredPlanet !== null) {
        const planetGroup = planetRefs.current[hoveredPlanet];
        const planet = system.planets[hoveredPlanet];
         if (planetGroup && planetShaders.current[hoveredPlanet]) {
            const planetPosition = planetGroup.position;
            const starPosition = new THREE.Vector3(0, 0, 0);
            const lightDir = starPosition.clone().sub(planetPosition).normalize();
            planetShaders.current[hoveredPlanet].uniforms.lightDirection.value.copy(lightDir);
         }
      }
      return; // Stop further updates like position changes
    }

    // --- Update Planet Positions & Shaders (Only if not paused) ---
    planetRefs.current.forEach((group, index) => {
      if (!group || index >= currentAnglesRef.current.length) return; // Add bounds check for safety

      const planet = system.planets[index];
      const { orbitRadius } = calculateOrbitPosition(planet, index, 0); // Get orbit parameters needed for period

      // Use orbital period if available (in days), otherwise estimate from semi-major axis
      const orbitRadiusAU = orbitRadius * 206265;
      const orbitalPeriod = planet.pl_orbper ? planet.pl_orbper / 365 : Math.pow(orbitRadiusAU, 1.5); // Period in years

      // Adjust speed based on distance to camera and orbital period
      const speedFactor = orbitalPeriod > 1e-6 ? (1 / orbitalPeriod) : 0;
      const orbitSpeed = speedFactor * Math.pow(Math.max(1e-9, 30000 * distanceToCamera), 1.5);

      // --- Incremental Angle Update ---
      const deltaAngle = orbitSpeed * delta; // Calculate change in angle for this frame
      currentAnglesRef.current[index] += deltaAngle; // Add the change to the stored angle

      // Use the updated stored angle (modulo 2*PI)
      const angle = currentAnglesRef.current[index] % (2 * Math.PI);
      // --- End of Angle Update Change ---

      // Calculate position using shared function with the incrementally updated angle
      const position = calculateOrbitPosition(planet, index, angle);

      // Update planet position
      group.position.x = position.x;
      group.position.z = position.z;
      group.position.y = 0; // Ensure planets stay on the orbital plane

      // Update planet shader lighting
      if (group.children[0] instanceof THREE.Mesh && planetShaders.current[index]) {
        const planetPosition = group.position; // Use the updated group position
        const starPosition = new THREE.Vector3(0, 0, 0);
        const lightDir = starPosition.clone().sub(planetPosition).normalize();
        planetShaders.current[index].uniforms.lightDirection.value.copy(lightDir);
      }
    });
  });

  if (!visible) return null;

  return (
    <group>
      {system.planets.map((planet, index) => {
        const orbitPoints = createOrbitPoints(planet, index);
        
        return (
          <group key={planet.pl_name}>
            {/* Orbit line */}
            <line>
              <bufferGeometry>
                <bufferAttribute
                  attach="attributes-position"
                  args={[orbitPoints, 3]}
                />
              </bufferGeometry>
              <lineBasicMaterial color="#999999" transparent opacity={0.5} />
            </line>
            
            {/* Planet */}
            <group ref={(el) => { if (el) planetRefs.current[index] = el; }}>
              <mesh
                onPointerOver={() => setHoveredPlanet(index)}
                onPointerOut={() => setHoveredPlanet(null)}
              >
                <sphereGeometry args={[planetSizes[index], 32, 32]} />
                <primitive object={planetShaders.current[index]} />
              </mesh>
            </group>
            
            {/* Planet label */}
            {hoveredPlanet === index && (
              <group ref={(el) => { if (el) planetTextRefs.current[index] = el; }}>
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
                  {planet.pl_name}
                </Text>
              </group>
            )}
          </group>
        );
      })}
    </group>
  );
} 