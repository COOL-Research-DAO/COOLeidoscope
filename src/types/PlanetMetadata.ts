export interface Publication {
  title: string;
  authors: string[];
  journal: string;
  year: number;
  doi: string;
  url?: string; // Optional URL field
}

export interface MediaItem {
  url: string;
  caption: string;
  type: 'image' | 'video';
}

export interface PlanetMetadata {
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
  linked_objects?: {
    type: string;
    id: string;
  }[];
  observational_data?: {
    data_sources: {
    name: string;
      url: string;
    }[];
    spectral_observations: {
      instrument: string;
      data_product: string;
      url: string;
    }[];
  };
  funding_and_institutions?: {
    grants: {
      agency: string;
      program: string;
      award_id: string;
      recipient: string;
    }[];
    philanthropy: {
      organization: string;
      url: string;
    }[];
  };
  media_and_visualizations: {
    images: {
      title: string;
      credit: string;
      url: string;
    }[];
    videos: {
      title: string;
      platform: string;
      url: string;
    }[];
    "3d_models"?: {
      title: string;
      platform: string;
      url: string;
    }[];
  };
  public_engagement?: {
    citizen_science: {
      platform: string;
      url: string;
    }[];
    popular_articles: {
      title: string;
      source: string;
      url: string;
    }[];
    community_links: {
      platform: string;
      subreddit: string;
      url: string;
    }[];
  };
  key_people: {
    name: string;
    role: string;
    institution: string;
    orcid?: string;
  }[];
  publications: {
    title: string;
    authors: string[];
    journal: string;
    year: number;
    doi: string;
  }[];
} 