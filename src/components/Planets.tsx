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

// State to track loaded textures
interface TextureCache {
  [key: string]: {
    texture: THREE.Texture;
    lastUsed: number;
  };
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

  // Track which planets are close enough for textures
  const [detailedPlanets, setDetailedPlanets] = useState<boolean[]>([]);
  
  // Reference to loader for textures
  const textureLoader = useMemo(() => new THREE.TextureLoader(), []);
  
  // Moon orbit calculation functions
  const getMoonOrbitRadius = () => {
    const baseOrbitRadius = (0.00256 / 206265); // Convert AU to parsecs
    const sliderRange = systemMaxScale > 1 ? systemMaxScale - 1 : 1;
    const t = systemMaxScale > 1 ? Math.max(0, Math.min(1, (sizeScale - 1) / sliderRange)) : 0;
    // Apply square root scaling for smoother growth
    return baseOrbitRadius * (1 + Math.sqrt(t * (cappedSystemPlanetMaxScale - 1)));
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
    const t = systemMaxScale > 1 ? Math.max(0, Math.min(1, (sizeScale - 1) / sliderRange)) : 0;
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
      '/images/2k_moon.jpg',
      (texture) => {
        texture.flipY = false;
        setMoonTexture(texture);
        moonShaderMaterial.uniforms.moonTexture.value = texture;
        moonShaderMaterial.uniforms.useTexture.value = 1;
      }
    );
    
