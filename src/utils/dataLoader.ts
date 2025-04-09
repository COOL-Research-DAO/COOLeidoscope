import { Exoplanet, ExoplanetSystem } from '../types/Exoplanet';

/**
 * Loads and processes exoplanet data from the NASA Exoplanet Archive CSV file.
 * The data is grouped by host star systems for efficient rendering.
 */
export async function loadExoplanetData(): Promise<ExoplanetSystem[]> {
  try {
    const response = await fetch('/exoplanets.csv');
    const csvText = await response.text();
    
    // Find the header row (it starts with "rowid,pl_name,hostname")
    const headerRowIndex = csvText.split('\n').findIndex(line => line.startsWith('rowid,pl_name,hostname'));
    if (headerRowIndex === -1) {
      throw new Error('Could not find header row in CSV file');
    }
    
    const rows = csvText.split('\n').slice(headerRowIndex + 1);
    console.log(`Total rows in CSV: ${rows.length}`);
    
    // Find the column indices for important fields
    const headers = csvText.split('\n')[headerRowIndex].split(',');
    const defaultFlagIndex = headers.findIndex(h => h === 'default_flag');
    const plOrbperIndex = headers.findIndex(h => h === 'pl_orbper');
    const plOrbperErr1Index = headers.findIndex(h => h === 'pl_orbper_err1');
    const plOrbperErr2Index = headers.findIndex(h => h === 'pl_orbper_err2');
    const plOrbsmaxIndex = headers.findIndex(h => h === 'pl_orbsmax');
    const plOrbsmaxErr1Index = headers.findIndex(h => h === 'pl_orbsmax_err1');
    const plOrbsmaxErr2Index = headers.findIndex(h => h === 'pl_orbsmax_err2');
    const plOrbeccenIndex = headers.findIndex(h => h === 'pl_orbeccen');
    const plOrbeccenErr1Index = headers.findIndex(h => h === 'pl_orbeccen_err1');
    const plOrbeccenErr2Index = headers.findIndex(h => h === 'pl_orbeccen_err2');
    const plRadeIndex = headers.findIndex(h => h === 'pl_rade');
    const plRadeErr1Index = headers.findIndex(h => h === 'pl_rade_err1');
    const plRadeErr2Index = headers.findIndex(h => h === 'pl_rade_err2');
    const plMasseIndex = headers.findIndex(h => h === 'pl_masse');
    const plMasseErr1Index = headers.findIndex(h => h === 'pl_masse_err1');
    const plMasseErr2Index = headers.findIndex(h => h === 'pl_masse_err2');
    const plDensIndex = headers.findIndex(h => h === 'pl_dens');
    const plDensErr1Index = headers.findIndex(h => h === 'pl_dens_err1');
    const plDensErr2Index = headers.findIndex(h => h === 'pl_dens_err2');
    const stTeffIndex = headers.findIndex(h => h === 'st_teff');
    const stTeffErr1Index = headers.findIndex(h => h === 'st_teff_err1');
    const stTeffErr2Index = headers.findIndex(h => h === 'st_teff_err2');
    const stRadIndex = headers.findIndex(h => h === 'st_rad');
    const stRadErr1Index = headers.findIndex(h => h === 'st_rad_err1');
    const stRadErr2Index = headers.findIndex(h => h === 'st_rad_err2');
    const stMassIndex = headers.findIndex(h => h === 'st_mass');
    const stMassErr1Index = headers.findIndex(h => h === 'st_mass_err1');
    const stMassErr2Index = headers.findIndex(h => h === 'st_mass_err2');
    const stAgeIndex = headers.findIndex(h => h === 'st_age');
    const stAgeErr1Index = headers.findIndex(h => h === 'st_age_err1');
    const stAgeErr2Index = headers.findIndex(h => h === 'st_age_err2');
    const raIndex = headers.findIndex(h => h === 'ra');
    const decIndex = headers.findIndex(h => h === 'dec');
    const distIndex = headers.findIndex(h => h === 'sy_dist');

    // Debug column indices
    console.log('Column indices:', {
      ra: raIndex,
      dec: decIndex,
      dist: distIndex,
      defaultFlag: defaultFlagIndex,
      temp: stTeffIndex
    });
    
    // Validate that we found all required columns
    if (defaultFlagIndex === -1) {
      throw new Error('Could not find default_flag column in CSV');
    }
    if (stTeffIndex === -1) {
      throw new Error('Could not find required stellar temperature column in CSV');
    }
    if (raIndex === -1 || decIndex === -1 || distIndex === -1) {
      throw new Error('Could not find required coordinate columns in CSV');
    }
    
    // Group planets by their host star
    const systemsMap = new Map<string, ExoplanetSystem>();
    
    // Debug counters
    let skippedNoDefaultFlag = 0;
    let skippedMissingCoords = 0;
    let skippedMissingTemp = 0;
    let validSystems = 0;
    
    // Add the Sun as a reference star
    systemsMap.set('Sun', {
      hostname: 'Sun',
      ra: 0,
      dec: 0,
      sy_dist: 0.0000048,
      planets: [
        {name: 'Mercury', orbper: 87.97, orbsmax: 0.387, orbeccen: 0.206, rade: 0.383, masse: 0.055},
        {name: 'Venus', orbper: 224.7, orbsmax: 0.723, orbeccen: 0.007, rade: 0.949, masse: 0.815},
        {name: 'Earth', orbper: 365.26, orbsmax: 1.0, orbeccen: 0.017, rade: 1.0, masse: 1.0},
        {name: 'Mars', orbper: 686.98, orbsmax: 1.524, orbeccen: 0.093, rade: 0.532, masse: 0.107},
        {name: 'Jupiter', orbper: 4332.59, orbsmax: 5.203, orbeccen: 0.048, rade: 11.209, masse: 317.8},
        {name: 'Saturn', orbper: 10759.22, orbsmax: 9.537, orbeccen: 0.054, rade: 9.449, masse: 95.2},
        {name: 'Uranus', orbper: 30688.5, orbsmax: 19.191, orbeccen: 0.047, rade: 4.007, masse: 14.5},
        {name: 'Neptune', orbper: 60182, orbsmax: 30.069, orbeccen: 0.009, rade: 3.883, masse: 17.1}
      ].map(p => ({
        pl_name: p.name,
        hostname: 'Sun',
        discoverymethod: 'Visual',
        disc_year: -4000,
        disc_refname: 'NA',
        pl_refname: 'NA',
        pl_orbper: p.orbper,
        pl_orbper_err1: null,
        pl_orbper_err2: null,
        pl_orbsmax: p.orbsmax,
        pl_orbsmax_err1: null,
        pl_orbsmax_err2: null,
        pl_orbeccen: p.orbeccen,
        pl_orbeccen_err1: null,
        pl_orbeccen_err2: null,
        pl_rade: p.rade,
        pl_rade_err1: null,
        pl_rade_err2: null,
        pl_masse: p.masse,
        pl_masse_err1: null,
        pl_masse_err2: null,
        pl_dens: p.masse / (p.rade ** 3),
        pl_dens_err1: null,
        pl_dens_err2: null,
        st_teff: 5778,
        st_teff_err1: null,
        st_teff_err2: null,
        st_rad: 1,
        st_rad_err1: null,
        st_rad_err2: null,
        st_mass: 1,
        st_mass_err1: null,
        st_mass_err2: null,
        sy_dist: 0.0000048,
        ra: 0,
        dec: 0,
        rowupdate: ''
      })),
      st_teff: 5778,
      st_teff_err1: null,
      st_teff_err2: null,
      st_rad: 1,
      st_rad_err1: null,
      st_rad_err2: null,
      st_mass: 1,
      st_mass_err1: null,
      st_mass_err2: null,
      st_age: 4.6,
      st_age_err1: null,
      st_age_err2: null
    });
    validSystems++;
    
    // Process rows, only keeping entries with default_flag=1
    rows.forEach(row => {
      if (!row.trim()) return;
      
      const columns = row.split(',');
      const default_flag = parseInt(columns[defaultFlagIndex]);
      const hostname = columns[2];
      
      // Skip any entry that doesn't have default_flag=1
      if (default_flag !== 1) {
        skippedNoDefaultFlag++;
        return;
      }
      
      const planet: Exoplanet = {
        pl_name: columns[1],
        hostname: hostname,
        discoverymethod: columns[13],
        disc_year: parseFloat(columns[14]) || null,
        disc_refname: columns[15] || "",
        pl_refname: columns[33] || "",
        pl_orbper: parseFloat(columns[plOrbperIndex]),
        pl_orbper_err1: columns[plOrbperErr1Index] ? parseFloat(columns[plOrbperErr1Index]) : null,
        pl_orbper_err2: columns[plOrbperErr2Index] ? parseFloat(columns[plOrbperErr2Index]) : null,
        pl_orbsmax: parseFloat(columns[plOrbsmaxIndex]),
        pl_orbsmax_err1: columns[plOrbsmaxErr1Index] ? parseFloat(columns[plOrbsmaxErr1Index]) : null,
        pl_orbsmax_err2: columns[plOrbsmaxErr2Index] ? parseFloat(columns[plOrbsmaxErr2Index]) : null,
        pl_orbeccen: parseFloat(columns[plOrbeccenIndex]),
        pl_orbeccen_err1: columns[plOrbeccenErr1Index] ? parseFloat(columns[plOrbeccenErr1Index]) : null,
        pl_orbeccen_err2: columns[plOrbeccenErr2Index] ? parseFloat(columns[plOrbeccenErr2Index]) : null,
        pl_rade: parseFloat(columns[plRadeIndex]),
        pl_rade_err1: columns[plRadeErr1Index] ? parseFloat(columns[plRadeErr1Index]) : null,
        pl_rade_err2: columns[plRadeErr2Index] ? parseFloat(columns[plRadeErr2Index]) : null,
        pl_masse: parseFloat(columns[plMasseIndex]),
        pl_masse_err1: columns[plMasseErr1Index] ? parseFloat(columns[plMasseErr1Index]) : null,
        pl_masse_err2: columns[plMasseErr2Index] ? parseFloat(columns[plMasseErr2Index]) : null,
        pl_dens: parseFloat(columns[plDensIndex]),
        pl_dens_err1: columns[plDensErr1Index] ? parseFloat(columns[plDensErr1Index]) : null,
        pl_dens_err2: columns[plDensErr2Index] ? parseFloat(columns[plDensErr2Index]) : null,
        st_teff: parseFloat(columns[stTeffIndex]),
        st_teff_err1: columns[stTeffErr1Index] ? parseFloat(columns[stTeffErr1Index]) : null,
        st_teff_err2: columns[stTeffErr2Index] ? parseFloat(columns[stTeffErr2Index]) : null,
        st_rad: columns[stRadIndex] ? parseFloat(columns[stRadIndex]) : null,
        st_rad_err1: columns[stRadErr1Index] ? parseFloat(columns[stRadErr1Index]) : null,
        st_rad_err2: columns[stRadErr2Index] ? parseFloat(columns[stRadErr2Index]) : null,
        st_mass: columns[stMassIndex] ? parseFloat(columns[stMassIndex]) : null,
        st_mass_err1: columns[stMassErr1Index] ? parseFloat(columns[stMassErr1Index]) : null,
        st_mass_err2: columns[stMassErr2Index] ? parseFloat(columns[stMassErr2Index]) : null,
        sy_dist: parseFloat(columns[distIndex]),
        ra: parseFloat(columns[raIndex]),
        dec: parseFloat(columns[decIndex]),
        rowupdate: columns[columns.length - 1]
      };
      
      // Skip entries with missing essential data
      if (isNaN(planet.ra) || isNaN(planet.dec) || isNaN(planet.sy_dist)) {
        //console.log('Missing coordinates for', hostname, ':', {
          //ra: columns[raIndex],
          //dec: columns[decIndex],
          //dist: columns[distIndex]
        //});
        skippedMissingCoords++;
        return;
      }

      // Skip entries with missing temperature
      if (isNaN(planet.st_teff)) {
        skippedMissingTemp++;
        return;
      }
      
      // If we already have this system, just add the planet to it
      if (systemsMap.has(hostname)) {
        const system = systemsMap.get(hostname)!;
        system.planets.push(planet);
      } else {
        // Create new system with this planet
        systemsMap.set(hostname, {
          hostname: hostname,
          ra: planet.ra,
          dec: planet.dec,
          sy_dist: planet.sy_dist,
          planets: [planet],
          st_teff: planet.st_teff,
          st_teff_err1: planet.st_teff_err1,
          st_teff_err2: planet.st_teff_err2,
          st_rad: planet.st_rad,
          st_rad_err1: planet.st_rad_err1,
          st_rad_err2: planet.st_rad_err2,
          st_mass: planet.st_mass,
          st_mass_err1: planet.st_mass_err1,
          st_mass_err2: planet.st_mass_err2,
          st_age: parseFloat(columns[stAgeIndex]) || null,
          st_age_err1: parseFloat(columns[stAgeErr1Index]) || null,
          st_age_err2: parseFloat(columns[stAgeErr2Index]) || null
        });
        validSystems++;
      }
    });
    
    const systems = Array.from(systemsMap.values());
    
    // Calculate temperature range only for displayed stars
    let minTemp = Infinity;
    let maxTemp = -Infinity;
    
    systems.forEach(system => {
      if (!isNaN(system.st_teff)) {
        minTemp = Math.min(minTemp, system.st_teff);
        maxTemp = Math.max(maxTemp, system.st_teff);
      }
    });
    
    // Ensure we have valid temperature range
    if (minTemp === Infinity || maxTemp === -Infinity) {
      minTemp = 2000;
      maxTemp = 12000;
    }
    
    // Log temperature range
    console.log(`Temperature range of displayed stars: ${minTemp}K to ${maxTemp}K`);
    
    // Export the temperature range for the color mapping
    (window as any).starTemperatureRange = { min: minTemp, max: maxTemp };
    
    // Log statistics
    console.log('Data loading statistics:');
    console.log(`Total rows processed: ${rows.length}`);
    console.log(`Skipped (no default flag): ${skippedNoDefaultFlag}`);
    console.log(`Skipped (missing coordinates): ${skippedMissingCoords}`);
    console.log(`Skipped (missing temperature): ${skippedMissingTemp}`);
    console.log(`Valid systems loaded: ${validSystems}`);
    console.log('Unique stars:', systems.map(s => s.hostname).sort());
    console.log('Star count by number of planets:', 
      Object.fromEntries(
        Array.from(
          systems.reduce((acc, sys) => {
            const count = sys.planets.length;
            acc.set(count, (acc.get(count) || 0) + 1);
            return acc;
          }, new Map<number, number>())
        ).sort((a, b) => a[0] - b[0])
      )
    );
    
    return systems;
  } catch (error) {
    console.error('Error loading exoplanet data:', error);
    return [];
  }
}

