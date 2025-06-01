export interface Exoplanet {
  // Basic identification
  pl_name: string;
  hostname: string;
  discoverymethod: string;
  disc_year: number | null;
  disc_refname: string;
  pl_refname: string;
  
  // Metadata
  isDefault?: boolean; // Whether this is the default entry for this planet
  
  // Orbital parameters
  pl_orbper: number | null; // Orbital period in days
  pl_orbper_err1: number | null;
  pl_orbper_err2: number | null;
  pl_orbsmax: number | null; // Semi-major axis in AU
  pl_orbsmax_err1: number | null;
  pl_orbsmax_err2: number | null;
  pl_orbeccen: number | null; // Orbital eccentricity
  pl_orbeccen_err1: number | null;
  pl_orbeccen_err2: number | null;
  
  // Physical characteristics
  pl_rade: number | null; // Planet radius in Earth radii
  pl_rade_err1: number | null;
  pl_rade_err2: number | null;
  pl_masse: number | null; // Planet mass in Earth masses
  pl_masse_err1: number | null;
  pl_masse_err2: number | null;
  pl_dens: number | null; // Planet density in g/cm³
  pl_dens_err1: number | null;
  pl_dens_err2: number | null;
  
  // Stellar parameters
  st_teff: number; // Stellar effective temperature in K
  st_teff_err1: number | null; // Upper uncertainty
  st_teff_err2: number | null; // Lower uncertainty
  st_rad: number | null; // Stellar radius in solar radii
  st_rad_err1: number | null;
  st_rad_err2: number | null;
  st_mass: number | null; // Stellar mass in solar masses
  st_mass_err1: number | null;
  st_mass_err2: number | null;
  
  // Distance and coordinates
  sy_dist: number; // Distance to system in parsecs
  ra: number; // Right ascension in degrees
  dec: number; // Declination in degrees
  
  // Additional metadata
  rowupdate: string;

  // Stellar rotation
  st_rotp: number | null; // Stellar rotation period in days
  st_rotperr1: number | null; // Upper uncertainty
  st_rotperr2: number | null; // Lower uncertainty
  st_rotplim: string | null; // Limit flag
}

export interface ExoplanetSystem {
  hostname: string;
  ra: number;
  dec: number;
  sy_dist: number;
  planets: Exoplanet[];
  st_teff: number;
  st_teff_err1: number | null;
  st_teff_err2: number | null;
  st_rad: number | null;
  st_rad_err1: number | null;
  st_rad_err2: number | null;
  st_mass: number | null;
  st_mass_err1: number | null;
  st_mass_err2: number | null;
  st_age: number | null;
  st_age_err1: number | null;
  st_age_err2: number | null;
  st_rotp: number | null; // Stellar Rotational Period [days]
  st_rotperr1: number | null; // Upper uncertainty
  st_rotperr2: number | null; // Lower uncertainty
  st_rotplim: string | null; // Limit flag
} 