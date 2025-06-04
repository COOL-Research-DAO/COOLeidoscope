import { ExoplanetSystem } from '../types/Exoplanet';
import React, { useState, useRef, useEffect, useCallback } from 'react';

// Habitable zone calculation constants
const HZ_CONSTANTS = {
  conservative: {
    inner: { S_eff: 1.1, a: 1.405e-4, b: 2.622e-8, c: 3.716e-12, d: -4.557e-16 },
    outer: { S_eff: 0.356, a: 6.171e-5, b: 1.698e-9, c: -3.198e-12, d: -5.575e-16 }
  }
};

// Calculate habitable zone for a star
function calculateHabitableZone(teff: number, luminosity: number) {
  if (!teff) {
    // Default values if temperature is missing
    return {
      conservative: { inner: 0.95 * Math.sqrt(luminosity), outer: 1.67 * Math.sqrt(luminosity) }
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
  
  return {
    conservative: {
      inner: Math.sqrt(luminosity / conservativeInnerSeff),
      outer: Math.sqrt(luminosity / conservativeOuterSeff)
    }
  };
}

// Check if a star system has any planets with orbits that intersect the habitable zone
export function hasPlanetInHabitableZone(system: ExoplanetSystem): boolean {
  // Get star parameters
  const teff = system.st_teff || 5780; // Default to solar temperature if not available
  
  // Calculate luminosity if not provided
  let luminosity = system.st_lum || null;
  
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
  
  // Calculate habitable zone boundaries in AU
  const hz = calculateHabitableZone(teff, luminosity);
  const innerEdge = hz.conservative.inner; // AU
  const outerEdge = hz.conservative.outer; // AU
  
  // Check each planet in the system
  for (const planet of system.planets) {
    // Get orbital parameters
    const semiMajorAxis = planet.pl_orbsmax; // in AU
    
    // Skip if orbital data is missing
    if (!semiMajorAxis) continue;
    
    // Get eccentricity (default to 0 if missing)
    const eccentricity = planet.pl_orbeccen || 0;
    
    // Calculate perihelion and aphelion
    const perihelion = semiMajorAxis * (1 - eccentricity); // Closest approach to star
    const aphelion = semiMajorAxis * (1 + eccentricity); // Furthest distance from star
    
    // Check if orbit intersects with habitable zone
    // Orbit intersects if perihelion is inside outer edge OR aphelion is inside inner edge
    const orbitIntersectsHZ = 
      (perihelion <= outerEdge && aphelion >= innerEdge);
    
    if (orbitIntersectsHZ) {
      return true; // Found at least one planet in habitable zone
    }
  }
  
  // No planets in habitable zone
  return false;
}

interface FilterRange {
  min: number;
  max: number;
  currentMin: number;
  currentMax: number;
  colorRange: {
    min: number;
    max: number;
  };
  useLog?: boolean;
}

export interface FilterOption {
  label: string;
  field: string;
  type: 'range' | 'boolean';
  range?: FilterRange;
  options?: string[];
  selected?: boolean;
  colorBy?: boolean;
}

interface FilterPanelProps {
  systems: ExoplanetSystem[];
  onFiltersChange: (filters: FilterOption[]) => void;
  onColorByChange: (field: string | null) => void;
  isOpen: boolean;
  onClose: () => void;
}

// Add debounce utility function
const debounce = <F extends (...args: any[]) => any>(
  func: F, 
  wait: number
): ((...args: Parameters<F>) => void) => {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  
  return function(...args: Parameters<F>) {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};

// Add a custom DualRangeSlider component with optimized performance
const DualRangeSlider: React.FC<{
  min: number;
  max: number;
  minValue: number;
  maxValue: number;
  step?: number;
  onChange: (min: number, max: number) => void;
  onMouseDown?: () => void;
  format?: (value: number) => string;
}> = ({ min, max, minValue, maxValue, step = 0.01, onChange, onMouseDown, format }) => {
  const sliderRef = useRef<HTMLDivElement>(null);
  const minThumbRef = useRef<HTMLDivElement>(null);
  const maxThumbRef = useRef<HTMLDivElement>(null);
  const trackHighlightRef = useRef<HTMLDivElement>(null);
  const minLabelRef = useRef<HTMLDivElement>(null);
  const maxLabelRef = useRef<HTMLDivElement>(null);
  
  const [localMinValue, setLocalMinValue] = useState(minValue);
  const [localMaxValue, setLocalMaxValue] = useState(maxValue);
  const [isDragging, setIsDragging] = useState<'min' | 'max' | null>(null);
  const lastReportedValues = useRef({ min: minValue, max: maxValue });
  
  // Sync external values with local state when props change
  useEffect(() => {
    if (!isDragging && 
        (minValue !== lastReportedValues.current.min || 
         maxValue !== lastReportedValues.current.max)) {
      setLocalMinValue(minValue);
      setLocalMaxValue(maxValue);
      lastReportedValues.current = { min: minValue, max: maxValue };
      
      // Update DOM directly for better performance
      updateDomElements(minValue, maxValue);
    }
  }, [minValue, maxValue, isDragging]);
  
  // Format function with fallback
  const formatValue = format || ((value: number) => value.toFixed(1));
  
  // Calculate percentage for positioning
  const getPercent = (value: number) => {
    return ((value - min) / (max - min)) * 100;
  };
  
  // Direct DOM manipulation for smoother performance
  const updateDomElements = (minVal: number, maxVal: number) => {
    if (!minThumbRef.current || !maxThumbRef.current || 
        !trackHighlightRef.current || !minLabelRef.current || 
        !maxLabelRef.current) return;
        
    const minPos = getPercent(minVal);
    const maxPos = getPercent(maxVal);
    
    // Update positions directly using style transform for better performance
    minThumbRef.current.style.left = `${minPos}%`;
    maxThumbRef.current.style.left = `${maxPos}%`;
    
    // Update track highlight
    trackHighlightRef.current.style.left = `${minPos}%`;
    trackHighlightRef.current.style.width = `${maxPos - minPos}%`;
    
    // Update labels
    minLabelRef.current.style.left = `${minPos}%`;
    minLabelRef.current.textContent = formatValue(minVal);
    
    maxLabelRef.current.style.left = `${maxPos}%`;
    maxLabelRef.current.textContent = formatValue(maxVal);
  };
  
  // Update parent state but debounce during drag operations
  const updateParentState = useCallback((newMin: number, newMax: number) => {
    lastReportedValues.current = { min: newMin, max: newMax };
    onChange(newMin, newMax);
  }, [onChange]);
  
  // Handle thumb drag start with optimized performance
  const handleThumbMouseDown = (e: React.MouseEvent, thumb: 'min' | 'max') => {
    e.preventDefault();
    setIsDragging(thumb);
    if (onMouseDown) onMouseDown();
    
    // Start position
    const startX = e.clientX;
    const trackRect = sliderRef.current?.getBoundingClientRect();
    const trackWidth = trackRect?.width || 1;
    
    // Calculate initial values
    const startMinVal = localMinValue;
    const startMaxVal = localMaxValue;
    
    let frameId: number | null = null;
    let lastNewMin = startMinVal;
    let lastNewMax = startMaxVal;
    
    // Handle mouse move during drag with requestAnimationFrame for smooth performance
    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!trackRect) return;
      
      // Cancel any pending animation frame
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }
      
      // Schedule update on next animation frame
      frameId = requestAnimationFrame(() => {
        // Calculate delta movement as percentage of track width
        const deltaX = moveEvent.clientX - startX;
        const deltaPercentage = deltaX / trackWidth;
        const deltaValue = deltaPercentage * (max - min);
        
        if (thumb === 'min') {
          // Update min value
          const newMinVal = Math.max(min, Math.min(startMinVal + deltaValue, lastNewMax - step));
          // Round to step
          const roundedMinVal = Math.round((newMinVal - min) / step) * step + min;
          lastNewMin = roundedMinVal;
          
          // Update DOM directly without state updates for smoother performance
          updateDomElements(roundedMinVal, lastNewMax);
        } else {
          // Update max value
          const newMaxVal = Math.min(max, Math.max(startMaxVal + deltaValue, lastNewMin + step));
          // Round to step
          const roundedMaxVal = Math.round((newMaxVal - min) / step) * step + min;
          lastNewMax = roundedMaxVal;
          
          // Update DOM directly without state updates for smoother performance
          updateDomElements(lastNewMin, roundedMaxVal);
        }
      });
    };
    
    // Handle mouse up to end drag
    const handleMouseUp = () => {
      // Cancel any pending animation frame
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }
      
      // Update state at the end of drag
      setLocalMinValue(lastNewMin);
      setLocalMaxValue(lastNewMax);
      updateParentState(lastNewMin, lastNewMax);
      
      // Use timeout to avoid any race conditions with React's state updates
      setTimeout(() => {
        setIsDragging(null);
      }, 0);
      
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };
  
  // Handle track click - simplified
  const handleTrackClick = (e: React.MouseEvent) => {
    if (!sliderRef.current) return;
    
    const rect = sliderRef.current.getBoundingClientRect();
    const clickPosition = e.clientX - rect.left;
    const percentage = clickPosition / rect.width;
    const value = min + percentage * (max - min);
    const roundedValue = Math.round((value - min) / step) * step + min;
    
    // Determine which thumb to move (closest)
    const distToMin = Math.abs(value - localMinValue);
    const distToMax = Math.abs(value - localMaxValue);
    
    if (distToMin <= distToMax) {
      const newMin = Math.min(roundedValue, localMaxValue - step);
      setLocalMinValue(newMin);
      updateDomElements(newMin, localMaxValue);
      updateParentState(newMin, localMaxValue);
    } else {
      const newMax = Math.max(roundedValue, localMinValue + step);
      setLocalMaxValue(newMax);
      updateDomElements(localMinValue, newMax);
      updateParentState(localMinValue, newMax);
    }
  };
  
  // Handle touch start - optimized the same way as mouse events
  const handleThumbTouchStart = (e: React.TouchEvent, thumb: 'min' | 'max') => {
    e.preventDefault();
    setIsDragging(thumb);
    if (onMouseDown) onMouseDown();
    
    // Start position
    const startX = e.touches[0].clientX;
    const trackRect = sliderRef.current?.getBoundingClientRect();
    const trackWidth = trackRect?.width || 1;
    
    // Calculate initial values
    const startMinVal = localMinValue;
    const startMaxVal = localMaxValue;
    
    let frameId: number | null = null;
    let lastNewMin = startMinVal;
    let lastNewMax = startMaxVal;
    
    // Handle touch move during drag with requestAnimationFrame
    const handleTouchMove = (moveEvent: TouchEvent) => {
      moveEvent.preventDefault();
      if (!trackRect) return;
      
      // Cancel any pending animation frame
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }
      
      // Schedule update on next animation frame
      frameId = requestAnimationFrame(() => {
        // Calculate delta movement as percentage of track width
        const deltaX = moveEvent.touches[0].clientX - startX;
        const deltaPercentage = deltaX / trackWidth;
        const deltaValue = deltaPercentage * (max - min);
        
        if (thumb === 'min') {
          // Update min value
          const newMinVal = Math.max(min, Math.min(startMinVal + deltaValue, lastNewMax - step));
          // Round to step
          const roundedMinVal = Math.round((newMinVal - min) / step) * step + min;
          lastNewMin = roundedMinVal;
          
          // Update DOM directly without state updates
          updateDomElements(roundedMinVal, lastNewMax);
        } else {
          // Update max value
          const newMaxVal = Math.min(max, Math.max(startMaxVal + deltaValue, lastNewMin + step));
          // Round to step
          const roundedMaxVal = Math.round((newMaxVal - min) / step) * step + min;
          lastNewMax = roundedMaxVal;
          
          // Update DOM directly without state updates
          updateDomElements(lastNewMin, roundedMaxVal);
        }
      });
    };
    
    // Handle touch end to end drag
    const handleTouchEnd = () => {
      // Cancel any pending animation frame
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }
      
      // Update state at the end of drag
      setLocalMinValue(lastNewMin);
      setLocalMaxValue(lastNewMax);
      updateParentState(lastNewMin, lastNewMax);
      
      // Use timeout to avoid race conditions
      setTimeout(() => {
        setIsDragging(null);
      }, 0);
      
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
    
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);
  };
  
  // Calculate initial positions
  const minPos = getPercent(localMinValue);
  const maxPos = getPercent(localMaxValue);

  return (
    <div style={{ position: 'relative', height: '40px' }}>
      {/* Main track */}
      <div
        ref={sliderRef}
        onClick={handleTrackClick}
        style={{
          position: 'absolute',
          top: '50%',
          transform: 'translateY(-50%)',
          width: '100%',
          height: '4px',
          backgroundColor: '#333',
          borderRadius: '4px',
          cursor: 'pointer'
        }}
      >
        {/* Track highlight */}
        <div
          ref={trackHighlightRef}
          style={{
            position: 'absolute',
            left: `${minPos}%`,
            width: `${maxPos - minPos}%`,
            height: '100%',
            backgroundColor: '#666',
            borderRadius: '4px'
          }}
        />
      </div>
      
      {/* Min thumb */}
      <div
        ref={minThumbRef}
        onMouseDown={(e) => handleThumbMouseDown(e, 'min')}
        onTouchStart={(e) => handleThumbTouchStart(e, 'min')}
        style={{
          position: 'absolute',
          left: `${minPos}%`,
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: '18px',
          height: '18px',
          borderRadius: '50%',
          backgroundColor: '#fff',
          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
          cursor: 'grab',
          zIndex: 2,
          touchAction: 'none',
          willChange: 'left' // Hint for browser optimization
        }}
      />
      
      {/* Max thumb */}
      <div
        ref={maxThumbRef}
        onMouseDown={(e) => handleThumbMouseDown(e, 'max')}
        onTouchStart={(e) => handleThumbTouchStart(e, 'max')}
        style={{
          position: 'absolute',
          left: `${maxPos}%`,
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: '18px',
          height: '18px',
          borderRadius: '50%',
          backgroundColor: '#fff',
          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
          cursor: 'grab',
          zIndex: 2,
          touchAction: 'none',
          willChange: 'left' // Hint for browser optimization
        }}
      />
      
      {/* Labels */}
      <div
        ref={minLabelRef}
        style={{
          position: 'absolute',
          left: `${minPos}%`,
          top: '-10px',
          transform: 'translateX(-50%)',
          fontSize: '12px',
          color: '#fff',
          willChange: 'left, content' // Hint for browser optimization
        }}
      >
        {formatValue(localMinValue)}
      </div>
      
      <div
        ref={maxLabelRef}
        style={{
          position: 'absolute',
          left: `${maxPos}%`,
          top: '-10px',
          transform: 'translateX(-50%)',
          fontSize: '12px',
          color: '#fff',
          willChange: 'left, content' // Hint for browser optimization
        }}
      >
        {formatValue(localMaxValue)}
      </div>
    </div>
  );
};

