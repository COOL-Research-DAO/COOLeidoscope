import React, { useEffect, useState } from 'react';
import { Exoplanet } from '../types/Exoplanet';
import { RelationshipGraph } from './RelationshipGraph';

interface PlanetMetadata {
  object_id: string;
  system: string;
  category: string;
  discovery: {
    discovery_year: number;
    discovered_by: string;
    discovery_method: string;
    telescope: string;
  };
  object_properties: {
    mass_earth: number;
    radius_earth: number;
    orbital_period_days: number;
    semi_major_axis_au: number;
    equilibrium_temperature_K: number;
    orbital_eccentricity: number;
    mean_density_g_cm3: number;
    host_star: string;
    number_in_system: number;
  };
  observational_data?: {
    data_sources: Array<{
      name: string;
      url: string;
    }>;
    spectral_observations: Array<{
      instrument: string;
      data_product: string;
      url: string;
    }>;
  };
  funding_and_institutions?: {
    grants: Array<{
      agency: string;
      program: string;
      award_id: string;
      recipient: string;
    }>;
    philanthropy: Array<{
      organization: string;
      url: string;
    }>;
  };
  media_and_visualizations: {
    images: Array<{
      title: string;
      credit: string;
      url: string;
    }>;
    videos: Array<{
      title: string;
      platform: string;
      url: string;
    }>;
    "3d_models"?: Array<{
      title: string;
      platform: string;
      url: string;
    }>;
  };
  public_engagement?: {
    citizen_science: Array<{
      platform: string;
      url: string;
    }>;
    popular_articles: Array<{
      title: string;
      source: string;
      url: string;
    }>;
    community_links: Array<{
      platform: string;
      subreddit: string;
      url: string;
    }>;
  };
  key_people: Array<{
    name: string;
    role: string;
    institution: string;
    orcid?: string;
  }>;
  publications: Array<{
    title: string;
    authors: string[];
    journal: string;
    year: number;
    doi: string;
  }>;
}

interface PlanetInfoModalProps {
  planet: Exoplanet;
  onClose: () => void;
}

// Add type for expanded category
type ExpandedCategory = 
  | 'discovery'
  | 'physical_properties'
  | 'key_people'
  | 'publications'
  | 'observational_data'
  | 'public_engagement'
  | null;

// Add this type for expanded entries
type ExpandedEntry = {
  [key: string]: boolean;
};

// Add this style block at the top of the file, after imports
const modalStyles = `
  .planet-info-modal-root {
    color: white !important;
  }
  .planet-info-modal-root * {
    color: white !important;
  }
  .planet-info-modal-root a {
    color: #60A5FA !important;
  }
  .planet-info-modal-root a:hover {
    color: #93C5FD !important;
  }
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
  .category-button {
    background-color: rgb(51, 51, 51) !important;
    color: white !important;
    width: 100% !important;
    text-align: left !important;
    padding: 1rem !important;
    border-radius: 0.5rem !important;
    transition: background-color 0.2s !important;
    display: inline-flex !important;
    align-items: center !important;
    min-width: 200px !important;
    border: none !important;
    cursor: pointer !important;
  }
  .category-button:hover {
    background-color: rgb(68, 68, 68) !important;
  }
  .expand-button {
    width: 24px !important;
    height: 24px !important;
    border-radius: 50% !important;
    background-color: #4B5563 !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    margin-left: 8px !important;
    padding: 0 !important;
    border: none !important;
    cursor: pointer !important;
    transition: background-color 0.2s !important;
    vertical-align: middle !important;
    line-height: 1 !important;
  }
  .expand-button:hover {
    background-color: #6B7280 !important;
  }
  .view-graph-button {
    background-color: #2563EB !important;
    color: white !important;
    padding: 0.5rem 1rem !important;
    border-radius: 0.5rem !important;
    transition: background-color 0.2s !important;
    border: none !important;
    cursor: pointer !important;
  }
  .view-graph-button:hover {
    background-color: #1D4ED8 !important;
  }
  @media (prefers-color-scheme: light) {
    .category-button {
      background-color: rgb(51, 51, 51) !important;
    }
    .category-button:hover {
      background-color: rgb(68, 68, 68) !important;
    }
    .expand-button, .view-graph-button {
      background-color: #4B5563 !important;
    }
    .expand-button:hover {
      background-color: #6B7280 !important;
    }
    .view-graph-button {
      background-color: #2563EB !important;
    }
    .view-graph-button:hover {
      background-color: #1D4ED8 !important;
    }
  }
`;