/**
 * Converts equatorial coordinates (Right Ascension, Declination, Distance) to 3D Cartesian coordinates.
 * 
 * @param ra - Right Ascension in degrees (0-360) from the NASA Exoplanet Archive 'ra' column
 * @param dec - Declination in degrees (-90 to 90)
 * @param distance - Distance in parsecs
 * @returns [x, y, z] coordinates in Three.js space
 * 
 * The conversion follows these steps:
 * 1. Convert RA and Dec to radians
 * 2. Use spherical to Cartesian conversion:
 *    x = distance * cos(dec) * cos(ra)
 *    y = distance * cos(dec) * sin(ra)
 *    z = distance * sin(dec)
 * 
 * This places Earth at the origin (0,0,0) and positions stars in 3D space
 * based on their actual positions in the sky, with:
 * - RA=0° pointing towards the vernal equinox (reference point in the sky)
 * - RA increasing eastward through 360°
 * - Dec=0° at the celestial equator
 * - Dec=+90° at the north celestial pole
 * - Dec=-90° at the south celestial pole
 */
export function equatorialToCartesian(ra: number, dec: number, distance: number): [number, number, number] {
  // Convert to radians
  const raRad = (ra * Math.PI) / 180;
  const decRad = (dec * Math.PI) / 180;
  
  // Convert equatorial coordinates to Cartesian
  const x = distance * Math.cos(decRad) * Math.cos(raRad);
  const y = distance * Math.cos(decRad) * Math.sin(raRad);
  const z = distance * Math.sin(decRad);
  
  return [x, y, z];
} 