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
  sizeScale: number;
  isPaused: boolean;
  setIsPaused: React.Dispatch<React.SetStateAction<boolean>>;
  activeFilters: FilterOption[];
  colorByField: string | null;
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
  setIsPaused,
  activeFilters,
  colorByField
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
    const filteredSystems = systems.filter((system: ExoplanetSystem) => {
      const basePosition = equatorialToCartesian(system.ra, system.dec, system.sy_dist);
      const position = useUniverseOffset 
        ? new THREE.Vector3(...basePosition).sub(universeOffset)
        : new THREE.Vector3(...basePosition);
      return position.length() < 1000; // Only show stars within 1000 parsecs of current view
    });
    return filteredSystems;
  }, [systems, universeOffset, useUniverseOffset]);


  
  return (
    <>
      <ambientLight intensity={1.0} />
      <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade />
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
          isHighlighted={system === highlightedSystem}
          isPaused={isPaused}
              sizeScale={sizeScale}
              isFiltered={isFiltered}
              colorByField={colorByField}
              colorByValue={colorByValue}
              activeFilters={activeFilters}
              systemMaxScale={1000}
              planetScaleRatio={100}
            />
          );
        });
      }, [visibleSystems, universeOffset, scale, highlightedSystem, isPaused, useUniverseOffset, sizeScale, activeFilters, colorByField])}
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
    </>
  );
});

function ExoplanetScene({ gl }: { gl: THREE.WebGLRenderer }) {
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
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [activeFilters, setActiveFilters] = useState<FilterOption[]>([]);
  const [colorByField, setColorByField] = useState<string | null>(null);

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
          activeFilters={activeFilters}
          colorByField={colorByField}
        />
      </Canvas>
      
      {/* Size scale slider */}
      <div 
        style={{
          position: 'absolute',
          bottom: '30px',
          left: '350px',
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
      <button
        onClick={() => setIsFilterPanelOpen(true)}
        style={{
          position: 'fixed',
          top: '1rem',
          right: '320px',
          padding: '8px',
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
          bottom: '5%',  // Center vertically
          left: '50%',
          transform: 'translate(-50%, -50%)',
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
    </div>
  );
} 

export default ExoplanetScene; 