import { ExoplanetSystem } from '../types/Exoplanet';
import { CSSProperties, useEffect } from 'react';

interface StarInfoModalProps {
  system: ExoplanetSystem | null;
  onClose: () => void;
  compact: boolean;
  showHabitableZones?: boolean;
  onToggleHabitableZones?: () => void;
}

// Add this style block at the top of the file, after imports
const modalStyles = `
  .modal-close-button {
    background-color: white !important;
    color: black !important;
    width: 24px !important;
    height: 24px !important;
    border-radius: 50% !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    font-size: 16px !important;
    padding: 0 !important;
    border: none !important;
    cursor: pointer !important;
    transition: opacity 0.2s !important;
  }
  .modal-close-button:hover {
    opacity: 0.8 !important;
  }
`;

export function StarInfoModal({ system, onClose, compact, showHabitableZones, onToggleHabitableZones }: StarInfoModalProps) {
  // Add style element to inject our CSS
  useEffect(() => {
    const styleElement = document.createElement('style');
    styleElement.textContent = modalStyles;
    document.head.appendChild(styleElement);
    return () => {
      document.head.removeChild(styleElement);
    };
  }, []);

  if (!system) return null;

  const modalStyle: CSSProperties = compact ? {
    color: 'white',
    width: '100%',
  } : {
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    padding: '2rem',
    borderRadius: '8px',
    color: 'white',
    maxWidth: '600px',
    maxHeight: '80vh',
    overflowY: 'auto',
    border: '1px solid #666',
  };

  const formatValue = (value: number | null, precision: number = 2, unit: string = ''): string => {
    if (value === null || isNaN(value)) return 'Unknown';
    return `${value.toFixed(precision)}${unit}`;
  };

  const formatDistance = (system: ExoplanetSystem): string => {
    if (system.hostname === 'Sun') {
      // Convert parsecs to kilometers for the Sun (1 parsec = 3.086e13 km)
      const distanceInKm = system.sy_dist * 3.086e13;
      return `${(distanceInKm / 1000000).toFixed(1)} million km`;
    } else {
      // Convert parsecs to light years (1 parsec = 3.262 light years)
      const distanceInLightYears = system.sy_dist * 3.262;
      return `${distanceInLightYears.toFixed(1)} light years`;
    }
  };

  const formatError = (value: number | null, err1: number | null, err2: number | null): string => {
    if (value === null || isNaN(value)) return 'Unknown';
    if (err1 === null && err2 === null) return value.toFixed(2);
    const errStr = err1 !== null && err2 !== null ? 
      `+${err1.toFixed(2)}/-${Math.abs(err2).toFixed(2)}` : '';
    return `${value.toFixed(2)} ${errStr}`;
  };

  // Function to parse HTML link and return React element
  const parseReferenceLink = (htmlString: string) => {
    if (!htmlString || htmlString === 'Unknown') return 'Not available';
    
    try {
      // Extract href attribute
      const hrefMatch = htmlString.match(/href=["']?([^"' >]+)/);
      const href = hrefMatch ? hrefMatch[1] : '';
      
      // Extract link text
      const textMatch = htmlString.match(/>([^<]+)<\/a>/);
      let text = textMatch ? textMatch[1].trim() : 'Reference';
      
      // Decode HTML entities for accented characters
      text = decodeHtmlEntities(text);
      
      if (href) {
        return (
          <a 
            href={href} 
            target="_blank" 
            rel="noopener noreferrer"
            style={{ color: '#4da6ff', textDecoration: 'underline' }}
          >
            {text}
          </a>
        );
      }
      
      return text;
    } catch (e) {
      console.error('Error parsing reference link:', e);
      return htmlString;
    }
  };

  // Function to decode HTML entities (like &eacute; to é)
  const decodeHtmlEntities = (text: string): string => {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = text;
    return textarea.value;
  };

  return (
    <div style={modalStyle}>
      {compact ? (
        <div className="compact-panel">
          <button 
            className="modal-close-button absolute top-1 right-1"
            onClick={onClose}
          >
            ×
          </button>
          <h2 style={{ marginBottom: '1rem' }}>{system.hostname}</h2>
          
          <div style={{ marginBottom: '1rem' }}>
            <h3>Stellar Properties</h3>
            <p>Coordinates: RA {formatValue(system.ra, 4)}°, Dec {formatValue(system.dec, 4)}°</p>
            <p>Distance to Earth: {formatDistance(system)}</p>
            <p>Number of Planets: {system.planets.length}</p>
            <p>Radius: {formatError(system.st_rad, system.st_rad_err1, system.st_rad_err2)}{system.st_rad !== null && !isNaN(system.st_rad) ? ' R☉' : ''}</p>
            <p>Mass: {formatError(system.st_mass, system.st_mass_err1, system.st_mass_err2)}{system.st_mass !== null && !isNaN(system.st_mass) ? ' M☉' : ''}</p>
            <p>Age: {formatError(system.st_age, system.st_age_err1, system.st_age_err2)}{system.st_age !== null && !isNaN(system.st_age) ? ' Gyr' : ''}</p>
            <p>Temperature: {formatError(system.st_teff, system.st_teff_err1, system.st_teff_err2)}{system.st_teff !== null && !isNaN(system.st_teff) ? 'K' : ''}</p>
            <p>Rotation Period: {formatError(system.st_rotp, system.st_rotperr1, system.st_rotperr2)}{system.st_rotp !== null && !isNaN(system.st_rotp) ? ' days' : ''}{system.st_rotplim ? ` (${system.st_rotplim})` : ''}</p>
          </div>

          {/* Habitable Zone toggle button for compact view */}
          {compact && onToggleHabitableZones && (
            <button
              onClick={onToggleHabitableZones}
              style={{
                width: '80%',
                padding: '8px',
                backgroundColor: 'rgba(0, 0, 0, 0.7)',
                border: '1px solid #666',
                borderRadius: '4px',
                color: 'white',
                cursor: 'pointer',
                marginTop: '-0.5rem',
                textAlign: 'center',
              }}
            >
              {showHabitableZones ? 'Hide Habitable Zone' : 'Show Habitable Zone'}
            </button>
          )}

          {!compact && (
            <div>
              <h3>Planets ({system.planets.length})</h3>
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
                gap: '1rem',
                marginTop: '1rem'
              }}>
                {system.planets.map(planet => (
                  <div 
                    key={planet.pl_name}
                    style={{
                      backgroundColor: 'rgba(255, 255, 255, 0.1)',
                      padding: '1rem',
                      borderRadius: '4px'
                    }}
                  >
                    <h4>{planet.pl_name}</h4>
                    <p>Radius: {formatValue(planet.pl_rade, 2, ' R⊕')}</p>
                    <p>Mass: {formatValue(planet.pl_masse, 2, ' M⊕')}</p>
                    <p>Density: {formatValue(planet.pl_dens, 2, ' g/cm³')}</p>
                    <p>Orbital Period: {formatValue(planet.pl_orbper, 2, ' days')}</p>
                    <p>Semi-major Axis: {formatValue(planet.pl_orbsmax, 3, ' AU')}</p>
                    <p>Eccentricity: {formatValue(planet.pl_orbeccen, 3)}</p>
                    <p>Discovery Method: {planet.discoverymethod}</p>
                    <p>Discovery Year: {planet.disc_year}</p>
                    <p>Discovery Reference: {parseReferenceLink(planet.disc_refname)}</p>
                    <p>Planetary Parameter Reference: {parseReferenceLink(planet.pl_refname)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          <button
            onClick={onClose}
            className="modal-close-button"
            style={{
              position: 'absolute',
              top: '1rem',
              right: '1rem',
            }}
          >
            ×
          </button>

          <h2 style={{ marginBottom: '1rem' }}>{system.hostname}</h2>
          
          <div style={{ marginBottom: '1rem' }}>
            <h3>Stellar Properties</h3>
            <p>Coordinates: RA {formatValue(system.ra, 4)}°, Dec {formatValue(system.dec, 4)}°</p>
            <p>Distance to Earth: {formatDistance(system)}</p>
            <p>Number of Planets: {system.planets.length}</p>
            <p>Radius: {formatError(system.st_rad, system.st_rad_err1, system.st_rad_err2)}{system.st_rad !== null && !isNaN(system.st_rad) ? ' R☉' : ''}</p>
            <p>Mass: {formatError(system.st_mass, system.st_mass_err1, system.st_mass_err2)}{system.st_mass !== null && !isNaN(system.st_mass) ? ' M☉' : ''}</p>
            <p>Age: {formatError(system.st_age, system.st_age_err1, system.st_age_err2)}{system.st_age !== null && !isNaN(system.st_age) ? ' Gyr' : ''}</p>
            <p>Temperature: {formatError(system.st_teff, system.st_teff_err1, system.st_teff_err2)}{system.st_teff !== null && !isNaN(system.st_teff) ? 'K' : ''}</p>
            <p>Rotation Period: {formatError(system.st_rotp, system.st_rotperr1, system.st_rotperr2)}{system.st_rotp !== null && !isNaN(system.st_rotp) ? ' days' : ''}{system.st_rotplim ? ` (${system.st_rotplim})` : ''}</p>
          </div>

          {!compact && (
            <div>
              <h3>Planets ({system.planets.length})</h3>
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
                gap: '1rem',
                marginTop: '1rem'
              }}>
                {system.planets.map(planet => (
                  <div 
                    key={planet.pl_name}
                    style={{
                      backgroundColor: 'rgba(255, 255, 255, 0.1)',
                      padding: '1rem',
                      borderRadius: '4px'
                    }}
                  >
                    <h4>{planet.pl_name}</h4>
                    <p>Radius: {formatValue(planet.pl_rade, 2, ' R⊕')}</p>
                    <p>Mass: {formatValue(planet.pl_masse, 2, ' M⊕')}</p>
                    <p>Density: {formatValue(planet.pl_dens, 2, ' g/cm³')}</p>
                    <p>Orbital Period: {formatValue(planet.pl_orbper, 2, ' days')}</p>
                    <p>Semi-major Axis: {formatValue(planet.pl_orbsmax, 3, ' AU')}</p>
                    <p>Eccentricity: {formatValue(planet.pl_orbeccen, 3)}</p>
                    <p>Discovery Method: {planet.discoverymethod}</p>
                    <p>Discovery Year: {planet.disc_year}</p>
                    <p>Discovery Reference: {parseReferenceLink(planet.disc_refname)}</p>
                    <p>Planetary Parameter Reference: {parseReferenceLink(planet.pl_refname)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
} 