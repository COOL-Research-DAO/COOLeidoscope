import React, { useRef, useState, useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import { ExoplanetSystem } from '../types/Exoplanet';
import { PlanetLabel } from './PlanetLabel';

// Always use GitHub repository for textures
const BASE_PATH = 'https://raw.githubusercontent.com/COOL-Research-DAO/Database/main';

// Texture path mapping
const TEXTURE_PATHS = {
  moon: `${BASE_PATH}/images/2k_moon.jpg`,
  saturnRing: `${BASE_PATH}/images/2k_saturn_ring_alpha.png`,
  terrestrialTextures: {
    'Terrestrial1.png': `${BASE_PATH}/images/TexturesForPlanets-Terrestrial/Terrestrial1.png`,
    'Alpine.png': `${BASE_PATH}/images/TexturesForPlanets-Terrestrial/Alpine.png`,
    'Savannah.png': `${BASE_PATH}/images/TexturesForPlanets-Terrestrial/Savannah.png`,
    'Swamp.png': `${BASE_PATH}/images/TexturesForPlanets-Terrestrial/Swamp.png`,
    'Volcanic.png': `${BASE_PATH}/images/TexturesForPlanets-Terrestrial/Volcanic.png`,
    'Venusian.png': `${BASE_PATH}/images/TexturesForPlanets-Terrestrial/Venusian.png`,
    'Martian.png': `${BASE_PATH}/images/TexturesForPlanets-Terrestrial/Martian.png`,
    'Icy.png': `${BASE_PATH}/images/TexturesForPlanets-Terrestrial/Icy.png`,
    'Tropical.png': `${BASE_PATH}/images/TexturesForPlanets-Terrestrial/Tropical.png`
  } as Record<string, string>,
  gasGiantTextures: {
    'Gaseous1.png': `${BASE_PATH}/images/TexturesForPlanets-GasGiant/Gaseous1.png`,
    'Gaseous2.png': `${BASE_PATH}/images/TexturesForPlanets-GasGiant/Gaseous2.png`,
    'Gaseous3.png': `${BASE_PATH}/images/TexturesForPlanets-GasGiant/Gaseous3.png`,
    'Gaseous4.png': `${BASE_PATH}/images/TexturesForPlanets-GasGiant/Gaseous4.png`
  } as Record<string, string>
};

// Helper to get planet texture URL
const getPlanetTexturePath = (name: string): string[] => {
  return [
    `${BASE_PATH}/images/2k_${name}.jpg`,
    `${BASE_PATH}/images/2k_${name}.png`,
    `${BASE_PATH}/images/${name}.jpg`,
    `${BASE_PATH}/images/${name}.png`
  ];
};

interface PlanetsProps {
  system: ExoplanetSystem;
  visible: boolean;
  isPaused: boolean;
  starRadius: number;
  sizeScale: number;
  systemMaxScale: number;
  planetScaleRatio: number;
  onPlanetClick?: (system: ExoplanetSystem, planetIndex: number) => void;
  onPlanetDoubleClick?: (system: ExoplanetSystem, planetIndex: number) => void;
  registerPlanetAngle?: (systemName: string, planetIndex: number, angle: number, size?: number) => void;
}

// State to track loaded textures
interface TextureCache {
  [key: string]: {
    texture: THREE.Texture;
    lastUsed: number;
  };
}


// List of available random textures
const TERRESTRIAL_TEXTURES = [
  'Terrestrial1.png', 'Alpine.png', 'Savannah.png', 'Swamp.png', 
  'Volcanic.png', 'Venusian.png', 'Martian.png', 'Icy.png', 'Tropical.png'
];

const GAS_GIANT_TEXTURES = [
  'Gaseous1.png', 'Gaseous2.png', 'Gaseous3.png', 'Gaseous4.png'
];

export function Planets({ system, visible, isPaused, starRadius, sizeScale, systemMaxScale, planetScaleRatio, onPlanetDoubleClick, onPlanetClick, registerPlanetAngle }: PlanetsProps) {

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
  const [hoveredMoon, setHoveredMoon] = useState(false);
  
  // Track elapsed time and pause state
  const animationRef = useRef({
    elapsedTime: 0,
    lastFrameTime: 0
  });
  const lastCameraDistanceRef = useRef<number | null>(null);
  const currentAnglesRef = useRef<number[]>([]);
  const rotationAnglesRef = useRef<number[]>([]); // Track rotation angles
  const wasPausedRef = useRef(false);

  // Track which planets are close enough for textures
  const [detailedPlanets, setDetailedPlanets] = useState<boolean[]>([]);
  
  // Reference to loader for textures
  const textureCache = useMemo(() => new Map<string, THREE.Texture>(), []);
  const textureLoader = useMemo(() => new THREE.TextureLoader(), []);
  
  // Used to store random texture assignments
  const [randomTextureAssignments] = useState<Map<number, string>>(new Map());

  // Track planet positions for labels
  const [planetPositions, setPlanetPositions] = useState<THREE.Vector3[]>([]);

  // Track moon position for its label
  const [moonPosition, setMoonPosition] = useState<THREE.Vector3 | null>(null);
  const [showMoonLabel, setShowMoonLabel] = useState(false);

  // Function to determine if a planet is gas giant or terrestrial
  const isPlanetGasGiant = (planet: any): boolean => {
    // Consider planet a gas giant if it's large enough
    if (planet.pl_rade && planet.pl_rade > 3) return true; // More than 3 Earth radii
    if (planet.pl_masse && planet.pl_masse > 10) return true; // More than 10 Earth masses
    
    // Check planet name for keywords
    const name = planet.pl_name.toLowerCase();
    if (name.includes('jupiter') || name.includes('saturn') || 
        name.includes('neptune') || name.includes('uranus')) {
      return true;
    }
    
    return false;
  };

  // Function to get a random texture path for a planet
  const getRandomTexturePath = (planet: any, planetIndex: number): string => {
    // If already assigned, use the same texture
    if (randomTextureAssignments.has(planetIndex)) {
      return randomTextureAssignments.get(planetIndex)!;
    }
    
    // Determine if gas giant or terrestrial
    const isGasGiant = isPlanetGasGiant(planet);
    
    // Select random texture from appropriate array
    const textureArray = isGasGiant ? GAS_GIANT_TEXTURES : TERRESTRIAL_TEXTURES;
    const randomIndex = Math.floor(Math.random() * textureArray.length);
    const randomTexture = textureArray[randomIndex];
    
    // Get the full path from texture mapping
    const textures = isGasGiant ? TEXTURE_PATHS.gasGiantTextures : TEXTURE_PATHS.terrestrialTextures;
    const texturePath = textures[randomTexture];
    
    // Store the assignment for consistency
    randomTextureAssignments.set(planetIndex, texturePath);
    console.log(`Assigned random texture ${randomTexture} (${randomIndex}) to planet ${planet.pl_name}`);
    
    return texturePath;
  };

  // Moon orbit calculation functions
  const getEarthVenusGap = () => {
    const venusPerihelion = (0.723 * (1 - 0.007)) / 206265; // Venus's perihelion in parsecs
    const earthPerihelion = (1.0 * (1 - 0.017)) / 206265; // Earth's perihelion in parsecs
    return (earthPerihelion - venusPerihelion) * (3/5); // 2/3 of the gap
  };

  const getMoonOrbitRadius = () => {
    const baseOrbitRadius = (0.00256 / 206265); // Convert AU to parsecs
    const sliderRange = systemMaxScale > 1 ? systemMaxScale - 1 : 1;
    const t = systemMaxScale > 1 ? Math.max(0, Math.min(1, 1 - (sizeScale - 1) / sliderRange)) : 0;
    // Scale up to Earth-Venus gap
    const maxOrbitRadius = getEarthVenusGap();
    return baseOrbitRadius * (1 + t * (maxOrbitRadius / baseOrbitRadius - 1));
  };

  const createMoonOrbitPoints = (earthSize: number) => {
    const scaledOrbitRadius = getMoonOrbitRadius();
    const points = [];
    for (let i = 0; i <= 64; i++) {
      const angle = (i / 64) * Math.PI * 2;
      points.push(
        scaledOrbitRadius * Math.cos(angle),
        0,
        scaledOrbitRadius * Math.sin(angle)
      );
    }
    return new Float32Array(points);
  };

  const calculateMoonPosition = (planetAngle: number) => {
    const moonOrbitRadius = (0.00256 / 206265); // Convert AU to parsecs
    const moonOrbitalPeriod = 27.32 / 365; // Convert days to years
    
    // Apply the same scaling as planets
    const sliderRange = systemMaxScale > 1 ? systemMaxScale - 1 : 1;
    const t = systemMaxScale > 1 ? Math.max(0, Math.min(1, 1 - (sizeScale - 1) / sliderRange)) : 0;
    const maxScale = 1_000_000; // Same cap as used for planets
    const scaledMoonOrbitRadius = moonOrbitRadius * (1 + t * maxScale);
    
    const moonAngle = (planetAngle / moonOrbitalPeriod) % (2 * Math.PI);
    
    return new THREE.Vector3(
      scaledMoonOrbitRadius * Math.cos(moonAngle),
      0,
      scaledMoonOrbitRadius * Math.sin(moonAngle)
    );
  };

  // Create Saturn ring shader material
  const saturnRingMaterial = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      ringTexture: { value: null }
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D ringTexture;
      varying vec2 vUv;
      void main() {
        float r = length(vUv - vec2(0.5)) * 2.0;
        gl_FragColor = texture2D(ringTexture, vec2(r, 0.5));
      }
    `,
    transparent: true,
    side: THREE.DoubleSide
  }), []);

  // Create moon shader material
  const moonShaderMaterial = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      lightDirection: { value: new THREE.Vector3(0, 0, 0) },
      dayColor: { value: new THREE.Color(0xCCCCCC) },
      nightColor: { value: new THREE.Color(0x666666) },
      ambientLight: { value: 0.15 },
      terminatorSharpness: { value: 0.2 },
      useTexture: { value: 0 },
      moonTexture: { value: null }
    },
    vertexShader: `
      uniform vec3 lightDirection;
      varying vec3 vNormal;
      varying vec3 vWorldPosition;
      varying vec2 vUv;
      
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        
        // Transform normal to world space
        vNormal = normalize(mat3(modelMatrix) * normal);
        
        // Pass through UVs
        vUv = uv;
        
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 lightDirection;
      uniform vec3 dayColor;
      uniform vec3 nightColor;
      uniform float ambientLight;
      uniform float terminatorSharpness;
      uniform float useTexture;
      uniform sampler2D moonTexture;
      varying vec3 vNormal;
      varying vec3 vWorldPosition;
      varying vec2 vUv;
      
      void main() {
        vec3 normal = normalize(vNormal);
        vec3 lightDir = normalize(lightDirection);
        
        // Calculate illumination
        float cosTheta = dot(normal, lightDir);
        
        // Create sharp terminator line
        float t = smoothstep(0.0, terminatorSharpness, cosTheta);
        
        // Determine final color
        vec3 color;
        if (useTexture > 0.5) {
          vec4 texSample = texture2D(moonTexture, vUv);
          vec3 texColor = texSample.rgb;
          
          // Increase contrast to make features more visible
          texColor = pow(texColor * 1.2, vec3(0.8));
          
          // Apply day/night transition to texture
          color = mix(texColor * ambientLight, texColor, t);
        } else {
          // Use simple day/night color transition
          color = mix(nightColor * ambientLight, dayColor, t);
        }
        
        gl_FragColor = vec4(color, 1.0);
      }
    `,
    transparent: false,
    side: THREE.FrontSide
  }), []);

  // Load moon texture when close to Earth
  const [moonTexture, setMoonTexture] = useState<THREE.Texture | null>(null);
  const [saturnRingTexture, setSaturnRingTexture] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    // Load moon texture regardless of distance
    const textureLoader = new THREE.TextureLoader();
    textureLoader.load(
      TEXTURE_PATHS.moon,
      (texture) => {
        texture.flipY = true;
        setMoonTexture(texture);
        moonShaderMaterial.uniforms.moonTexture.value = texture;
        moonShaderMaterial.uniforms.useTexture.value = 1;
      },
      undefined,
      (error) => {
        console.warn("Failed to load moon texture, using basic material instead");
        // Continue without texture
        moonShaderMaterial.uniforms.useTexture.value = 0;
      }
    );
    
    // Load Saturn ring texture
    textureLoader.load(
      TEXTURE_PATHS.saturnRing,
      (texture) => {
        texture.flipY = true;
        saturnRingMaterial.uniforms.ringTexture.value = texture;
        setSaturnRingTexture(texture);
      },
      undefined,
      (error) => {
        console.warn("Failed to load Saturn ring texture, using basic material instead");
        // Continue without texture
      }
    );
  }, [saturnRingMaterial, moonShaderMaterial]);

  // Determine which planets should show detailed textures
  useEffect(() => {
    // Calculate distance to each planet and determine if it should show texture
    const detailedThreshold = 0.00003; // parsecs, smaller value to only load textures for very nearby planets
    
    // Don't recalculate on every tiny camera movement
    if (lastCameraDistanceRef.current !== null && 
        Math.abs(distanceToCamera - lastCameraDistanceRef.current) < 0.001) {
      return; // Skip this update if camera hasn't moved significantly
    }
    
    // Update the last distance
    lastCameraDistanceRef.current = distanceToCamera;
    
    // Create a new array using forEach with index
    const newDetailedState = [...system.planets].map((planet, index) => {
      // Get the planet's position
      const planetGroup = planetRefs.current[index];
      if (!planetGroup) return false;
      
      // Calculate distance from camera to this planet
      const planetPos = new THREE.Vector3().copy(planetGroup.position);
      const distanceToPlanet = camera.position.distanceTo(planetPos);
      
      // Planet is detailed if we're close enough
      const isDetailed = distanceToPlanet < detailedThreshold;
      if (isDetailed) {
        console.log(`Planet ${planet.pl_name} is close enough for detailed texture (${distanceToPlanet} < ${detailedThreshold})`);
      }
      return isDetailed;
    });
    
    // Update state only if it changed
    if (JSON.stringify(newDetailedState) !== JSON.stringify(detailedPlanets)) {
      setDetailedPlanets(newDetailedState);
    }
  }, [distanceToCamera, system.planets, camera.position]);

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
    if (rotationAnglesRef.current.length !== system.planets.length) {
      rotationAnglesRef.current = new Array(system.planets.length).fill(0);
    }
  }, [system.planets.length]);

  // Create separate shader instances for each planet
  const planetShaders = useRef<THREE.ShaderMaterial[]>([]);
  
  // Initialize shaders if needed
  useEffect(() => {
    if (planetShaders.current.length !== system.planets.length) {
      console.log(`Initializing shaders for ${system.planets.length} planets`);
      planetShaders.current = system.planets.map((planet) => {
        // Create new shader material
        return new THREE.ShaderMaterial({
          uniforms: {
            lightDirection: { value: new THREE.Vector3(0, 0, 0) },
            dayColor: { value: new THREE.Color(0xffffff) },
            nightColor: { value: new THREE.Color(0xffffff) },
            ambientLight: { value: 0.15 },
            terminatorSharpness: { value: 0.2 },
            useTexture: { value: 0 },
            planetTexture: { value: null }
          },
          vertexShader: `
            uniform vec3 lightDirection;
            varying vec3 vNormal;
            varying vec3 vWorldPosition;
            varying vec2 vUv;
            
            void main() {
              vec4 worldPosition = modelMatrix * vec4(position, 1.0);
              vWorldPosition = worldPosition.xyz;
              
              // Transform normal to world space
              vNormal = normalize(mat3(modelMatrix) * normal);
              
              // Pass through original UVs which are correctly set up for spherical mapping
              // Standard sphere mapping works well with equirectangular textures
              vUv = uv;
              
              gl_Position = projectionMatrix * viewMatrix * worldPosition;
            }
          `,
          fragmentShader: `
            uniform vec3 lightDirection;
            uniform vec3 dayColor;
            uniform vec3 nightColor;
            uniform float ambientLight;
            uniform float terminatorSharpness;
            uniform float useTexture;
            uniform sampler2D planetTexture;
            varying vec3 vNormal;
            varying vec3 vWorldPosition;
            varying vec2 vUv;
            
            void main() {
              vec3 normal = normalize(vNormal);
              vec3 lightDir = normalize(lightDirection);
              
              // Calculate illumination (dot product)
              float cosTheta = dot(normal, lightDir);
              
              // Create sharp terminator line perpendicular to light direction
              float t = smoothstep(0.0, terminatorSharpness, cosTheta);
              
              // Determine final color based on whether we're using texture
              vec3 color;
              if (useTexture > 0.5) {
                // Sample texture based on UV coordinates with proper filtering
                vec4 texSample = texture2D(planetTexture, vUv);
                vec3 texColor = texSample.rgb;
                
                // Increase brightness and contrast to make features more visible
                texColor = pow(texColor * 1.2, vec3(0.8));
                
                // If texture sample is too dark (black areas), use the base color instead
                float brightness = texColor.r + texColor.g + texColor.b;
                if (brightness < 0.1) {
                  texColor = dayColor;
                }
                
                // Apply day/night transition to texture
                color = mix(texColor * ambientLight, texColor, t);
              } else {
                // Use simple day/night color transition
                color = mix(nightColor * ambientLight, dayColor, t);
              }
              
              gl_FragColor = vec4(color, 1.0);
            }
          `
        });
      });
    }
  }, [system.planets.length]);
  
  // Load and apply planet textures
  useEffect(() => {
    // Skip all texture loading if no planets are detailed
    if (!detailedPlanets.some(isDetailed => isDetailed)) {
      // Only log once when transitioning from having detailed planets to having none
      if (textureCache.size > 0) {
        console.log("No planets are close enough for detailed textures");
      }
      
      // Reset all textures
      system.planets.forEach((_, index) => {
        if (planetShaders.current[index]) {
          planetShaders.current[index].uniforms.useTexture.value = 0;
          planetShaders.current[index].uniforms.planetTexture.value = null;
        }
      });
      return;
    }

    // Get the visible detailed planets
    const detailedPlanetIndices = detailedPlanets
      .map((isDetailed, index) => isDetailed ? index : -1)
      .filter(index => index !== -1);

    console.log("Detailed planets indices:", detailedPlanetIndices);

    // Only load textures for currently visible planets (in viewport)
    // Check if planet is within camera's view frustum
    const frustum = new THREE.Frustum();
    const matrix = new THREE.Matrix4().multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse
    );
    frustum.setFromProjectionMatrix(matrix);

    // Filter to only include planets that are both detailed AND visible in the frustum
    const visibleDetailedPlanetIndices = detailedPlanetIndices.filter(index => {
      const planetGroup = planetRefs.current[index];
      if (!planetGroup) return false;
      
      // Create bounding sphere for frustum check
      const planetPos = new THREE.Vector3().copy(planetGroup.position);
      const boundingSphere = new THREE.Sphere(planetPos, 0.005); // Small sphere for the planet
      
      // Check if planet is visible in the frustum
      const isVisible = frustum.intersectsSphere(boundingSphere);
      
      const planet = system.planets[index];
      if (isVisible) {
        console.log(`Planet ${planet.pl_name} is visible in the viewport`);
      } else {
        console.log(`Planet ${planet.pl_name} is detailed but not visible in the viewport - skipping texture loading`);
      }
      
      return isVisible;
    });

    console.log("Visible detailed planets indices:", visibleDetailedPlanetIndices);

    // Cleanup function to track which textures are still needed
    const neededTextures = new Set<string>();
    
    // Load textures only for visible detailed planets
    visibleDetailedPlanetIndices.forEach(index => {
      const planet = system.planets[index];
      const planetName = planet.pl_name.toLowerCase().replace(/[^a-z0-9-]/g, '');
      if (!planetName) {
        console.warn(`Planet at index ${index} has no valid name`);
        return;
      }

      // Ensure shader exists for this planet
      if (!planetShaders.current[index]) {
        console.error(`No shader material exists for planet at index ${index}`);
        return;
      }

      // Add to needed textures set
      neededTextures.add(planetName);
      
      // If texture is already cached, use it
      if (textureCache.has(planetName)) {
        const texture = textureCache.get(planetName)!;
        if (planetShaders.current[index]) {
          planetShaders.current[index].uniforms.planetTexture.value = texture;
          planetShaders.current[index].uniforms.useTexture.value = 1;
          console.log(`Using cached texture for ${planetName}`);
        }
        return;
      }
      
      // Try named planet textures first
      const namedTexturePaths = getPlanetTexturePath(planetName);
      
      console.log(`Attempting to load texture for ${planetName} - planet is within detailed threshold`);
      
      // Try loading each texture path in sequence until one succeeds
      const tryLoadTexture = (pathIndex: number) => {
        if (pathIndex >= namedTexturePaths.length) {
          console.log(`No named texture found for ${planetName}, using random texture`);
          // Get random texture path based on planet type
          const randomTexturePath = getRandomTexturePath(planet, index);
          console.log(`Selected random texture: ${randomTexturePath} for planet ${planetName}`);
          
          // Add random texture to needed textures
          neededTextures.add(randomTexturePath);
          
          // If already cached, use it
          if (textureCache.has(randomTexturePath)) {
            const texture = textureCache.get(randomTexturePath)!;
            if (planetShaders.current[index]) {
              planetShaders.current[index].uniforms.planetTexture.value = texture;
              planetShaders.current[index].uniforms.useTexture.value = 1;
              console.log(`Using cached random texture for ${planetName}`);
            }
            return;
          }
          
          // Load the random texture
          console.log(`Loading random texture from: ${randomTexturePath}`);
          textureLoader.load(
            randomTexturePath,
            (texture) => {
              console.log(`Successfully loaded texture from ${randomTexturePath}`);
              if (detailedPlanets[index]) {
                console.log(`Applying random texture for ${planetName} from ${randomTexturePath}`);
                texture.flipY = true;
                texture.needsUpdate = true;
                textureCache.set(randomTexturePath, texture);
                
                if (planetShaders.current[index]) {
                  planetShaders.current[index].uniforms.planetTexture.value = texture;
                  planetShaders.current[index].uniforms.useTexture.value = 1;
                  console.log(`Set useTexture to 1 for ${planetName}`);
                } else {
                  console.error(`No shader available for planet index ${index}`);
                }
              } else {
                texture.dispose();
                console.log(`Skipped applying random texture for ${planetName} - no longer detailed`);
              }
            },
            (progressEvent) => {
              if (progressEvent.lengthComputable) {
                console.log(`Loading progress for ${randomTexturePath}: ${progressEvent.loaded} / ${progressEvent.total}`);
              }
            },
            (error) => {
              console.warn(`Error loading random texture for ${planetName} from ${randomTexturePath}, using basic material`);
              // Continue without texture - ensure the planet is still visible
              if (planetShaders.current[index]) {
                planetShaders.current[index].uniforms.useTexture.value = 0;
              }
            }
          );
          return;
        }
        
        console.log(`Trying named texture path: ${namedTexturePaths[pathIndex]}`);
        textureLoader.load(
          namedTexturePaths[pathIndex],
          (texture) => {
            console.log(`Successfully loaded texture from ${namedTexturePaths[pathIndex]}`);
            // Only apply if planet is still detailed
            if (detailedPlanets[index]) {
              console.log(`Loaded and applied texture for ${planetName} from ${namedTexturePaths[pathIndex]}`);
              texture.flipY = true;
              texture.needsUpdate = true;
              textureCache.set(planetName, texture);
              
              if (planetShaders.current[index]) {
                planetShaders.current[index].uniforms.planetTexture.value = texture;
                planetShaders.current[index].uniforms.useTexture.value = 1;
                console.log(`Set useTexture to 1 for ${planetName}`);
              } else {
                console.error(`No shader available for planet index ${index}`);
              }
            } else {
              texture.dispose();
              console.log(`Skipped applying texture for ${planetName} - no longer detailed`);
            }
          },
          (progressEvent) => {
            if (progressEvent.lengthComputable) {
              console.log(`Loading progress for ${namedTexturePaths[pathIndex]}: ${progressEvent.loaded} / ${progressEvent.total}`);
            }
          },
          (error) => {
            console.log(`Failed to load texture from ${namedTexturePaths[pathIndex]}, trying next path...`);
            tryLoadTexture(pathIndex + 1);
          }
        );
      };
      
      tryLoadTexture(0);
    });

    // Reset textures for non-detailed planets
    system.planets.forEach((_, index) => {
      if (!detailedPlanets[index] && planetShaders.current[index]) {
        planetShaders.current[index].uniforms.useTexture.value = 0;
        planetShaders.current[index].uniforms.planetTexture.value = null;
      }
    });
    
    // Cleanup unused textures
    return () => {
      for (const [textureName, texture] of textureCache.entries()) {
        if (!neededTextures.has(textureName)) {
          texture.dispose();
          textureCache.delete(textureName);
          console.log(`Disposed texture for ${textureName} - no longer needed`);
        }
      }
    };
  }, [system.planets, detailedPlanets, camera.position]);

  // Add this new useEffect to force texture reinitialization when detailed planets change
  useEffect(() => {
    // Only log when detailed planets actually change in a meaningful way
    const detailedCount = detailedPlanets.filter(isDetailed => isDetailed).length;
    
    if (detailedCount > 0) {
      console.log(`Detailed planets changed: ${detailedCount} planets now showing detailed textures`);
    }
    
    // We don't need to do anything here since the main texture loading mechanism
    // in the previous useEffect already handles texture loading when detailedPlanets changes.
  }, [detailedPlanets]); // Only run when detailedPlanets changes

  // Calculate relative sizes based on radius or mass
  const { planetSizes, cappedSystemPlanetMaxScale } = useMemo(() => {
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
      const sizes = system.planets.map(planet => {
        const realSizeAU = planet.pl_rade
          ? planet.pl_rade * earthRadiusInAU
          : planet.pl_masse
            ? Math.pow(planet.pl_masse, 1/3) * earthRadiusInAU
            : defaultSizeAU;
        const realSizeInParsecs = realSizeAU / 206265;

        // Calculate maximum scale based on orbit size
        const orbitRadiusAU = planet.pl_orbsmax ||
          (planet.pl_orbper ? Math.pow(planet.pl_orbper / 365, 2/3) : 1);
        const eccentricity = planet.pl_orbeccen || 0;
        const perihelionAU = orbitRadiusAU * (1 - eccentricity);
        
        // Allow planet to grow up to 1/3 of its orbit radius (same as multi-planet logic)
        const maxPlanetSizeAU = perihelionAU / 3;
        const planetMaxScaleFactor = realSizeAU > 1e-10 ? maxPlanetSizeAU / realSizeAU : 1_000_000;
        
        // Cap the maximum scale factor
        const cappedMaxScale = Math.min(planetMaxScaleFactor, 1_000_000);

        // Calculate slider influence (t factor: 0 to 1)
        const sliderRange = systemMaxScale > 1 ? systemMaxScale - 1 : 1;
        const t = systemMaxScale > 1 ? Math.max(0, Math.min(1, 1 - (sizeScale - 1) / sliderRange)) : 0;
        
        // Invert the t factor so 0 = maximum size, 1 = real size
        const invertedT = 1 - t;

        // Final size = real size when invertedT=0 (slider right), scaled up to max allowed size when invertedT=1 (slider left)
        return realSizeInParsecs * (1 + invertedT * (cappedMaxScale - 1));
      });
      return { planetSizes: sizes, cappedSystemPlanetMaxScale: 1_000_000 };
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
    const sizes = system.planets.map(planet => {
      // Recalculate real size in AU for the current planet
      const realSizeAU = planet.pl_rade
        ? planet.pl_rade * earthRadiusInAU
        : planet.pl_masse
          ? Math.pow(planet.pl_masse, 1/3) * earthRadiusInAU
          : defaultSizeAU;
      const realSizeInParsecs = realSizeAU / 206265; // Real physical size in parsecs

      // Calculate slider influence (t factor: 0 to 1)
      const sliderRange = systemMaxScale > 1 ? systemMaxScale - 1 : 1;
      const t = systemMaxScale > 1 ? Math.max(0, Math.min(1, 1 - (sizeScale - 1) / sliderRange)) : 0;
      
      // Invert the t factor so 0 = maximum size, 1 = real size
      const invertedT = 1 - t;

      // Final size = real size when invertedT=0 (slider right), scaled up to max allowed size when invertedT=1 (slider left)
      return realSizeInParsecs * (1 + invertedT * (cappedSystemPlanetMaxScale - 1));
    });

    return { planetSizes: sizes, cappedSystemPlanetMaxScale };
  }, [system.planets, sizeScale, systemMaxScale]);

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

  // Moon state and refs
  const moonAngleRef = useRef(0);
  const moonRef = useRef<THREE.Group>(null);

  // Helper function to get planet rotation period in Earth days
  const getPlanetRotationPeriod = (planet: any): number => {
    // Known rotation periods for some planets (in Earth days)
    const knownPeriods: { [key: string]: number } = {
      'mercury': 58.646,
      'venus': -243.018, // Negative indicates retrograde rotation
      'earth': 1.0,
      'mars': 1.026,
      'jupiter': 0.414,
      'saturn': 0.445,
      'uranus': -0.718,
      'neptune': 0.671
    };

    const planetName = planet.pl_name?.toLowerCase() || '';
    for (const [name, period] of Object.entries(knownPeriods)) {
      if (planetName.includes(name)) {
        return period;
      }
    }

    // For unknown planets, estimate based on size and orbital period
    // Larger planets tend to rotate faster, and planets closer to their star tend to be tidally locked
    const orbitalPeriod = planet.pl_orbper || 365; // Default to 1 year if unknown
    const planetRadius = planet.pl_rade || 1; // Earth radii

    if (orbitalPeriod < 10) {
      // Very close planets are likely tidally locked
      return orbitalPeriod;
    } else {
      // Rough estimate: faster rotation for larger planets
      return Math.max(0.1, Math.min(100, 10 / Math.sqrt(planetRadius)));
    }
  };

  // Update planet positions and labels
  useFrame((state, delta) => {
    const { camera } = state;
    const distanceToCamera = camera.position.length();

    // Always calculate and update positions for planets even when paused
    // This ensures planets are visible when system changes during pause
    const newPositions: THREE.Vector3[] = [];
    let newMoonPosition: THREE.Vector3 | null = null;
    
    planetRefs.current.forEach((group, index) => {
      if (!group || index >= currentAnglesRef.current.length) return;

      const planet = system.planets[index];
      const { orbitRadius } = calculateOrbitPosition(planet, index, 0);

      // Use stored angle (don't update it if paused)
      const angle = currentAnglesRef.current[index] % (2 * Math.PI);
      
      // Calculate position using the current angle
      const position = calculateOrbitPosition(planet, index, angle);

      // Always update planet position, even when paused
      group.position.x = position.x;
      group.position.z = position.z;
      group.position.y = 0; // Ensure planets stay on the orbital plane
      
      // Store the current position for labels
      newPositions[index] = new THREE.Vector3(
        position.x,
        0, // Planets are on the orbital plane (y=0)
        position.z
      );

      // Update planet rotation (even when paused, update one time)
      const rotationPeriod = getPlanetRotationPeriod(planet);
      const rotationDirection = rotationPeriod >= 0 ? 1 : -1;
      group.rotation.set(0, rotationAnglesRef.current[index] * rotationDirection, 0);

      // Update planet shader lighting (even when paused)
      if (group.children[0] instanceof THREE.Mesh && planetShaders.current[index]) {
        const planetPosition = group.position;
        const starPosition = new THREE.Vector3(0, 0, 0);
        const lightDir = starPosition.clone().sub(planetPosition).normalize();
        planetShaders.current[index].uniforms.lightDirection.value.copy(lightDir);
      }

      // Update moon if this is Earth (even when paused)
      const isEarth = planet.pl_name?.toLowerCase().includes('earth');
      if (isEarth && moonRef.current) {
        const scaledOrbitRadius = getMoonOrbitRadius();
        const moonAngle = moonAngleRef.current % (2 * Math.PI);
        
        const moonLocalPosition = new THREE.Vector3(
          scaledOrbitRadius * Math.cos(moonAngle),
          0,
          scaledOrbitRadius * Math.sin(moonAngle)
        );
        
        // Set moon's position
        moonRef.current.position.copy(moonLocalPosition);
        
        // Calculate moon's absolute position
        const earthPosition = new THREE.Vector3(
          group.position.x,
          group.position.y,
          group.position.z
        );
        
        newMoonPosition = new THREE.Vector3(
          earthPosition.x + moonLocalPosition.x,
          earthPosition.y + moonLocalPosition.y,
          earthPosition.z + moonLocalPosition.z
        );
        
        // Update moon shader lighting
        const moonAbsolutePosition = moonLocalPosition.clone().add(earthPosition);
        const starPosition = new THREE.Vector3(0, 0, 0);
        const lightDir = starPosition.clone().sub(moonAbsolutePosition).normalize();
        moonShaderMaterial.uniforms.lightDirection.value.copy(lightDir);
      }
    });
    
    // Update positions for labels
    setPlanetPositions(newPositions);
    setMoonPosition(newMoonPosition);
    
    // If paused, don't update orbital or rotation angles
    if (isPaused) {
      return;
    }
    
    // Only update animation angles if not paused
    planetRefs.current.forEach((group, index) => {
      if (!group || index >= currentAnglesRef.current.length) return;

      const planet = system.planets[index];
      const { orbitRadius } = calculateOrbitPosition(planet, index, 0);

      // Use orbital period if available (in days), otherwise estimate from semi-major axis
      const orbitRadiusAU = orbitRadius * 206265;
      const orbitalPeriod = planet.pl_orbper ? planet.pl_orbper / 365 : Math.pow(orbitRadiusAU, 1.5); // Period in years

      // Adjust speed based on distance to camera and orbital period
      const speedFactor = orbitalPeriod > 1e-6 ? (1 / orbitalPeriod) : 0;
      const orbitSpeed = speedFactor * Math.pow(Math.max(1e-9, 30000 * distanceToCamera), 1.5);

      // --- Incremental Angle Update ---
      const deltaAngle = -orbitSpeed * delta; // Inversion du sens de révolution (horaire)
      currentAnglesRef.current[index] += deltaAngle; // Add the change to the stored angle
      
      // Register the angle and size with the parent component if the function exists
      if (registerPlanetAngle) {
        registerPlanetAngle(system.hostname, index, currentAnglesRef.current[index], planetSizes[index]);
      }
      
      // Update planet rotation
      const rotationPeriod = getPlanetRotationPeriod(planet);
      const rotationSpeed = (2 * Math.PI) / (Math.abs(rotationPeriod) * 24 * 60 * 60); 
      rotationAnglesRef.current[index] += rotationSpeed * delta * 100000; // Scale up for visibility
      
      // Update moon angle if this is Earth
      const isEarth = planet.pl_name?.toLowerCase().includes('earth');
      if (isEarth && moonRef.current) {
        const moonOrbitalPeriod = 27.32 / 365; // Moon period in years
        const moonSpeedFactor = 1 / moonOrbitalPeriod;
        const moonOrbitSpeed = moonSpeedFactor * Math.pow(Math.max(1e-9, 30000 * distanceToCamera), 1.5);
        moonAngleRef.current -= moonOrbitSpeed * delta; // Inversion du sens de révolution de la Lune
        
        // Register the moon angle
        if (registerPlanetAngle) {
          const moonSize = planetSizes[index] * 0.273;
          registerPlanetAngle(system.hostname, -1, moonAngleRef.current, moonSize);
        }
      }
    });
  });

  // Add a planet click handler
  const handlePlanetClick = (index: number) => {
    if (onPlanetClick) {
      onPlanetClick(system, index);
    }
  };

  // Add a planet double click handler
  const handlePlanetDoubleClick = (index: number) => {
    if (onPlanetDoubleClick) {
      onPlanetDoubleClick(system, index);
    }
  };
      
  if (!visible) return null;

  return (
    <group>
      {system.planets.map((planet, index) => {
        const orbitPoints = createOrbitPoints(planet, index);
        const isEarth = planet.pl_name?.toLowerCase().includes('earth');
        
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
              <lineBasicMaterial color="#999999" transparent opacity={1.0} />
            </line>
            
            {/* Planet */}
            <group ref={(el) => { if (el) planetRefs.current[index] = el; }}>
              <mesh
                onPointerOver={() => setHoveredPlanet(index)}
                onPointerOut={() => setHoveredPlanet(null)}
                onClick={(e) => { 
                  e.stopPropagation(); 
                  handlePlanetClick(index); 
                }}
                onDoubleClick={(e) => { 
                  e.stopPropagation(); 
                  handlePlanetDoubleClick(index); 
                }}
                userData={{ type: 'planet', hostname: system.hostname, index }}
              >
                <sphereGeometry args={[planetSizes[index], 32, 32]} />
                <primitive object={planetShaders.current[index]} />
              </mesh>

              {/* Saturn's rings */}
              {planet.pl_name?.toLowerCase().includes('saturn') && (
                <group rotation={[Math.PI * 92.485 / 180, 0, 0]}>
                  <mesh>
                    <ringGeometry args={[planetSizes[index] * 1.2, planetSizes[index] * 2.3, 64]} />
                    <primitive object={saturnRingMaterial} />
                  </mesh>
                </group>
              )}

              {/* Moon (only for Earth) */}
              {isEarth && (
                <group>
                  {/* Moon orbit line */}
                  <line>
                    <bufferGeometry>
                      <bufferAttribute
                        attach="attributes-position"
                        args={[createMoonOrbitPoints(planetSizes[index]), 3]}
                      />
                    </bufferGeometry>
                    <lineBasicMaterial color="#999999" transparent opacity={0.8} />
                  </line>
                  
                  {/* Moon */}
                  <group ref={moonRef}>
                    <mesh
                      scale={[planetSizes[index] * 0.273, planetSizes[index] * 0.273, planetSizes[index] * 0.273]}
                      onPointerOver={() => setHoveredMoon(true)}
                      onPointerOut={() => setHoveredMoon(false)}
                      onDoubleClick={(e) => { 
                        e.stopPropagation(); 
                        // Special case for the moon
                        if (isEarth && onPlanetClick) {
                          onPlanetClick(system, -1); // Use -1 to indicate the moon
                        }
                      }}
                    >
                      <sphereGeometry args={[1, 32, 32]} />
                      <primitive object={moonShaderMaterial} />
                    </mesh>
                  </group>
                </group>
              )}
            </group>
          </group>
        );
      })}
      
      {/* Planet labels - outside the map to avoid recreation on position changes */}
      {system.planets.map((planet, index) => (
        <PlanetLabel
          key={`label-${planet.pl_name}`}
          name={planet.pl_name}
          position={planetPositions[index] || new THREE.Vector3()}
          planetRadius={planetSizes[index]}
          visible={hoveredPlanet === index}
        />
      ))}
      
      {/* Moon label */}
      {moonPosition && (
        <PlanetLabel
          key="moon-label"
          name="Moon"
          position={moonPosition}
          planetRadius={0.0001} // Simple fixed size for moon
          visible={hoveredMoon}
        />
      )}
    </group>
  );
} 