    // Load Saturn ring texture
    textureLoader.load(
      '/images/2k_saturn_ring_alpha.png',
      (texture) => {
        texture.flipY = false;
        saturnRingMaterial.uniforms.ringTexture.value = texture;
        setSaturnRingTexture(texture);
      }
    );
  }, [saturnRingMaterial, moonShaderMaterial]);

  // Determine which planets should show detailed textures
  useEffect(() => {
    // Calculate distance to each planet and determine if it should show texture
    const detailedThreshold = 0.003; // parsecs, adjust as needed
    
    // Create a new array using forEach with index
    const newDetailedState = [...system.planets].map((_, index) => {
      // Get the planet's position
      const planetGroup = planetRefs.current[index];
      if (!planetGroup) return false;
      
      // Calculate distance from camera to this planet
      const planetPos = new THREE.Vector3().copy(planetGroup.position);
      const distanceToPlanet = camera.position.distanceTo(planetPos);
      
      // Planet is detailed if we're close enough
      return distanceToPlanet < detailedThreshold;
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
        };
        return new THREE.ShaderMaterial(shader);
      });
    }
  }, [system.planets.length]);
  
  // Load and apply planet textures
  useEffect(() => {
    system.planets.forEach((planet, index) => {
      // Skip if this planet doesn't need a detailed texture
      if (!detailedPlanets[index]) {
        // Reset texture if we previously had one
        if (planetShaders.current[index] && planetShaders.current[index].uniforms.useTexture.value > 0.5) {
          planetShaders.current[index].uniforms.useTexture.value = 0;
        }
        return;
      }
      
      // Extract planet name without system prefix if present
      let planetName = planet.pl_name.toLowerCase().replace(/[^a-z0-9]/g, '');
      // If name has system prefix, extract just the planet part
      if (planet.pl_name.includes(' ')) {
        const nameParts = planet.pl_name.split(' ');
        planetName = nameParts[nameParts.length - 1].toLowerCase().replace(/[^a-z0-9]/g, '');
      }
      
      if (!planetName) return; // Skip if no valid name
      
      // Try to load 2k texture first
      const texture2kPath = `/images/2k_${planetName}.jpg`;
      
      // Load texture directly with THREE.TextureLoader
      textureLoader.load(
        texture2kPath,
        (texture) => {
          // Successfully loaded 2k texture
          console.log(`Loaded 2k texture for ${planetName}`);
          if (planetShaders.current[index]) {
            planetShaders.current[index].uniforms.planetTexture.value = texture;
            planetShaders.current[index].uniforms.useTexture.value = 1;
          }
        },
        undefined, // Progress callback not needed
        () => {
          console.warn(`No 2k texture found for ${planetName}`);
          // Reset texture flag if loading failed
          if (planetShaders.current[index]) {
            planetShaders.current[index].uniforms.useTexture.value = 0;
          }
        }
      );
    });
  }, [system.planets, detailedPlanets]);

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

        // Calculate slider influence
        const sliderRange = systemMaxScale > 1 ? systemMaxScale - 1 : 1;
        const t = systemMaxScale > 1 ? Math.max(0, Math.min(1, (sizeScale - 1) / sliderRange)) : 0;
        
        // Scale up from real size to maximum allowed size
        return realSizeInParsecs * (1 + t * (cappedMaxScale - 1));
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
      const sliderRange = systemMaxScale > 1 ? systemMaxScale - 1 : 1; // Prevent division by zero/negative range
      const t = systemMaxScale > 1 ? Math.max(0, Math.min(1, (sizeScale - 1) / sliderRange)) : 0;

      // Final size = real size when t=0, scaled up to max allowed size when t=1
      return realSizeInParsecs * (1 + t * (cappedSystemPlanetMaxScale - 1));
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

  // Update planet positions and labels
  useFrame((state, delta) => {
    const { camera } = state;
    const distanceToCamera = camera.position.length();

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

      // Add rotation to ensure poles are perpendicular to the ecliptic
      // This aligns the planet's axis of rotation perpendicular to the orbital plane
      group.rotation.set(0, 0, 0); // Reset any previous rotation
      group.rotation.x = 0; // No tilt relative to ecliptic plane for simple visualization

      // Update planet shader lighting
      if (group.children[0] instanceof THREE.Mesh && planetShaders.current[index]) {
        const planetPosition = group.position; // Use the updated group position
        const starPosition = new THREE.Vector3(0, 0, 0);
        const lightDir = starPosition.clone().sub(planetPosition).normalize();
        planetShaders.current[index].uniforms.lightDirection.value.copy(lightDir);
      }

      // Update moon if this is Earth
      const isEarth = planet.pl_name?.toLowerCase().includes('earth');
      if (isEarth && moonRef.current) {
        const scaledOrbitRadius = getMoonOrbitRadius();
        const moonOrbitalPeriod = 27.32 / 365; // Moon period in years
        const moonSpeedFactor = 1 / moonOrbitalPeriod;
        const moonOrbitSpeed = moonSpeedFactor * Math.pow(Math.max(1e-9, 30000 * distanceToCamera), 1.5);
        
        moonAngleRef.current += moonOrbitSpeed * delta;
        const moonAngle = moonAngleRef.current % (2 * Math.PI);
        
        // Calculate moon's absolute position by adding Earth's position
        const earthPosition = new THREE.Vector3(
          planetRefs.current[index].position.x,
          planetRefs.current[index].position.y,
          planetRefs.current[index].position.z
        );
        
        const moonLocalPosition = new THREE.Vector3(
          scaledOrbitRadius * Math.cos(moonAngle),
          0,
          scaledOrbitRadius * Math.sin(moonAngle)
        );
        
        // Set moon's position relative to Earth
        moonRef.current.position.copy(moonLocalPosition);
        
        // Calculate moon's absolute position for lighting
        const moonAbsolutePosition = moonLocalPosition.clone().add(earthPosition);
        
        // Update moon shader lighting based on absolute position relative to star
        const starPosition = new THREE.Vector3(0, 0, 0);
        const lightDir = starPosition.clone().sub(moonAbsolutePosition).normalize();
        moonShaderMaterial.uniforms.lightDirection.value.copy(lightDir);
      }
    });
  });

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
                    >
                      <sphereGeometry args={[1, 32, 32]} />
                      <primitive object={moonShaderMaterial} />
                    </mesh>
                  </group>
                </group>
              )}
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