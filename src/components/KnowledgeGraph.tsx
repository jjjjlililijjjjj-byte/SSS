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
  color: string;
}

interface Link extends d3.SimulationLinkDatum<Node> {
  source: string | Node;
  target: string | Node;
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
    // Filter only completed papers
    const completedPapers = papers.filter(p => p.status === 'completed' && p.analysis);
    
    // Create nodes
    const nodes: Node[] = completedPapers.map(p => ({
      id: p.id,
      paper: p,
      radius: 20, // Base radius
      color: '#3b82f6', // Blue-500
    }));

    // Create links based on reference matching
    // Simple fuzzy matching: check if reference title is contained in another paper's title (or vice versa)
    // Or check similarity. For MVP, simple inclusion.
    const links: Link[] = [];
    
    nodes.forEach(sourceNode => {
      const references = sourceNode.paper.analysis?.references || [];
      
      references.forEach(refTitle => {
        // Normalize reference title
        const normRef = refTitle.toLowerCase().replace(/[^\w\s]/g, '');
        
        nodes.forEach(targetNode => {
          if (sourceNode.id === targetNode.id) return;
          
          const targetTitle = (targetNode.paper.analysis?.title || targetNode.paper.fileName).toLowerCase().replace(/[^\w\s]/g, '');
          
          // Check for match
          // If the reference title is very short, skip to avoid false positives
          if (normRef.length < 10) return;

          // Check if target title contains the reference title or vice versa
          // Using a threshold for similarity would be better but simple inclusion is a start
          if (targetTitle.includes(normRef) || normRef.includes(targetTitle)) {
             links.push({
               source: sourceNode.id,
               target: targetNode.id,
             });
          }
        });
      });
    });

    // Calculate node size based on degree (number of connections)
    const degreeMap = new Map<string, number>();
    links.forEach(link => {
      const sourceId = typeof link.source === 'object' ? (link.source as Node).id : link.source;
      const targetId = typeof link.target === 'object' ? (link.target as Node).id : link.target;
      
      degreeMap.set(String(sourceId), (degreeMap.get(String(sourceId)) || 0) + 1);
      degreeMap.set(String(targetId), (degreeMap.get(String(targetId)) || 0) + 1);
    });

    nodes.forEach(node => {
      const degree = degreeMap.get(node.id) || 0;
      node.radius = 20 + (degree * 2); // Increase size with connections
      // Color based on role: High degree -> Core (Orange), Low -> Follow-up (Blue)
      node.color = degree > 2 ? '#f97316' : '#3b82f6'; 
    });

    // 2. Setup Simulation
    const simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id((d: any) => d.id).distance(150))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide().radius((d: any) => d.radius + 10));

    // 3. Draw Elements
    const g = svg.append('g');

    // Zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });
    
    svg.call(zoom);

    // Links
    const link = g.append('g')
      .attr('stroke', '#999')
      .attr('stroke-opacity', 0.6)
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke-width', 1.5)
      .attr('marker-end', 'url(#arrowhead)');

    // Arrowhead marker
    svg.append('defs').append('marker')
      .attr('id', 'arrowhead')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 25) // Adjust based on node radius, but radius is variable... 
                        // Actually we should adjust refX dynamically or make it large enough
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', '#999');

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
      .attr('fill', d => d.color)
      .attr('stroke', '#fff')
      .attr('stroke-width', 2)
      .attr('class', 'cursor-pointer transition-all duration-200 hover:stroke-gray-900 shadow-lg');

    // Node Labels (Title)
    node.append('text')
      .text(d => {
        const title = d.paper.analysis?.title || d.paper.fileName;
        return title.length > 20 ? title.substring(0, 20) + '...' : title;
      })
      .attr('x', 0)
      .attr('y', d => d.radius + 15)
      .attr('text-anchor', 'middle')
      .attr('font-size', '10px')
      .attr('fill', '#374151')
      .attr('pointer-events', 'none')
      .clone(true).lower()
      .attr('stroke', 'white')
      .attr('stroke-width', 3);

    // Simulation Tick
    simulation.on('tick', () => {
      link
        .attr('x1', d => (d.source as Node).x!)
        .attr('y1', d => (d.source as Node).y!)
        .attr('x2', d => (d.target as Node).x!)
        .attr('y2', d => (d.target as Node).y!);

      node
        .attr('transform', d => `translate(${d.x},${d.y})`);
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
      <div className="absolute top-4 left-4 z-10 bg-white/90 backdrop-blur p-2 rounded-lg shadow-sm border border-gray-100 text-xs text-gray-600 space-y-1">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-orange-500"></div>
          <span>Core Paper (Many Citations)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-blue-500"></div>
          <span>Regular Paper</span>
        </div>
        <div className="mt-2 pt-2 border-t border-gray-100 text-gray-400 italic">
          * Links are inferred from references
        </div>
      </div>
      <svg ref={svgRef} width="100%" height="100%" className="cursor-grab active:cursor-grabbing"></svg>
    </div>
  );
}