export const FilterPanel = React.memo(function FilterPanel({ systems, onFiltersChange, onColorByChange, isOpen, onClose }: FilterPanelProps) {
  const [filters, setFilters] = useState<FilterOption[]>([]);
  const [localState, setLocalState] = useState<{[key: string]: {min: number, max: number}}>({});
  const isDraggingRef = useRef(false);

  // Initialize filters based on the data
  useEffect(() => {
    if (systems.length === 0) return;

    const initialFilters: FilterOption[] = [
      {
        label: 'Star with potentially habitable planet(s)',
        field: 'hasHabitablePlanet',
        type: 'boolean',
        selected: false
      },
      {
        label: 'Star Temperature (K)',
        field: 'st_teff',
        type: 'range',
        range: initializeRange(systems, 'st_teff'),
        colorBy: false
      },
      {
        label: 'Star Mass (Solar)',
        field: 'st_mass',
        type: 'range',
        range: initializeRange(systems, 'st_mass'),
        colorBy: false
      },
      {
        label: 'Star Radius (Solar)',
        field: 'st_rad',
        type: 'range',
        range: initializeRange(systems, 'st_rad'),
        colorBy: false
      },
      {
        label: 'Star Age (Gyr)',
        field: 'st_age',
        type: 'range',
        range: initializeRange(systems, 'st_age'),
        colorBy: false
      },
      {
        label: 'Distance (parsecs)',
        field: 'sy_dist',
        type: 'range',
        range: initializeRange(systems, 'sy_dist'),
        colorBy: false
      },
      {
        label: 'Number of Planets',
        field: 'planetCount',
        type: 'range',
        range: {
          min: 1,
          max: Math.max(...systems.map(s => s.planets.length)),
          currentMin: 1,
          currentMax: Math.max(...systems.map(s => s.planets.length)),
          colorRange: {
            min: 1,
            max: Math.max(...systems.map(s => s.planets.length))
          }
        },
        colorBy: false
      }
    ];

    // Initialize local state for all sliders
    const initialLocalState: {[key: string]: {min: number, max: number}} = {};
    initialFilters.forEach(filter => {
      if (filter.range) {
        initialLocalState[filter.field] = {
          min: filter.range.currentMin,
          max: filter.range.currentMax
        };
      }
    });
    
    setLocalState(initialLocalState);
    setFilters(initialFilters);
    onFiltersChange(initialFilters);
  }, [systems, onFiltersChange]);

  // Helper function to calculate percentile
  function calculatePercentile(values: number[], percentile: number): number {
    const sorted = [...values].sort((a, b) => a - b);
    const index = (percentile / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
  }

  // Helper function to initialize range values
  function initializeRange(systems: ExoplanetSystem[], field: string): FilterRange {
    const values = systems
      .map(system => (system as any)[field])
      .filter(value => value !== null && value !== undefined && !isNaN(value));
    
    if (values.length === 0) {
      return {
        min: 0,
        max: 1000,
        currentMin: 0,
        currentMax: 1000,
        colorRange: { min: 0, max: 1000 }
      };
    }
    
    // Calculate percentile range for all filters
    let rangeMin = calculatePercentile(values, 1);
    let rangeMax = calculatePercentile(values, 99);
    
    // Special handling for specific fields
    switch (field) {
      case 'sy_dist':
        rangeMin = 1.288; // 4.2 light years in parsecs
        rangeMax = Math.min(500, rangeMax); // Cap at 1000 parsecs
        // Convert to log scale
        return {
          min: rangeMin,
          max: rangeMax,
          currentMin: rangeMin,
          currentMax: rangeMax,
          colorRange: {
            min: rangeMin,
            max: rangeMax
          },
          useLog: true // Add flag for log scale
        };
      
      case 'planetCount':
        rangeMin = 1;
        rangeMax = Math.max(...values);
        break;
      
      case 'st_teff':
        rangeMin = Math.max(2000, rangeMin);
        rangeMax = Math.min(7000, rangeMax);
        break;
      
      case 'st_mass':
        rangeMin = Math.max(0.08, rangeMin); // Brown dwarf limit
        rangeMax = Math.min(150, rangeMax);  // Theoretical upper mass limit
        break;
      
      case 'st_rad':
        rangeMin = Math.max(0.08, rangeMin); // Minimum main sequence radius
        rangeMax = Math.min(1000, rangeMax); // Reasonable upper limit for giants
        break;
    }
    
    // Use the same range for both slider and color
    return {
      min: rangeMin,
      max: rangeMax,
      currentMin: rangeMin,
      currentMax: rangeMax,
      colorRange: {
        min: rangeMin,
        max: rangeMax
      }
    };
  }

  // Apply filters only when dragging stops or on specific trigger
  const applyFilters = useCallback(() => {
    const newFilters = [...filters];
    
    newFilters.forEach((filter, index) => {
      if (filter.range && localState[filter.field]) {
        filter.range.currentMin = localState[filter.field].min;
        filter.range.currentMax = localState[filter.field].max;
      }
    });
    
    setFilters(newFilters);
    onFiltersChange(newFilters);
  }, [filters, localState, onFiltersChange]);

  // Handle input change for min value with immediate filtering
  const handleMinInputChange = useCallback((field: string, value: number) => {
    setLocalState(prev => {
      const newState = {
        ...prev,
        [field]: {
          ...prev[field],
          min: value
        }
      };
      
      // Apply filters immediately - don't wait for mouseup
      const newFilters = [...filters];
      newFilters.forEach((filter) => {
        if (filter.range && newState[filter.field]) {
          filter.range.currentMin = newState[filter.field].min;
          filter.range.currentMax = newState[filter.field].max;
        }
      });
      
      setFilters(newFilters);
      onFiltersChange(newFilters);
      
      return newState;
    });
  }, [filters, onFiltersChange]);

  // Handle input change for max value with immediate filtering
  const handleMaxInputChange = useCallback((field: string, value: number) => {
    setLocalState(prev => {
      const newState = {
        ...prev,
        [field]: {
          ...prev[field],
          max: value
        }
      };
      
      // Apply filters immediately - don't wait for mouseup
      const newFilters = [...filters];
      newFilters.forEach((filter) => {
        if (filter.range && newState[filter.field]) {
          filter.range.currentMin = newState[filter.field].min;
          filter.range.currentMax = newState[filter.field].max;
        }
      });
      
      setFilters(newFilters);
      onFiltersChange(newFilters);
      
      return newState;
    });
  }, [filters, onFiltersChange]);

  // Handle both min and max changes together - with more aggressive optimization
  const handleRangeChange = useCallback((field: string, min: number, max: number) => {
    // Update local state immediately
    setLocalState(prev => ({
      ...prev,
      [field]: { min, max }
    }));
    
    // Use requestAnimationFrame to batch updates for better performance
    requestAnimationFrame(() => {
      const newFilters = [...filters];
      newFilters.forEach((filter) => {
        if (filter.field === field && filter.range) {
          filter.range.currentMin = min;
          filter.range.currentMax = max;
        }
      });
      
      setFilters(newFilters);
      onFiltersChange(newFilters);
    });
  }, [filters, onFiltersChange]);

  // Process distance values with log scale
  const processDistValue = useCallback((value: number, isLog: boolean, isInverse: boolean = false) => {
    if (!isLog) return value;
    
    if (isInverse) {
      return Math.pow(10, value);
    } else {
      return Math.log10(value);
    }
  }, []);

  const startDragging = useCallback(() => {
    isDraggingRef.current = true;
  }, []);

  const stopDragging = useCallback(() => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      applyFilters();
    }
  }, [applyFilters]);

  // Add event listeners for mouseup to detect end of dragging
  useEffect(() => {
    window.addEventListener('mouseup', stopDragging);
    window.addEventListener('touchend', stopDragging);
    
    return () => {
      window.removeEventListener('mouseup', stopDragging);
      window.removeEventListener('touchend', stopDragging);
    };
  }, [stopDragging]);

  // Handle boolean filter changes
  const handleBooleanChange = (index: number) => {
    const newFilters = [...filters];
    newFilters[index].selected = !newFilters[index].selected;
    setFilters(newFilters);
    onFiltersChange(newFilters);
  };

  // Handle color by filter changes
  const handleColorByChange = (index: number) => {
    console.log('Color checkbox clicked:', {
      field: filters[index].field,
      currentValue: filters[index].colorBy
    });

    const newFilters = filters.map((filter, i) => ({
      ...filter,
      colorBy: i === index ? !filter.colorBy : false
    }));

    const fieldToColorBy = newFilters[index].colorBy ? newFilters[index].field : null;
    
    console.log('Calling onColorByChange with:', fieldToColorBy);
    
    setFilters(newFilters);
    onFiltersChange(newFilters);
    onColorByChange(fieldToColorBy);
  };

  // Reset function updated to work with local state
  const resetFilters = () => {
    const resetFilters = filters.map(filter => ({
      ...filter,
      colorBy: false,
      range: filter.range ? {
        ...filter.range,
        currentMin: filter.range.min,
        currentMax: filter.range.max
      } : undefined
    }));
    
    // Reset local state
    const resetLocalState: {[key: string]: {min: number, max: number}} = {};
    resetFilters.forEach(filter => {
      if (filter.range) {
        resetLocalState[filter.field] = {
          min: filter.range.min,
          max: filter.range.max
        };
      }
    });
    
    setLocalState(resetLocalState);
    setFilters(resetFilters);
    onFiltersChange(resetFilters);
    onColorByChange(null);
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      right: 0,
      top: 0,
      bottom: 0,
      width: '300px',
      backgroundColor: 'rgba(0, 0, 0, 0.9)',
      padding: '20px',
      color: 'white',
      overflowY: 'auto',
      zIndex: 1000,
      transition: 'transform 0.3s ease-in-out',
      transform: isOpen ? 'translateX(0)' : 'translateX(100%)'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
        <h2 style={{ margin: 0 }}>Filters</h2>
        <div>
          <button 
            onClick={resetFilters}
            style={{
              background: 'none',
              border: '1px solid white',
              color: 'white',
              cursor: 'pointer',
              padding: '4px 8px',
              marginRight: '8px',
              borderRadius: '4px',
            }}
          >
            Reset
          </button>
          <button 
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'white',
              cursor: 'pointer',
              fontSize: '20px'
            }}
          >
            ×
          </button>
        </div>
      </div>

      {filters.map((filter, index) => (
        <div key={filter.field} style={{ marginBottom: '20px' }}>
          {filter.field === 'hasHabitablePlanet' ? (
            <div style={{ 
              backgroundColor: 'rgba(0, 180, 0, 0.15)',
              border: '1px solid rgba(0, 180, 0, 0.4)',
              borderRadius: '4px',
              padding: '10px 15px',
              marginLeft: '-15px',
              display: 'inline-block'
            }}>
              <h3 style={{ 
                marginTop: '0',
                marginBottom: '10px'
              }}>{filter.label}</h3>
              
              <label style={{ 
                display: 'flex', 
                alignItems: 'center', 
                cursor: 'pointer'
              }}>
                <input
                  type="checkbox"
                  checked={filter.selected}
                  onChange={() => handleBooleanChange(index)}
                  style={{ 
                    marginRight: '8px',
                    accentColor: '#4CAF50'
                  }}
                />
                True
              </label>
            </div>
          ) : (
            <>
              <h3 style={{ marginBottom: '5px' }}>{filter.label}</h3>
              
              {filter.type === 'range' && filter.range && localState[filter.field] && (
                <div style={{ padding: '5px 0 5px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={filter.colorBy || false}
                        onChange={() => handleColorByChange(index)}
                        style={{ marginRight: '8px' }}
                      />
                      Color by {filter.label}
                    </label>
                  </div>
                  
                  {filter.field === 'sy_dist' ? (
                    // Distance uses log scale
                    <DualRangeSlider
                      min={Math.log10(filter.range.min)}
                      max={Math.log10(filter.range.max)}
                      minValue={Math.log10(localState[filter.field].min)}
                      maxValue={Math.log10(localState[filter.field].max)}
                      step={0.01}
                      onChange={(min, max) => {
                        handleRangeChange(
                          filter.field,
                          Math.pow(10, min),
                          Math.pow(10, max)
                        );
                      }}
                      onMouseDown={startDragging}
                      format={(value) => Math.pow(10, value).toFixed(1)}
                    />
                  ) : filter.field === 'planetCount' ? (
                    // Planet count uses integer steps
                    <DualRangeSlider
                      min={filter.range.min}
                      max={filter.range.max}
                      minValue={localState[filter.field].min}
                      maxValue={localState[filter.field].max}
                      step={1}
                      onChange={(min, max) => {
                        handleRangeChange(filter.field, min, max);
                      }}
                      onMouseDown={startDragging}
                      format={(value) => value.toFixed(0)}
                    />
                  ) : (
                    // Normal scales
                    <DualRangeSlider
                      min={filter.range.min}
                      max={filter.range.max}
                      minValue={localState[filter.field].min}
                      maxValue={localState[filter.field].max}
                      step={0.01}
                      onChange={(min, max) => {
                        handleRangeChange(filter.field, min, max);
                      }}
                      onMouseDown={startDragging}
                      format={(value) => value.toFixed(1)}
                    />
                  )}
                </div>
              )}

              {filter.type === 'boolean' && (
                <label style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  cursor: 'pointer',
                }}>
                  <input
                    type="checkbox"
                    checked={filter.selected}
                    onChange={() => handleBooleanChange(index)}
                    style={{ marginRight: '8px' }}
                  />
                  True
                </label>
              )}
            </>
          )}
        </div>
      ))}
    </div>
  );
});

