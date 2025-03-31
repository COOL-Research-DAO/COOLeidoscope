import { useState, useEffect } from 'react';
import { ExoplanetSystem } from '../types/Exoplanet';
import { Range } from 'react-range';

interface FilterRange {
  min: number;
  max: number;
  currentMin: number;
  currentMax: number;
  colorRange: {
    min: number;
    max: number;
  };
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

export function FilterPanel({ systems, onFiltersChange, onColorByChange, isOpen, onClose }: FilterPanelProps) {
  const [filters, setFilters] = useState<FilterOption[]>([]);

  // Initialize filters based on the data
  useEffect(() => {
    if (systems.length === 0) return;

    const initialFilters: FilterOption[] = [
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
    
    // Calculate full range
    let fullMin = Math.min(...values);
    let fullMax = Math.max(...values);
    
    // Calculate percentile range
    let colorMin = calculatePercentile(values, 1);
    let colorMax = calculatePercentile(values, 99);
    
    // Special handling for distance
    if (field === 'sy_dist') {
      fullMin = 1.288; // 4.2 light years in parsecs
      colorMin = 1.288;
    }
    
    // Special handling for planet count
    if (field === 'planetCount') {
      fullMin = 1;
      colorMin = 1;
      // Use full range for planet count
      colorMax = fullMax;
    }
    
    return {
      min: fullMin,
      max: fullMax,
      currentMin: fullMin,
      currentMax: fullMax,
      colorRange: {
        min: colorMin,
        max: colorMax
      }
    };
  }

  // Handle range filter changes
  const handleRangeChange = (index: number, min: number, max: number) => {
    const newFilters = [...filters];
    if (newFilters[index].range) {
      newFilters[index].range!.currentMin = min;
      newFilters[index].range!.currentMax = max;
    }
    setFilters(newFilters);
    onFiltersChange(newFilters);
  };

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

  // Add reset function to FilterPanel component
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
          <h3 style={{ marginBottom: '10px' }}>{filter.label}</h3>
          
          {filter.type === 'range' && filter.range && (
            <div style={{ padding: '20px 10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '25px' }}>
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
              {filter.field === 'planetCount' ? (
                <Range
                  key={`range-${filter.field}`}
                  step={1}
                  min={Math.floor(filter.range.min / 0.01) * 0.01}
                  max={Math.ceil(filter.range.max / 0.01) * 0.01}
                  values={[
                    Math.round(filter.range.currentMin / 0.01) * 0.01,
                    Math.round(filter.range.currentMax / 0.01) * 0.01
                  ]}
                  onChange={(values) => handleRangeChange(index, values[0], values[1])}
                  renderTrack={({ props, children }) => (
                    <div
                      {...props}
                      style={{
                        ...props.style,
                        height: '4px',
                        width: '100%',
                        backgroundColor: '#333',
                        borderRadius: '2px',
                      }}
                    >
                      {children}
                    </div>
                  )}
                  renderThumb={({ props, index }) => {
                    const { key, ...thumbProps } = props;
                    return (
                      <div
                        key={key}
                        {...thumbProps}
                        style={{
                          ...thumbProps.style,
                          height: '20px',
                          width: '20px',
                          borderRadius: '50%',
                          backgroundColor: '#666',
                          display: 'flex',
                          justifyContent: 'center',
                          alignItems: 'center',
                        }}
                      >
                        <div style={{
                          position: 'absolute',
                          top: '-20px',
                          color: 'white',
                          fontSize: '12px',
                        }}>
                          {[filter.range!.currentMin, filter.range!.currentMax][index].toFixed(2)}
                        </div>
                      </div>
                    );
                  }}
                />
              ) : (
                <Range
                  key={`range-${filter.field}`}
                  step={0.01}
                  min={Math.floor(filter.range.min / 0.01) * 0.01}
                  max={Math.ceil(filter.range.max / 0.01) * 0.01}
                  values={[
                    Math.round(filter.range.currentMin / 0.01) * 0.01,
                    Math.round(filter.range.currentMax / 0.01) * 0.01
                  ]}
                  onChange={(values) => handleRangeChange(index, values[0], values[1])}
                  renderTrack={({ props, children }) => (
                    <div
                      {...props}
                      style={{
                        ...props.style,
                        height: '4px',
                        width: '100%',
                        backgroundColor: '#333',
                        borderRadius: '2px',
                      }}
                    >
                      {children}
                    </div>
                  )}
                  renderThumb={({ props, index }) => {
                    const { key, ...thumbProps } = props;
                    return (
                      <div
                        key={key}
                        {...thumbProps}
                        style={{
                          ...thumbProps.style,
                          height: '20px',
                          width: '20px',
                          borderRadius: '50%',
                          backgroundColor: '#666',
                          display: 'flex',
                          justifyContent: 'center',
                          alignItems: 'center',
                        }}
                      >
                        <div style={{
                          position: 'absolute',
                          top: '-20px',
                          color: 'white',
                          fontSize: '12px',
                        }}>
                          {[filter.range!.currentMin, filter.range!.currentMax][index].toFixed(2)}
                        </div>
                      </div>
                    );
                  }}
                />
              )}
            </div>
          )}

          {filter.type === 'boolean' && (
            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={filter.selected}
                onChange={() => handleBooleanChange(index)}
                style={{ marginRight: '8px' }}
              />
              Enable
            </label>
          )}
        </div>
      ))}
    </div>
  );
}

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
    }
    return true;
  });

  return matches;
} 