import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { PlanetMetadata } from '../types/PlanetMetadata';

interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  type: 'planet' | 'person' | 'publication' | 'grant' | 'observatory' | 'celestial_body';
  label: string;
  data: any;
}

interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
  type: 'coauthor' | 'funding' | 'observation' | 'reference' | 'system';
}

interface RelationshipGraphProps {
  metadata: PlanetMetadata;
  category: 'discovery' | 'physical_properties' | 'key_people' | 'publications' | 'observational_data' | 'public_engagement' | 'media_gallery' | null;
  onClose: () => void;
}

type DragEvent = d3.D3DragEvent<SVGGElement, GraphNode, GraphNode>;

export function RelationshipGraph({ metadata, category, onClose }: RelationshipGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || !metadata || !category) return;

    // Clear any existing graph
    d3.select(svgRef.current).selectAll("*").remove();

    // Transform metadata into graph data, filtered by category
    const { nodes, links } = transformMetadataToGraph(metadata, category);

    // Set up the simulation
    const width = 800;
    const height = 600;
    const simulation = d3.forceSimulation<GraphNode>(nodes)
      .force("link", d3.forceLink<GraphNode, GraphLink>(links).id(d => d.id).distance(100))
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius(50));

    // Create the SVG
    const svg = d3.select<SVGSVGElement, unknown>(svgRef.current)
      .attr("width", width)
      .attr("height", height)
      .attr("viewBox", [0, 0, width, height]);

    // Add zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on("zoom", (event) => {
        g.attr("transform", event.transform.toString());
      });
    svg.call(zoom);

    const g = svg.append("g");

    // Draw links
    const link = g.append("g")
      .selectAll<SVGLineElement, GraphLink>("line")
      .data(links)
      .join("line")
      .attr("stroke", "#999")
      .attr("stroke-opacity", 0.6)
      .attr("stroke-width", 2);

    // Draw nodes
    const node = g.append("g")
      .selectAll<SVGGElement, GraphNode>("g")
      .data(nodes)
      .join("g")
      .call(d3.drag<SVGGElement, GraphNode>()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended));

    // Add circles to nodes
    node.append("circle")
      .attr("r", d => getNodeRadius(d.type))
      .attr("fill", d => getNodeColor(d.type))
      .attr("stroke", "#fff")
      .attr("stroke-width", 1.5);

    // Add labels to nodes
    node.append("text")
      .text(d => d.label)
      .attr("x", d => getNodeRadius(d.type) + 5)
      .attr("y", "0.31em")
      .attr("fill", "#fff")
      .style("font-size", "12px");

    // Add tooltips
    node.append("title")
      .text(d => `${d.label} (${d.type})`);

    // Update positions on each tick
    simulation.on("tick", () => {
      link
        .attr("x1", d => (d.source as GraphNode).x ?? 0)
        .attr("y1", d => (d.source as GraphNode).y ?? 0)
        .attr("x2", d => (d.target as GraphNode).x ?? 0)
        .attr("y2", d => (d.target as GraphNode).y ?? 0);

      node.attr("transform", d => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });

    // Drag functions
    function dragstarted(event: DragEvent) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      const node = event.subject;
      node.fx = node.x;
      node.fy = node.y;
    }

    function dragged(event: DragEvent) {
      const node = event.subject;
      node.fx = event.x;
      node.fy = event.y;
    }

    function dragended(event: DragEvent) {
      if (!event.active) simulation.alphaTarget(0);
      const node = event.subject;
      node.fx = null;
      node.fy = null;
    }

    // Cleanup
    return () => {
      simulation.stop();
    };
  }, [metadata, category]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
      <div className="bg-gray-900 p-4 rounded-lg shadow-xl">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold text-white">
            {metadata.object_id} - {category?.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')} Graph
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white"
          >
            ✕
          </button>
        </div>
        <svg ref={svgRef} className="bg-gray-800 rounded-lg"></svg>
      </div>
    </div>
  );
}

