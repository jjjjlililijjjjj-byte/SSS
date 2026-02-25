import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { Paper } from '@/types';
import { cn } from '@/lib/utils';
import { Info } from 'lucide-react';

interface KnowledgeGraphProps {
  papers: Paper[];
  onNodeClick: (paper: Paper) => void;
}

interface Node extends d3.SimulationNodeDatum {
  id: string;
  paper: Paper;
  radius: number;
  degree: number;
  isCore: boolean;
}

interface Link extends d3.SimulationLinkDatum<Node> {
  source: string | Node;
  target: string | Node;
  weight: number;
}

export function KnowledgeGraph({ papers, onNodeClick }: KnowledgeGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight || 600,
        });
      }
    };

    window.addEventListener('resize', updateDimensions);
    updateDimensions();

    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  useEffect(() => {
    if (!svgRef.current || papers.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove(); // Clear previous render

    const width = dimensions.width;
    const height = dimensions.height;

    // 1. Prepare Data
    const completedPapers = papers.filter(p => p.status === 'completed' && p.analysis);
    
    const nodes: Node[] = completedPapers.map(p => ({
      id: p.id,
      paper: p,
      radius: 20,
      degree: 0,
      isCore: false,
    }));

    const links: Link[] = [];
    
    nodes.forEach(sourceNode => {
      const references = sourceNode.paper.analysis?.references || [];
      
      references.forEach(refTitle => {
        const normRef = refTitle.toLowerCase().replace(/[^\w\s]/g, '');
        
        nodes.forEach(targetNode => {
          if (sourceNode.id === targetNode.id) return;
          
          const targetTitle = (targetNode.paper.analysis?.title || targetNode.paper.fileName).toLowerCase().replace(/[^\w\s]/g, '');
          
          if (normRef.length < 10) return;

          if (targetTitle.includes(normRef) || normRef.includes(targetTitle)) {
             links.push({
               source: sourceNode.id,
               target: targetNode.id,
               weight: Math.floor(Math.random() * 3) + 1, // Mock weight for edge thickness
             });
          }
        });
      });
    });

    // Calculate degree
    const degreeMap = new Map<string, number>();
    links.forEach(link => {
      const sourceId = typeof link.source === 'object' ? (link.source as Node).id : link.source;
      const targetId = typeof link.target === 'object' ? (link.target as Node).id : link.target;
      
      degreeMap.set(String(sourceId), (degreeMap.get(String(sourceId)) || 0) + 1);
      degreeMap.set(String(targetId), (degreeMap.get(String(targetId)) || 0) + 1);
    });

    // Find max degree to determine core nodes
    let maxDegree = 0;
    degreeMap.forEach(degree => {
      if (degree > maxDegree) maxDegree = degree;
    });

    nodes.forEach(node => {
      const degree = degreeMap.get(node.id) || 0;
      node.degree = degree;
      // Base radius + scale by degree, ensure minimum size
      node.radius = Math.max(25, 20 + (degree * 3)); 
      node.isCore = degree > 0 && degree >= maxDegree * 0.6; // Top 40% connected are core
    });

    // 2. Setup Simulation
    const simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id((d: any) => d.id).distance(200))
      .force('charge', d3.forceManyBody().strength(-800)) // Stronger repulsion for spread
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide().radius((d: any) => d.radius + 30));

    // 3. Draw Elements
    const g = svg.append('g');

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });
    
    svg.call(zoom);

    // Arrowhead marker definition
    svg.append('defs').append('marker')
      .attr('id', 'arrowhead')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 0) // Will be adjusted dynamically in tick
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', '#8ab6f4'); // Light blue arrow

    // Links (using path for curves)
    const link = g.append('g')
      .selectAll('path')
      .data(links)
      .join('path')
      .attr('stroke', '#8ab6f4') // Light blue edges
      .attr('stroke-opacity', 0.8)
      .attr('fill', 'none')
      .attr('stroke-width', d => 1.5 + (d.weight * 1.5)) // Variable thickness
      .attr('marker-end', 'url(#arrowhead)');

    // Nodes
    const node = g.append('g')
      .selectAll('g')
      .data(nodes)
      .join('g')
      .call(d3.drag<SVGGElement, Node>()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended)
      )
      .on('click', (event, d) => {
        event.stopPropagation();
        onNodeClick(d.paper);
      });

    // Node Circles
    node.append('circle')
      .attr('r', d => d.radius)
      .attr('fill', '#b5deb5') // Light green fill
      .attr('stroke', d => d.isCore ? '#1e8449' : '#88c588') // Darker green for core
      .attr('stroke-width', d => d.isCore ? 4 : 2)
      .attr('class', 'cursor-pointer transition-all duration-200 hover:brightness-95');

    // Number inside node
    node.append('text')
      .text(d => d.degree > 0 ? d.degree : 1) // Show degree or 1 if isolated
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('font-size', d => Math.max(14, d.radius * 0.8) + 'px')
      .attr('font-family', 'serif') // Match the serif look in the image
      .attr('fill', '#111827')
      .attr('pointer-events', 'none');

    // Authors label outside node
    node.append('text')
      .text(d => {
        const authors = d.paper.analysis?.authors;
        if (authors && authors.length > 0) {
          // Take up to 3 authors, extract last names if possible, or just use the string
          const shortAuthors = authors.slice(0, 3).map(a => {
             const parts = a.split(' ');
             return parts[parts.length - 1].toUpperCase();
          });
          return shortAuthors.join(', ');
        }
        // Fallback to truncated title if no authors
        const title = d.paper.analysis?.title || d.paper.fileName;
        return title.length > 15 ? title.substring(0, 15) + '...' : title;
      })
      .attr('x', 0)
      .attr('y', d => -d.radius - 8) // Position above the node
      .attr('text-anchor', 'middle')
      .attr('font-size', '11px')
      .attr('font-family', 'sans-serif')
      .attr('fill', '#1f2937')
      .attr('pointer-events', 'none')
      .clone(true).lower()
      .attr('stroke', 'white')
      .attr('stroke-width', 3)
      .attr('stroke-opacity', 0.8);

    // Simulation Tick
    simulation.on('tick', () => {
      link.attr('d', (d: any) => {
        const source = d.source as Node;
        const target = d.target as Node;
        
        // Calculate curve
        const dx = target.x! - source.x!;
        const dy = target.y! - source.y!;
        const dr = Math.sqrt(dx * dx + dy * dy) * 1.5; // Curve radius
        
        // Calculate intersection point with target node radius to position arrowhead correctly
        // We need to pull the end of the line back by the target node's radius
        const angle = Math.atan2(dy, dx);
        const targetRadius = target.radius + 6; // +6 for marker size roughly
        
        // If distance is very small, just draw a straight line or nothing
        if (Math.sqrt(dx*dx + dy*dy) < targetRadius) return "";

        // We don't adjust the end point of the curve easily with SVG arcs, 
        // so we adjust the marker-end refX dynamically instead, or use a straight line if we want precise arrow placement.
        // For curved paths (arcs), adjusting the end point is complex.
        // Let's use a simpler quadratic bezier curve where we can control the end point.
        
        // Midpoint
        const mx = (source.x! + target.x!) / 2;
        const my = (source.y! + target.y!) / 2;
        
        // Offset for curve
        const offset = 30;
        const cx = mx - (dy * offset) / Math.sqrt(dx*dx + dy*dy);
        const cy = my + (dx * offset) / Math.sqrt(dx*dx + dy*dy);

        // Calculate exact end point on the edge of the target circle
        // This is an approximation for bezier curves, but works well enough
        const endAngle = Math.atan2(target.y! - cy, target.x! - cx);
        const ex = target.x! - Math.cos(endAngle) * targetRadius;
        const ey = target.y! - Math.sin(endAngle) * targetRadius;

        return `M ${source.x} ${source.y} Q ${cx} ${cy} ${ex} ${ey}`;
      });

      node.attr('transform', d => `translate(${d.x},${d.y})`);
    });

    function dragstarted(event: any, d: Node) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event: any, d: Node) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event: any, d: Node) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }

  }, [papers, dimensions]);

  if (papers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[600px] bg-gray-50 rounded-xl border-2 border-dashed border-gray-200 text-gray-400">
        <Info className="w-10 h-10 mb-2" />
        <p>Upload and analyze papers to generate the graph.</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full h-[600px] bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden relative">
      <div className="absolute top-4 left-4 z-10 bg-white/90 backdrop-blur p-3 rounded-lg shadow-sm border border-gray-100 text-xs text-gray-600 space-y-2">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-[#b5deb5] border-2 border-[#1e8449]"></div>
          <span className="font-medium text-gray-700">Core Node (High Citations)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-[#b5deb5] border-2 border-[#88c588]"></div>
          <span className="font-medium text-gray-700">Regular Node</span>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <div className="w-6 h-1 bg-[#8ab6f4] rounded"></div>
          <span className="font-medium text-gray-700">Citation Link</span>
        </div>
        <div className="mt-2 pt-2 border-t border-gray-100 text-gray-400 italic text-[10px]">
          * Numbers indicate connection degree
        </div>
      </div>
      <svg ref={svgRef} width="100%" height="100%" className="cursor-grab active:cursor-grabbing"></svg>
    </div>
  );
}