// Helper function to check if a system matches the filters
export function systemMatchesFilters(system: ExoplanetSystem, filters: FilterOption[]): boolean {
  // If there are no active filters, all systems match
  const activeFilters = filters.filter(f => 
    (f.type === 'range' && f.range && 
     (f.range.currentMin !== f.range.min || f.range.currentMax !== f.range.max)) ||
    (f.type === 'boolean' && f.selected)
  );
  
  if (activeFilters.length === 0) {
    return true;
  }

  const matches = activeFilters.every(filter => {
    if (filter.type === 'range' && filter.range) {
      if (filter.field === 'planetCount') {
        const matches = system.planets.length >= filter.range.currentMin && 
                       system.planets.length <= filter.range.currentMax;
        return matches;
      }

      const value = (system as any)[filter.field];
      
      // If the filter is at its full range, don't filter out null/undefined values
      const isAtFullRange = filter.range.currentMin === filter.range.min && 
                           filter.range.currentMax === filter.range.max;
      
      if (value === null || value === undefined) {
        return isAtFullRange;
      }
      
      const matches = value >= filter.range.currentMin && value <= filter.range.currentMax;
      return matches;
    } else if (filter.type === 'boolean' && filter.selected) {
      // Handle boolean filters
      if (filter.field === 'hasHabitablePlanet') {
        return hasPlanetInHabitableZone(system);
      }
    }
    return true;
  });

  return matches;
} 