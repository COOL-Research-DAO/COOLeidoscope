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
  const pausedAnglesRef = useRef<number[]>([]);
  const wasPausedRef = useRef(false);

  // Initialize refs if needed
  useEffect(() => {
    if (planetRefs.current.length !== system.planets.length) {
      planetRefs.current = system.planets.map(() => new THREE.Group());
    }
    if (planetTextRefs.current.length !== system.planets.length) {
      planetTextRefs.current = system.planets.map(() => new THREE.Group());
    }
    if (pausedAnglesRef.current.length !== system.planets.length) {
      pausedAnglesRef.current = new Array(system.planets.length).fill(0);
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
  const planetSizes = useMemo(() => system.planets.map(planet => {
    // Calculate real planet radius in Earth radii
    const planetRadii = planet.pl_rade || 
      (planet.pl_masse ? Math.pow(planet.pl_masse, 1/3) : 1); // Use mass to estimate radius if no radius data
    
    // Convert to real size in parsecs
    const earthRadiusInAU = 0.0000046491; // Earth radius in AU
    const realSizeInParsecs = (planetRadii * earthRadiusInAU) / 206265;
    
    // Get orbit radius in parsecs
    const orbitRadius = (planet.pl_orbsmax || 
      (planet.pl_orbper ? Math.pow(planet.pl_orbper / 365, 2/3) : 1)) / 206265;
    
    // Calculate maximum scale based on orbit spacing
    // We want planets to be at most 1/10th of their orbit spacing
    const orbitSpacing = orbitRadius * 0.1;
    const maxScale = orbitSpacing / realSizeInParsecs;
    
    // Calculate slider scale factor (0 to 1)
    const sliderRange = systemMaxScale - 1;
    const t = Math.max(0, Math.min(1, (sizeScale - 1) / sliderRange));
    
    // Scale from real size up to maximum allowed size based on orbit
    const scaledSize = realSizeInParsecs * (1 + t * maxScale);

    return scaledSize;
  }), [system.planets, sizeScale, systemMaxScale]);

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

  // Update planet positions
  useFrame((state, delta) => {
    if (isPaused) return;
    
    animationRef.current.elapsedTime += delta;
    
    planetRefs.current.forEach((group, index) => {
      if (!group) return;

      const planet = system.planets[index];
      const { orbitRadius } = calculateOrbitPosition(planet, index, 0); // Get orbit parameters
      
      // Use orbital period if available (in days), otherwise calculate from semi-major axis
      const orbitalPeriod = planet.pl_orbper ? planet.pl_orbper / 365 : Math.pow(orbitRadius, 1.5);
      const orbitSpeed = (1 / orbitalPeriod) * Math.pow(30000 * distanceToCamera, 1.5);
      
      // Calculate the current angle only when not paused
      let angle;
      if (isPaused) {
        angle = pausedAnglesRef.current[index];
      } else {
        const currentAngle = animationRef.current.elapsedTime * orbitSpeed;
        angle = currentAngle % (2 * Math.PI); // Keep angle between 0 and 2π
        pausedAnglesRef.current[index] = angle;
      }
      
      // Calculate position using shared function
      const position = calculateOrbitPosition(planet, index, angle);
      
      // Update planet position
      group.position.x = position.x;
      group.position.z = position.z;
      
      // Update planet shader lighting
      if (group.children[0] instanceof THREE.Mesh) {
        const planetPosition = new THREE.Vector3(position.x, 0, position.z);
        const starPosition = new THREE.Vector3(0, 0, 0);
        const lightDir = starPosition.clone().sub(planetPosition).normalize();
        planetShaders.current[index].uniforms.lightDirection.value.copy(lightDir);
      }
    });

    // Update text labels
    planetTextRefs.current.forEach((group, index) => {
      if (group) {
        group.quaternion.copy(camera.quaternion);
        const baseScale = 0.04;
        const scaleFactor = distanceToCamera * baseScale;
        group.scale.setScalar(scaleFactor);
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
              <lineBasicMaterial color="#666666" transparent opacity={0.3} />
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