function transformMetadataToGraph(
  metadata: PlanetMetadata,
  category: 'discovery' | 'physical_properties' | 'key_people' | 'publications' | 'observational_data' | 'public_engagement' | 'media_gallery' | null
): { nodes: GraphNode[], links: GraphLink[] } {
  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];
  const nodeMap = new Map<string, GraphNode>();

  // Add the planet as the central node
  const planetNode: GraphNode = {
    id: metadata.object_id,
    type: 'planet',
    label: metadata.object_id,
    data: metadata
  };
  nodes.push(planetNode);
  nodeMap.set(metadata.object_id, planetNode);

  // Filter and add nodes based on category
  switch (category) {
    case 'discovery':
      // Add discovery-related nodes
      const discoveryNode: GraphNode = {
        id: 'discovery',
        type: 'observatory',
        label: metadata.discovery.telescope,
        data: metadata.discovery
      };
      nodes.push(discoveryNode);
      nodeMap.set('discovery', discoveryNode);
      links.push({
        source: metadata.object_id,
        target: 'discovery',
        type: 'observation'
      });

      // Add discoverer node
      const discovererNode: GraphNode = {
        id: 'discoverer',
        type: 'person',
        label: metadata.discovery.discovered_by,
        data: { role: 'Discoverer' }
      };
      nodes.push(discovererNode);
      nodeMap.set('discoverer', discovererNode);
      links.push({
        source: 'discoverer',
        target: 'discovery',
        type: 'observation'
      });
      break;

    case 'key_people':
      // Add key people nodes and links
      metadata.key_people.forEach(person => {
        const personId = `person_${person.name}`;
        const personNode: GraphNode = {
          id: personId,
          type: 'person',
          label: person.name,
          data: person
        };
        nodes.push(personNode);
        nodeMap.set(personId, personNode);
        links.push({
          source: metadata.object_id,
          target: personId,
          type: 'observation'
        });
      });
      break;

    case 'publications':
      // Add publication nodes and links
      metadata.publications.forEach(pub => {
        const pubId = `pub_${pub.doi}`;
        const pubNode: GraphNode = {
          id: pubId,
          type: 'publication',
          label: pub.title.substring(0, 30) + '...',
          data: pub
        };
        nodes.push(pubNode);
        nodeMap.set(pubId, pubNode);
        links.push({
          source: metadata.object_id,
          target: pubId,
          type: 'reference'
        });

        // Link authors to publication
        pub.authors.forEach(author => {
          const authorId = `person_${author}`;
          if (nodeMap.has(authorId)) {
            links.push({
              source: authorId,
              target: pubId,
              type: 'coauthor'
            });
          }
        });
      });
      break;

    case 'observational_data':
      // Add data source nodes
      metadata.observational_data?.data_sources.forEach(source => {
        const sourceId = `source_${source.name}`;
        const sourceNode: GraphNode = {
          id: sourceId,
          type: 'observatory',
          label: source.name,
          data: source
        };
        nodes.push(sourceNode);
        nodeMap.set(sourceId, sourceNode);
        links.push({
          source: metadata.object_id,
          target: sourceId,
          type: 'observation'
        });
      });

      // Add spectral observation nodes
      metadata.observational_data?.spectral_observations.forEach(obs => {
        const obsId = `obs_${obs.instrument}`;
        const obsNode: GraphNode = {
          id: obsId,
          type: 'observatory',
          label: obs.instrument,
          data: obs
        };
        nodes.push(obsNode);
        nodeMap.set(obsId, obsNode);
        links.push({
          source: metadata.object_id,
          target: obsId,
          type: 'observation'
        });
      });
      break;

    case 'public_engagement':
      // Add citizen science nodes
      metadata.public_engagement?.citizen_science.forEach(project => {
        const projectId = `project_${project.platform}`;
        const projectNode: GraphNode = {
          id: projectId,
          type: 'observatory',
          label: project.platform,
          data: project
        };
        nodes.push(projectNode);
        nodeMap.set(projectId, projectNode);
        links.push({
          source: metadata.object_id,
          target: projectId,
          type: 'observation'
        });
      });

      // Add popular article nodes
      metadata.public_engagement?.popular_articles.forEach(article => {
        const articleId = `article_${article.title}`;
        const articleNode: GraphNode = {
          id: articleId,
          type: 'publication',
          label: article.title.substring(0, 30) + '...',
          data: article
        };
        nodes.push(articleNode);
        nodeMap.set(articleId, articleNode);
        links.push({
          source: metadata.object_id,
          target: articleId,
          type: 'reference'
        });
      });

      // Add community links
      metadata.public_engagement?.community_links.forEach(link => {
        const linkId = `community_${link.platform}`;
        const linkNode: GraphNode = {
          id: linkId,
          type: 'observatory',
          label: `${link.platform} (${link.subreddit})`,
          data: link
        };
        nodes.push(linkNode);
        nodeMap.set(linkId, linkNode);
        links.push({
          source: metadata.object_id,
          target: linkId,
          type: 'observation'
        });
      });
      break;

    case 'media_gallery':
      // Add image nodes
      metadata.media_and_visualizations.images.forEach(image => {
        const imageId = `image_${image.title}`;
        const imageNode: GraphNode = {
          id: imageId,
          type: 'observatory',
          label: image.title.substring(0, 30) + '...',
          data: image
        };
        nodes.push(imageNode);
        nodeMap.set(imageId, imageNode);
        links.push({
          source: metadata.object_id,
          target: imageId,
          type: 'observation'
        });
      });

      // Add video nodes
      metadata.media_and_visualizations.videos.forEach(video => {
        const videoId = `video_${video.title}`;
        const videoNode: GraphNode = {
          id: videoId,
          type: 'observatory',
          label: video.title.substring(0, 30) + '...',
          data: video
        };
        nodes.push(videoNode);
        nodeMap.set(videoId, videoNode);
        links.push({
          source: metadata.object_id,
          target: videoId,
          type: 'observation'
        });
      });

      // Add 3D model nodes
      metadata.media_and_visualizations["3d_models"]?.forEach(model => {
        const modelId = `model_${model.title}`;
        const modelNode: GraphNode = {
          id: modelId,
          type: 'observatory',
          label: model.title.substring(0, 30) + '...',
          data: model
        };
        nodes.push(modelNode);
        nodeMap.set(modelId, modelNode);
        links.push({
          source: metadata.object_id,
          target: modelId,
          type: 'observation'
        });
      });
      break;
  }

  return { nodes, links };
}

function getNodeRadius(type: string): number {
  switch (type) {
    case 'planet': return 20;
    case 'person': return 15;
    case 'publication': return 12;
    case 'grant': return 10;
    case 'celestial_body': return 15;
    default: return 10;
  }
}

function getNodeColor(type: string): string {
  switch (type) {
    case 'planet': return '#60A5FA'; // blue
    case 'person': return '#34D399'; // green
    case 'publication': return '#F87171'; // red
    case 'grant': return '#FBBF24'; // yellow
    case 'celestial_body': return '#A78BFA'; // purple
    default: return '#9CA3AF'; // gray
  }
} 