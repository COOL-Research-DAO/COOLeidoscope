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
  | 'media_gallery'
  | null;

export function PlanetInfoModal({ planet, onClose }: PlanetInfoModalProps) {
  const [metadata, setMetadata] = useState<PlanetMetadata | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedCategory, setExpandedCategory] = useState<ExpandedCategory>(null);
  const [showGraph, setShowGraph] = useState<{ show: boolean; category: ExpandedCategory }>({ show: false, category: null });

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

  // Show loading state
  if (isLoading) {
    return (
      <div className="fixed bottom-0 right-0 p-4 z-50" style={{ backgroundColor: 'transparent' }}>
        <div className="bg-black bg-opacity-90 p-8 rounded-lg shadow-lg w-[600px] max-h-[90vh] overflow-y-auto" style={{ 
          backgroundColor: 'rgba(0, 0, 0, 0.9) !important',
          color: 'white !important'
        }}>
          <div className="flex justify-end mb-2">
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white"
              style={{ color: '#9CA3AF !important' }}
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
      <div className="fixed bottom-0 right-0 p-4 z-50" style={{ backgroundColor: 'transparent' }}>
        <div className="bg-black bg-opacity-90 p-8 rounded-lg shadow-lg w-[600px] max-h-[90vh] overflow-y-auto" style={{ 
          backgroundColor: 'rgba(0, 0, 0, 0.9) !important',
          color: 'white !important'
        }}>
          <div className="flex justify-end mb-2">
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white"
              style={{ color: '#9CA3AF !important' }}
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
        <div className="fixed bottom-0 right-0 p-4 z-50" style={{ backgroundColor: 'transparent' }}>
          <div className="bg-black bg-opacity-90 p-8 rounded-lg shadow-lg w-[600px] max-h-[90vh] overflow-y-auto" style={{ 
            backgroundColor: 'rgba(0, 0, 0, 0.9) !important',
            color: 'white !important'
          }}>
            <div className="flex justify-end mb-2">
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-white"
                style={{ color: '#9CA3AF !important' }}
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
                  className="w-full text-left p-4 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors inline-flex items-center"
                  style={{ minWidth: '200px', width: '100%' }}
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
                    <div className="flex justify-end mb-4">
                      <button 
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                        onClick={() => setShowGraph({ show: true, category: 'discovery' })}
                      >
                        <span style={{ color: 'white !important' }}>View Graph</span>
                      </button>
                    </div>
                    <p style={{ color: 'white !important' }}>Year: {metadata.discovery.discovery_year}</p>
                    <p style={{ color: 'white !important' }}>Discovered by: {metadata.discovery.discovered_by}</p>
                    <p style={{ color: 'white !important' }}>Method: {metadata.discovery.discovery_method}</p>
                    <p style={{ color: 'white !important' }}>Telescope: {metadata.discovery.telescope}</p>
                  </div>
                )}
              </div>

              {/* Physical Properties */}
              <div>
                <button 
                  className="w-full text-left p-4 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors inline-flex items-center"
                  style={{ minWidth: '200px', width: '100%' }}
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
                    <div className="flex justify-end mb-4">
                      <button 
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                        onClick={() => setShowGraph({ show: true, category: 'physical_properties' })}
                      >
                        <span style={{ color: 'white !important' }}>View Graph</span>
                      </button>
                    </div>
                    <p style={{ color: 'white !important' }}>Mass: {metadata.object_properties.mass_earth.toFixed(2)} Earth masses</p>
                    <p style={{ color: 'white !important' }}>Radius: {metadata.object_properties.radius_earth.toFixed(2)} Earth radii</p>
                    <p style={{ color: 'white !important' }}>Orbital Period: {metadata.object_properties.orbital_period_days.toFixed(2)} days</p>
                    <p style={{ color: 'white !important' }}>Semi-major Axis: {metadata.object_properties.semi_major_axis_au.toFixed(4)} AU</p>
                    <p style={{ color: 'white !important' }}>Equilibrium Temperature: {metadata.object_properties.equilibrium_temperature_K.toFixed(0)} K</p>
                    <p style={{ color: 'white !important' }}>Orbital Eccentricity: {metadata.object_properties.orbital_eccentricity.toFixed(4)}</p>
                    <p style={{ color: 'white !important' }}>Mean Density: {metadata.object_properties.mean_density_g_cm3.toFixed(2)} g/cm³</p>
                    <p style={{ color: 'white !important' }}>Host Star: {metadata.object_properties.host_star}</p>
                    <p style={{ color: 'white !important' }}>Number in System: {metadata.object_properties.number_in_system}</p>
                  </div>
                )}
              </div>

              {/* Key People */}
              {metadata.key_people && metadata.key_people.length > 0 && (
                <div>
                  <button 
                    className="w-full text-left p-4 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors inline-flex items-center"
                    style={{ minWidth: '200px', width: '100%' }}
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
                      <div className="flex justify-end mb-4">
                        <button 
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                          onClick={() => setShowGraph({ show: true, category: 'key_people' })}
                        >
                          <span style={{ color: 'white !important' }}>View Graph</span>
                        </button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {metadata.key_people.map((person, index) => (
                          <div key={index} className="bg-gray-700 p-3 rounded">
                            <p className="font-medium" style={{ color: 'white !important' }}>{person.name}</p>
                            <p style={{ color: 'white !important' }}>{person.role}</p>
                            <p style={{ color: 'white !important' }}>{person.institution}</p>
                            {person.orcid && (
                              <a 
                                href={`https://orcid.org/${person.orcid}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-400 hover:text-blue-300"
                                style={{ color: '#60A5FA !important' }}
                              >
                                ORCID Profile
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Key Publications */}
              {metadata.publications && metadata.publications.length > 0 && (
                <div>
                  <button 
                    className="w-full text-left p-4 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors inline-flex items-center"
                    style={{ minWidth: '200px', width: '100%' }}
                    onClick={() => setExpandedCategory(expandedCategory === 'publications' ? null : 'publications')}
                  >
                    <span className="font-semibold text-lg flex-1" style={{ color: 'white !important' }}>Key Publications</span>
                    <span className="text-xl ml-2" style={{ 
                      color: 'white !important',
                      transform: expandedCategory === 'publications' ? 'rotate(90deg)' : 'none',
                      transition: 'transform 0.2s'
                    }}>›</span>
                  </button>
                  {expandedCategory === 'publications' && (
                    <div className="mt-2 p-4 bg-gray-800 rounded-lg space-y-4" style={{ color: 'white !important' }}>
                      <div className="flex justify-end mb-4">
                        <button 
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                          onClick={() => setShowGraph({ show: true, category: 'publications' })}
                        >
                          <span style={{ color: 'white !important' }}>View Graph</span>
                        </button>
                      </div>
                      {metadata.publications.map((pub, index) => (
                        <div key={index} className="bg-gray-700 p-3 rounded">
                          <a 
                            href={`https://doi.org/${pub.doi}`}
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-lg font-medium hover:text-blue-300"
                            style={{ color: '#60A5FA !important' }}
                          >
                            {pub.title}
                          </a>
                          <p style={{ color: 'white !important' }} className="mt-1">{pub.authors.join(', ')} ({pub.year})</p>
                          <p style={{ color: 'white !important' }} className="text-sm">{pub.journal}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Observational Data */}
              {metadata.observational_data && (
                <div>
                  <button 
                    className="w-full text-left p-4 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors inline-flex items-center"
                    style={{ minWidth: '200px', width: '100%' }}
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
                      <div className="flex justify-end mb-4">
                        <button 
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                          onClick={() => setShowGraph({ show: true, category: 'observational_data' })}
                        >
                          <span style={{ color: 'white !important' }}>View Graph</span>
                        </button>
                      </div>
                      <div>
                        <h4 className="font-medium mb-2" style={{ color: 'white !important' }}>Data Sources</h4>
                        <ul className="list-disc pl-5 space-y-2">
                          {metadata.observational_data.data_sources.map((source, index) => (
                            <li key={index}>
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
                      {metadata.observational_data.spectral_observations && (
                        <div>
                          <h4 className="font-medium mb-2" style={{ color: 'white !important' }}>Spectral Observations</h4>
                          <ul className="list-disc pl-5 space-y-2">
                            {metadata.observational_data.spectral_observations.map((obs, index) => (
                              <li key={index}>
                                <span style={{ color: 'white !important' }}>{obs.instrument}: </span>
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
                    className="w-full text-left p-4 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors inline-flex items-center"
                    style={{ minWidth: '200px', width: '100%' }}
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
                      <div className="flex justify-end mb-4">
                        <button 
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                          onClick={() => setShowGraph({ show: true, category: 'public_engagement' })}
                        >
                          <span style={{ color: 'white !important' }}>View Graph</span>
                        </button>
                      </div>
                      {metadata.public_engagement.citizen_science && (
                        <div>
                          <h4 className="font-medium mb-2" style={{ color: 'white !important' }}>Citizen Science</h4>
                          <ul className="list-disc pl-5 space-y-2">
                            {metadata.public_engagement.citizen_science.map((project, index) => (
                              <li key={index}>
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
                      {metadata.public_engagement.popular_articles && (
                        <div>
                          <h4 className="font-medium mb-2" style={{ color: 'white !important' }}>Popular Articles</h4>
                          <ul className="list-disc pl-5 space-y-2">
                            {metadata.public_engagement.popular_articles.map((article, index) => (
                              <li key={index}>
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

              {/* Media Gallery */}
              {metadata.media_and_visualizations && (
                <div>
                  <button 
                    className="w-full text-left p-4 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors inline-flex items-center"
                    style={{ minWidth: '200px', width: '100%' }}
                    onClick={() => setExpandedCategory(expandedCategory === 'media_gallery' ? null : 'media_gallery')}
                  >
                    <span className="font-semibold text-lg flex-1" style={{ color: 'white !important' }}>Media Gallery</span>
                    <span className="text-xl ml-2" style={{ 
                      color: 'white !important',
                      transform: expandedCategory === 'media_gallery' ? 'rotate(90deg)' : 'none',
                      transition: 'transform 0.2s'
                    }}>›</span>
                  </button>
                  {expandedCategory === 'media_gallery' && (
                    <div className="mt-2 p-4 bg-gray-800 rounded-lg" style={{ color: 'white !important' }}>
                      <div className="flex justify-end mb-4">
                        <button 
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                          onClick={() => setShowGraph({ show: true, category: 'media_gallery' })}
                        >
                          <span style={{ color: 'white !important' }}>View Graph</span>
                        </button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {metadata.media_and_visualizations.images.map((item, index) => (
                          <div key={`img-${index}`} className="relative">
                            <img 
                              src={item.url} 
                              alt={item.title}
                              className="w-full h-48 object-cover rounded"
                            />
                            <p style={{ color: 'white !important' }} className="text-sm mt-1">{item.title}</p>
                            <p style={{ color: 'white !important' }} className="text-xs">Credit: {item.credit}</p>
                          </div>
                        ))}
                        {metadata.media_and_visualizations.videos.map((item, index) => (
                          <div key={`vid-${index}`} className="relative">
                            <a 
                              href={item.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block w-full h-48 bg-gray-700 rounded flex items-center justify-center hover:bg-gray-600 transition-colors"
                              style={{ color: '#60A5FA !important' }}
                            >
                              <span>▶ Watch on {item.platform}</span>
                            </a>
                            <p style={{ color: 'white !important' }} className="text-sm mt-1">{item.title}</p>
                          </div>
                        ))}
                        {metadata.media_and_visualizations["3d_models"]?.map((item, index) => (
                          <div key={`3d-${index}`} className="relative">
                            <a 
                              href={item.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block w-full h-48 bg-gray-700 rounded flex items-center justify-center hover:bg-gray-600 transition-colors"
                              style={{ color: '#60A5FA !important' }}
                            >
                              <span>🌐 View on {item.platform}</span>
                            </a>
                            <p style={{ color: 'white !important' }} className="text-sm mt-1">{item.title}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        {showGraph.show && metadata && (
          <RelationshipGraph
            metadata={metadata}
            category={showGraph.category}
            onClose={() => setShowGraph({ show: false, category: null })}
          />
        )}
      </>
    );
  }

  return null;
} 