export function PlanetInfoModal({ planet, onClose }: PlanetInfoModalProps) {
  const [metadata, setMetadata] = useState<PlanetMetadata | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedCategory, setExpandedCategory] = useState<ExpandedCategory>(null);
  const [expandedEntries, setExpandedEntries] = useState<ExpandedEntry>({});
  const [showGraph, setShowGraph] = useState<{ show: boolean; category: ExpandedCategory }>({ show: false, category: null });

  // Add style element to inject our CSS
  useEffect(() => {
    const styleElement = document.createElement('style');
    styleElement.textContent = modalStyles;
    document.head.appendChild(styleElement);
    return () => {
      document.head.removeChild(styleElement);
    };
  }, []);

  useEffect(() => {
    const loadMetadata = async () => {
      setIsLoading(true);
      setError(null);
      try {
        // Try to load metadata from the planet's name
        const planetName = planet.pl_name.toLowerCase().replace(/[^a-z0-9-]/g, '');
        console.log('Attempting to load metadata for planet:', {
          originalName: planet.pl_name,
          processedName: planetName,
          url: `/metadata/${planetName}.json`
        });
        
        const response = await fetch(`/metadata/${planetName}.json`);
        console.log('Metadata fetch response:', {
          status: response.status,
          ok: response.ok,
          statusText: response.statusText
        });
        
        if (!response.ok) {
          throw new Error(`Metadata not found: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log('Successfully loaded metadata:', {
          planetName,
          objectId: data.object_id,
          hasData: !!data
        });
        setMetadata(data);
      } catch (err) {
        console.error('Error loading metadata:', {
          planet: planet.pl_name,
          error: err instanceof Error ? err.message : 'Unknown error'
        });
        setError('No detailed metadata available for this planet');
      } finally {
        setIsLoading(false);
      }
    };

    loadMetadata();
  }, [planet]);

  const toggleEntryExpansion = (category: string, entryId: string) => {
    setExpandedEntries(prev => ({
      ...prev,
      [entryId]: !prev[entryId]
    }));
  };

  // Show loading state
  if (isLoading) {
    return (
      <div className="fixed bottom-0 right-0 p-4 z-50 planet-info-modal-root" style={{ backgroundColor: 'transparent' }}>
        <div className="bg-black bg-opacity-90 p-8 rounded-lg shadow-lg w-[600px] max-h-[90vh] overflow-y-auto" style={{ 
          backgroundColor: 'rgba(0, 0, 0, 0.9) !important',
          color: 'white !important'
        }}>
          <div className="flex justify-end mb-2">
            <button
              onClick={onClose}
              className="modal-close-button"
            >
              ✕
            </button>
          </div>
          <div className="mb-4">
            <h2 className="text-2xl font-bold" style={{ color: 'white !important' }}>{planet.pl_name}</h2>
          </div>
          <div className="animate-pulse">
            <div className="h-4 bg-gray-700 rounded w-3/4 mb-4"></div>
            <div className="h-4 bg-gray-700 rounded w-1/2 mb-4"></div>
            <div className="h-4 bg-gray-700 rounded w-2/3 mb-4"></div>
          </div>
        </div>
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className="fixed bottom-0 right-0 p-4 z-50 planet-info-modal-root" style={{ backgroundColor: 'transparent' }}>
        <div className="bg-black bg-opacity-90 p-8 rounded-lg shadow-lg w-[600px] max-h-[90vh] overflow-y-auto" style={{ 
          backgroundColor: 'rgba(0, 0, 0, 0.9) !important',
          color: 'white !important'
        }}>
          <div className="flex justify-end mb-2">
            <button
              onClick={onClose}
              className="modal-close-button"
            >
              ✕
            </button>
          </div>
          <div className="mb-4">
            <h2 className="text-2xl font-bold" style={{ color: 'white !important' }}>{planet.pl_name}</h2>
          </div>
          <div className="text-center py-8">
            <p className="text-gray-400" style={{ color: '#9CA3AF !important' }}>{error}</p>
          </div>
        </div>
      </div>
    );
  }

  // Show full metadata if available
  if (metadata) {
    return (
      <>
        <div className="fixed bottom-0 right-0 p-4 z-50 planet-info-modal-root" style={{ backgroundColor: 'transparent' }}>
          <div className="bg-black bg-opacity-90 p-8 rounded-lg shadow-lg w-[600px] max-h-[90vh] overflow-y-auto" style={{ 
            backgroundColor: 'rgba(0, 0, 0, 0.9) !important',
            color: 'white !important'
          }}>
            <div className="flex justify-end mb-2">
              <button
                onClick={onClose}
                className="modal-close-button"
              >
                ✕
              </button>
            </div>
            <div className="mb-6" style={{color:'white'}}>
              <div>
                <h2 className="text-2xl font-bold" style={{ color: 'white !important' }}>{metadata.object_id}</h2>
                <p className="text-gray-400" style={{ color: '#9CA3AF !important' }}>{metadata.system} System • {metadata.category}</p>
              </div>
            </div>

            <div className="space-y-2" style={{ color: 'white !important' }}>
              {/* Discovery Information */}
              <div>
                <button 
                  className="category-button"
                  onClick={() => setExpandedCategory(expandedCategory === 'discovery' ? null : 'discovery')}
                >
                  <span className="font-semibold text-lg flex-1" style={{ color: 'white !important' }}>Discovery</span>
                  <span className="text-xl ml-2" style={{ 
                    color: 'white !important',
                    transform: expandedCategory === 'discovery' ? 'rotate(90deg)' : 'none',
                    transition: 'transform 0.2s'
                  }}>›</span>
                </button>
                {expandedCategory === 'discovery' && (
                  <div className="mt-2 p-4 bg-gray-800 rounded-lg" style={{ color: 'white !important' }}>
                    <div className="bg-gray-700 p-3 rounded mb-2">
                      <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                        <p className="text-white font-bold" style={{ color: 'white !important', margin: 0 }}>Year: {metadata.discovery.discovery_year}</p>
                        <button
                          onClick={() => toggleEntryExpansion('discovery', 'discovery')}
                          className="expand-button"
                          style={{ color: '#60A5FA !important' }}
                        >
                          {expandedEntries['discovery'] ? '▲' : '▼'}
                        </button>
                      </div>
                      {expandedEntries['discovery'] && (
                        <>
                          <p className="text-white mt-2" style={{ color: 'white !important' }}>Discovered by: {metadata.discovery.discovered_by}</p>
                          <p className="text-white mt-2" style={{ color: 'white !important' }}>Method: {metadata.discovery.discovery_method}</p>
                          <p className="text-white mt-2" style={{ color: 'white !important' }}>Telescope: {metadata.discovery.telescope}</p>
                        </>
                      )}
                    </div>
                    <div className="flex justify-center mt-4">
                      <button 
                        className="view-graph-button"
                        onClick={() => setShowGraph({ show: true, category: 'discovery' })}
                      >
                        <span style={{ color: 'white !important' }}>View Graph</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Physical Properties */}
              <div>
                <button 
                  className="category-button"
                  onClick={() => setExpandedCategory(expandedCategory === 'physical_properties' ? null : 'physical_properties')}
                >
                  <span className="font-semibold text-lg flex-1" style={{ color: 'white !important' }}>Physical Properties</span>
                  <span className="text-xl ml-2" style={{ 
                    color: 'white !important',
                    transform: expandedCategory === 'physical_properties' ? 'rotate(90deg)' : 'none',
                    transition: 'transform 0.2s'
                  }}>›</span>
                </button>
                {expandedCategory === 'physical_properties' && (
                  <div className="mt-2 p-4 bg-gray-800 rounded-lg" style={{ color: 'white !important' }}>
                    <div className="bg-gray-700 p-3 rounded mb-2">
                      <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                        <p className="text-white font-bold" style={{ color: 'white !important', margin: 0 }}>Mass: {metadata.object_properties.mass_earth.toFixed(2)} Earth masses</p>
                        <button
                          onClick={() => toggleEntryExpansion('physical_properties', 'physical_properties')}
                          className="expand-button"
                          style={{ color: '#60A5FA !important' }}
                        >
                          {expandedEntries['physical_properties'] ? '▲' : '▼'}
                        </button>
                      </div>
                      {expandedEntries['physical_properties'] && (
                        <>
                          <p className="text-white mt-2" style={{ color: 'white !important' }}>Radius: {metadata.object_properties.radius_earth.toFixed(2)} Earth radii</p>
                          <p className="text-white mt-2" style={{ color: 'white !important' }}>Orbital Period: {metadata.object_properties.orbital_period_days.toFixed(2)} days</p>
                          <p className="text-white mt-2" style={{ color: 'white !important' }}>Semi-major Axis: {metadata.object_properties.semi_major_axis_au.toFixed(4)} AU</p>
                          <p className="text-white mt-2" style={{ color: 'white !important' }}>Equilibrium Temperature: {metadata.object_properties.equilibrium_temperature_K.toFixed(0)} K</p>
                          <p className="text-white mt-2" style={{ color: 'white !important' }}>Orbital Eccentricity: {metadata.object_properties.orbital_eccentricity.toFixed(4)}</p>
                          <p className="text-white mt-2" style={{ color: 'white !important' }}>Mean Density: {metadata.object_properties.mean_density_g_cm3.toFixed(2)} g/cm³</p>
                          <p className="text-white mt-2" style={{ color: 'white !important' }}>Host Star: {metadata.object_properties.host_star}</p>
                          <p className="text-white mt-2" style={{ color: 'white !important' }}>Number in System: {metadata.object_properties.number_in_system}</p>
                        </>
                      )}
                    </div>
                    <div className="flex justify-center mt-4">
                      <button 
                        className="view-graph-button"
                        onClick={() => setShowGraph({ show: true, category: 'physical_properties' })}
                      >
                        <span style={{ color: 'white !important' }}>View Graph</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Key People */}
              {metadata.key_people && metadata.key_people.length > 0 && (
                <div>
                  <button 
                    className="category-button"
                    onClick={() => setExpandedCategory(expandedCategory === 'key_people' ? null : 'key_people')}
                  >
                    <span className="font-semibold text-lg flex-1" style={{ color: 'white !important' }}>Key People</span>
                    <span className="text-xl ml-2" style={{ 
                      color: 'white !important',
                      transform: expandedCategory === 'key_people' ? 'rotate(90deg)' : 'none',
                      transition: 'transform 0.2s'
                    }}>›</span>
                  </button>
                  {expandedCategory === 'key_people' && (
                    <div className="mt-2 p-4 bg-gray-800 rounded-lg" style={{ color: 'white !important' }}>
                      <div className="grid grid-cols-1 gap-4" style={{ color: 'white !important' }}>
                        {metadata.key_people.map((person, index) => (
                          <div key={index} className="bg-gray-700 p-3 rounded">
                            <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                              <p className="font-bold text-white" style={{ color: 'white !important', margin: 0 }}>{person.name}</p>
                              <button
                                onClick={() => toggleEntryExpansion('key_people', `person_${index}`)}
                                className="expand-button"
                                style={{ color: '#60A5FA !important' }}
                              >
                                {expandedEntries[`person_${index}`] ? '▲' : '▼'}
                              </button>
                            </div>
                            {expandedEntries[`person_${index}`] && (
                              <>
                                <p className="text-white mt-2" style={{ color: 'white !important' }}>{person.role}</p>
                                <p className="text-white mt-2" style={{ color: 'white !important' }}>{person.institution}</p>
                                {person.orcid && (
                                  <a 
                                    href={`https://orcid.org/${person.orcid}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-400 hover:text-blue-300 mt-2 block"
                                    style={{ color: '#60A5FA !important' }}
                                  >
                                    ORCID Profile
                                  </a>
                                )}
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                      <div className="flex justify-center mt-4">
                        <button 
                          className="view-graph-button"
                          onClick={() => setShowGraph({ show: true, category: 'key_people' })}
                        >
                          <span style={{ color: 'white !important' }}>View Graph</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Publications */}
              {metadata.publications && metadata.publications.length > 0 && (
                <div>
                  <button 
                    className="category-button"
                    onClick={() => setExpandedCategory(expandedCategory === 'publications' ? null : 'publications')}
                  >
                    <span className="font-semibold text-lg flex-1" style={{ color: 'white !important' }}>Publications</span>
                    <span className="text-xl ml-2" style={{ 
                      color: 'white !important',
                      transform: expandedCategory === 'publications' ? 'rotate(90deg)' : 'none',
                      transition: 'transform 0.2s'
                    }}>›</span>
                  </button>
                  {expandedCategory === 'publications' && (
                    <div className="mt-2 p-4 bg-gray-800 rounded-lg space-y-4" style={{ color: 'white !important' }}>
                      {metadata.publications.map((pub, index) => (
                        <div key={index} className="bg-gray-700 p-3 rounded">
                          <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                            <a 
                              href={`https://doi.org/${pub.doi}`}
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-lg font-bold hover:text-blue-300"
                              style={{ color: '#60A5FA !important', margin: 0 }}
                            >
                              {pub.title}
                            </a>
                            <button
                              onClick={() => toggleEntryExpansion('publications', `pub_${index}`)}
                              className="expand-button"
                              style={{ color: '#60A5FA !important' }}
                            >
                              {expandedEntries[`pub_${index}`] ? '▲' : '▼'}
                            </button>
                          </div>
                          {expandedEntries[`pub_${index}`] && (
                            <>
                              <p className="mt-1 text-white" style={{ color: 'white !important' }}>{pub.authors.join(', ')} ({pub.year})</p>
                              <p className="text-sm text-white" style={{ color: 'white !important' }}>{pub.journal}</p>
                            </>
                          )}
                        </div>
                      ))}
                      <div className="flex justify-center mt-4">
                        <button 
                          className="view-graph-button"
                          onClick={() => setShowGraph({ show: true, category: 'publications' })}
                        >
                          <span style={{ color: 'white !important' }}>View Graph</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Observational Data */}
              {metadata.observational_data && (
                <div>
                  <button 
                    className="category-button"
                    onClick={() => setExpandedCategory(expandedCategory === 'observational_data' ? null : 'observational_data')}
                  >
                    <span className="font-semibold text-lg flex-1" style={{ color: 'white !important' }}>Observational Data</span>
                    <span className="text-xl ml-2" style={{ 
                      color: 'white !important',
                      transform: expandedCategory === 'observational_data' ? 'rotate(90deg)' : 'none',
                      transition: 'transform 0.2s'
                    }}>›</span>
                  </button>
                  {expandedCategory === 'observational_data' && (
                    <div className="mt-2 p-4 bg-gray-800 rounded-lg space-y-4" style={{ color: 'white !important' }}>
                      <div className="bg-gray-700 p-3 rounded mb-2">
                        <p className="text-white font-bold" style={{ color: 'white !important' }}>Data Sources</p>
                        {!expandedEntries['observational_data'] && (
                          <button
                            onClick={() => toggleEntryExpansion('observational_data', 'observational_data')}
                            className="text-blue-400 hover:text-blue-300 mt-2"
                            style={{ color: '#60A5FA !important' }}
                          >
                            Show More
                          </button>
                        )}
                        {expandedEntries['observational_data'] && (
                          <div style={{ color: 'white !important' }}>
                            <ul className="list-disc pl-5 space-y-2" style={{ color: 'white !important' }}>
                              {metadata.observational_data.data_sources.map((source, index) => (
                                <li key={index} className="text-white" style={{ color: 'white !important' }}>
                                  <a 
                                    href={source.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{ color: '#60A5FA !important' }}
                                  >
                                    {source.name}
                                  </a>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                      {metadata.observational_data.spectral_observations && (
                        <div style={{ color: 'white !important' }}>
                          <h4 className="font-medium mb-2 text-white" style={{ color: 'white !important' }}>Spectral Observations</h4>
                          <ul className="list-disc pl-5 space-y-2" style={{ color: 'white !important' }}>
                            {metadata.observational_data.spectral_observations.map((obs, index) => (
                              <li key={index} className="text-white" style={{ color: 'white !important' }}>
                                <span className="text-white" style={{ color: 'white !important' }}>{obs.instrument}: </span>
                                <a 
                                  href={obs.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{ color: '#60A5FA !important' }}
                                >
                                  {obs.data_product}
                                </a>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Public Engagement */}
              {metadata.public_engagement && (
                <div>
                  <button 
                    className="category-button"
                    onClick={() => setExpandedCategory(expandedCategory === 'public_engagement' ? null : 'public_engagement')}
                  >
                    <span className="font-semibold text-lg flex-1" style={{ color: 'white !important' }}>Public Engagement</span>
                    <span className="text-xl ml-2" style={{ 
                      color: 'white !important',
                      transform: expandedCategory === 'public_engagement' ? 'rotate(90deg)' : 'none',
                      transition: 'transform 0.2s'
                    }}>›</span>
                  </button>
                  {expandedCategory === 'public_engagement' && (
                    <div className="mt-2 p-4 bg-gray-800 rounded-lg space-y-4" style={{ color: 'white !important' }}>
                      <div className="bg-gray-700 p-3 rounded mb-2">
                        <p className="text-white font-bold" style={{ color: 'white !important' }}>Citizen Science</p>
                        {!expandedEntries['public_engagement'] && (
                          <button
                            onClick={() => toggleEntryExpansion('public_engagement', 'public_engagement')}
                            className="text-blue-400 hover:text-blue-300 mt-2"
                            style={{ color: '#60A5FA !important' }}
                          >
                            Show More
                          </button>
                        )}
                        {expandedEntries['public_engagement'] && (
                          <div style={{ color: 'white !important' }}>
                            <ul className="list-disc pl-5 space-y-2" style={{ color: 'white !important' }}>
                              {metadata.public_engagement.citizen_science.map((project, index) => (
                                <li key={index} className="text-white" style={{ color: 'white !important' }}>
                                  <a 
                                    href={project.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{ color: '#60A5FA !important' }}
                                  >
                                    {project.platform}
                                  </a>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                      {metadata.public_engagement.popular_articles && (
                        <div style={{ color: 'white !important' }}>
                          <h4 className="font-medium mb-2 text-white" style={{ color: 'white !important' }}>Popular Articles</h4>
                          <ul className="list-disc pl-5 space-y-2" style={{ color: 'white !important' }}>
                            {metadata.public_engagement.popular_articles.map((article, index) => (
                              <li key={index} className="text-white" style={{ color: 'white !important' }}>
                                <a 
                                  href={article.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{ color: '#60A5FA !important' }}
                                >
                                  {article.title} ({article.source})
                                </a>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        {showGraph.show && metadata && (
          <div className="planet-info-modal-root">
            <RelationshipGraph
              metadata={metadata}
              category={showGraph.category}
              onClose={() => setShowGraph({ show: false, category: null })}
            />
          </div>
        )}
      </>
    );
  }

  return null;
} 