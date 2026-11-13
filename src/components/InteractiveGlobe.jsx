import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { sampleLocations, RISK_LEVELS } from '../data/mapData';
import {
  RotateCcw,
  Play,
  Pause,
  ZoomIn,
  ZoomOut,
  Globe2,
  ShieldAlert,
  MapPin,
  ExternalLink,
  Layers,
} from 'lucide-react';

/**
 * Simplified world continent polygon outlines for 3D sphere rendering.
 * Coordinates in [longitude, latitude] degrees.
 */
const CONTINENTS = [
  // North America
  [
    [-168, 65], [-160, 71], [-130, 70], [-95, 72], [-82, 63], [-62, 60], [-55, 48],
    [-70, 42], [-75, 35], [-80, 25], [-87, 21], [-97, 26], [-105, 23], [-117, 32],
    [-124, 40], [-124, 48], [-135, 56], [-152, 58], [-168, 65],
  ],
  // South America
  [
    [-77, 8], [-60, 8], [-50, -1], [-35, -5], [-37, -12], [-41, -21], [-50, -30],
    [-57, -38], [-65, -47], [-68, -55], [-75, -50], [-72, -40], [-71, -30], [-80, -5],
    [-77, 8],
  ],
  // Europe & Asia (Eurasia)
  [
    [-9, 38], [-9, 43], [0, 43], [4, 52], [8, 55], [12, 57], [20, 60], [28, 70],
    [40, 68], [60, 70], [80, 73], [105, 77], [130, 73], [160, 70], [178, 65],
    [165, 60], [140, 50], [130, 40], [120, 32], [108, 22], [100, 15], [90, 22],
    [80, 13], [70, 22], [60, 25], [50, 30], [35, 32], [28, 41], [15, 40], [2, 49],
    [-4, 48], [-9, 38],
  ],
  // Africa
  [
    [-17, 15], [-5, 36], [10, 37], [25, 32], [32, 31], [43, 12], [51, 11], [42, -5],
    [35, -20], [28, -32], [18, -34], [12, -18], [9, 4], [0, 6], [-12, 5], [-17, 15],
  ],
  // Australia
  [
    [114, -22], [122, -18], [135, -12], [142, -11], [148, -19], [153, -28], [150, -37],
    [138, -35], [128, -32], [115, -34], [114, -22],
  ],
  // Antarctica (approximate rim)
  [
    [-180, -78], [-120, -74], [-60, -68], [0, -70], [60, -68], [120, -72], [180, -78],
  ],
];

export default function InteractiveGlobe({
  locations = sampleLocations,
  incidents = [],
  onSelectCountry,
  selectedCountry = null,
  height = 480,
  showControls = true,
}) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  // Rotation angles (radians)
  const [rotX, setRotX] = useState(0.3); // Pitch
  const [rotY, setRotY] = useState(1.4); // Yaw
  const [zoom, setZoom] = useState(1.0);
  const [isRotating, setIsRotating] = useState(true);
  const [hoveredNode, setHoveredNode] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const isDraggingRef = useRef(false);
  const lastMouseRef = useRef({ x: 0, y: 0 });
  const animFrameRef = useRef(null);

  // Merge locations with active incident coordinates
  const globeNodes = useMemo(() => {
    const list = [...locations];

    // Overlay real incident markers if available
    incidents.forEach((inc) => {
      if (inc.latitude && inc.longitude) {
        list.push({
          id: `inc-${inc.id}`,
          country: inc.country,
          city: inc.location || inc.country,
          coordinates: [inc.latitude, inc.longitude],
          riskScore: inc.severity === 'Critical' ? 95 : inc.severity === 'High' ? 80 : 50,
          riskClassification:
            inc.severity === 'Critical'
              ? RISK_LEVELS.HIGH
              : inc.severity === 'High'
                ? RISK_LEVELS.HIGH
                : RISK_LEVELS.MEDIUM,
          riskCategory: inc.category,
          isIncident: true,
          severity: inc.severity,
          title: inc.title,
        });
      }
    });

    return list;
  }, [locations, incidents]);

  // Convert 3D spherical coordinate (lon, lat) to 2D canvas coordinates
  const projectPoint = useCallback(
    (lon, lat, radius, centerX, centerY, currentRotX, currentRotY) => {
      const phi = (lat * Math.PI) / 180;
      const lambda = (lon * Math.PI) / 180;

      // Rotate around Y axis (longitude)
      const x1 = Math.cos(phi) * Math.sin(lambda - currentRotY);
      const y1 = Math.sin(phi);
      const z1 = Math.cos(phi) * Math.cos(lambda - currentRotY);

      // Rotate around X axis (latitude tilt)
      const x2 = x1;
      const y2 = y1 * Math.cos(currentRotX) - z1 * Math.sin(currentRotX);
      const z2 = y1 * Math.sin(currentRotX) + z1 * Math.cos(currentRotX);

      // Screen projection
      const screenX = centerX + x2 * radius;
      const screenY = centerY - y2 * radius;

      return { x: screenX, y: screenY, z: z2 };
    },
    []
  );

  // Render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let localRotY = rotY;

    const render = () => {
      // Auto-rotation when active and not dragging
      if (isRotating && !isDraggingRef.current) {
        localRotY += 0.003;
        setRotY(localRotY);
      }

      const width = canvas.width;
      const height = canvas.height;
      const centerX = width / 2;
      const centerY = height / 2;
      const radius = (Math.min(width, height) / 2.3) * zoom;

      ctx.clearRect(0, 0, width, height);

      // 1. Atmospheric Outer Glow
      const glowGrad = ctx.createRadialGradient(
        centerX,
        centerY,
        radius * 0.9,
        centerX,
        centerY,
        radius * 1.25
      );
      glowGrad.addColorStop(0, 'rgba(0, 194, 255, 0.22)');
      glowGrad.addColorStop(0.5, 'rgba(54, 214, 176, 0.08)');
      glowGrad.addColorStop(1, 'rgba(8, 20, 38, 0)');

      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius * 1.25, 0, Math.PI * 2);
      ctx.fill();

      // 2. Globe Sphere (Deep Navy Gradient)
      const sphereGrad = ctx.createRadialGradient(
        centerX - radius * 0.35,
        centerY - radius * 0.35,
        radius * 0.1,
        centerX,
        centerY,
        radius
      );
      sphereGrad.addColorStop(0, '#102A43'); // Navy Blue highlight
      sphereGrad.addColorStop(0.65, '#0B192B'); // Dark Surface
      sphereGrad.addColorStop(1, '#081426'); // Deep Navy border

      ctx.save();
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.clip(); // Restrict internal elements inside sphere

      ctx.fillStyle = sphereGrad;
      ctx.fill();

      // 3. Graticule (Latitude & Longitude Grid Lines)
      ctx.strokeStyle = 'rgba(27, 53, 82, 0.45)';
      ctx.lineWidth = 1;

      // Parallels (Latitudes)
      for (let lat = -60; lat <= 60; lat += 30) {
        ctx.beginPath();
        let first = true;
        for (let lon = -180; lon <= 180; lon += 5) {
          const pt = projectPoint(lon, lat, radius, centerX, centerY, rotX, localRotY);
          if (pt.z > 0) {
            if (first) {
              ctx.moveTo(pt.x, pt.y);
              first = false;
            } else {
              ctx.lineTo(pt.x, pt.y);
            }
          } else {
            first = true;
          }
        }
        ctx.stroke();
      }

      // Meridians (Longitudes)
      for (let lon = -180; lon <= 180; lon += 30) {
        ctx.beginPath();
        let first = true;
        for (let lat = -80; lat <= 80; lat += 5) {
          const pt = projectPoint(lon, lat, radius, centerX, centerY, rotX, localRotY);
          if (pt.z > 0) {
            if (first) {
              ctx.moveTo(pt.x, pt.y);
              first = false;
            } else {
              ctx.lineTo(pt.x, pt.y);
            }
          } else {
            first = true;
          }
        }
        ctx.stroke();
      }

      // 4. Continents & Landmass Vector Polygons
      ctx.fillStyle = 'rgba(16, 42, 67, 0.85)'; // Navy Blue Landmass
      ctx.strokeStyle = 'rgba(0, 194, 255, 0.35)'; // Cyan Shorelines
      ctx.lineWidth = 1.2;

      CONTINENTS.forEach((poly) => {
        ctx.beginPath();
        let first = true;
        let visibleCount = 0;

        poly.forEach(([lon, lat]) => {
          const pt = projectPoint(lon, lat, radius, centerX, centerY, rotX, localRotY);
          if (pt.z > -0.1) {
            visibleCount++;
            if (first) {
              ctx.moveTo(pt.x, pt.y);
              first = false;
            } else {
              ctx.lineTo(pt.x, pt.y);
            }
          } else {
            first = true;
          }
        });

        if (visibleCount > 2) {
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      });

      // 5. Monitoring Nodes & Threat Markers
      const time = Date.now() / 1000;
      let activeHover = null;

      globeNodes.forEach((node) => {
        const [lat, lon] = node.coordinates;
        const pt = projectPoint(lon, lat, radius, centerX, centerY, rotX, localRotY);

        // Render only if on front hemisphere
        if (pt.z > 0.05) {
          const isSelected = selectedCountry && node.country?.toLowerCase() === selectedCountry.toLowerCase();

          // Determine marker color from Risk scale
          let markerColor = '#36D6B0'; // Low (Teal)
          if (node.riskClassification === RISK_LEVELS.HIGH || node.severity === 'Critical') {
            markerColor = '#FF4D5A'; // Critical Red
          } else if (node.riskClassification === RISK_LEVELS.MEDIUM || node.severity === 'High') {
            markerColor = '#FF8A45'; // High Orange
          } else if (node.riskScore > 40) {
            markerColor = '#F5C451'; // Medium Amber
          }

          // Pulsing radar ring
          const pulse = (time * 2 + (node.riskScore || 10)) % 2;
          const pulseRadius = 5 + pulse * 7;
          const pulseAlpha = Math.max(0, 1 - pulse / 2);

          ctx.beginPath();
          ctx.arc(pt.x, pt.y, pulseRadius, 0, Math.PI * 2);
          ctx.strokeStyle = markerColor;
          ctx.globalAlpha = pulseAlpha * 0.75;
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.globalAlpha = 1;

          // Inner solid core node
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, isSelected ? 6 : 4, 0, Math.PI * 2);
          ctx.fillStyle = markerColor;
          ctx.shadowColor = markerColor;
          ctx.shadowBlur = isSelected ? 16 : 8;
          ctx.fill();
          ctx.shadowBlur = 0;

          // Country Label for prominent nodes
          if (pt.z > 0.5 || isSelected) {
            ctx.font = '10px monospace';
            ctx.fillStyle = isSelected ? '#00C2FF' : '#EAF2F8';
            ctx.fillText(node.country || node.city, pt.x + 8, pt.y + 3);
          }

          // Mouse hit test
          const dx = pt.x - mousePos.x;
          const dy = pt.y - mousePos.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 18) {
            activeHover = { ...node, screenX: pt.x, screenY: pt.y };
          }
        }
      });

      setHoveredNode(activeHover);

      ctx.restore(); // End sphere clipping

      // 6. Perimeter Cyber Ring & Outer Border
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(0, 194, 255, 0.5)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Outer dashed tech ring
      ctx.beginPath();
      ctx.setLineDash([4, 8]);
      ctx.arc(centerX, centerY, radius + 8, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(54, 214, 176, 0.3)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);

      animFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [rotX, rotY, zoom, isRotating, mousePos, globeNodes, selectedCountry, projectPoint]);

  // Handle Resize
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (canvas && container) {
        canvas.width = container.clientWidth;
        canvas.height = height;
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [height]);

  // Mouse & Touch Interactivity
  const handleMouseDown = (e) => {
    isDraggingRef.current = true;
    lastMouseRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e) => {
    const canvas = canvasRef.current;
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      setMousePos({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    }

    if (!isDraggingRef.current) return;
    const dx = e.clientX - lastMouseRef.current.x;
    const dy = e.clientY - lastMouseRef.current.y;

    setRotY((prev) => prev + dx * 0.006);
    setRotX((prev) => Math.max(-1.1, Math.min(1.1, prev - dy * 0.006)));

    lastMouseRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  const handleWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY * -0.001;
    setZoom((prev) => Math.min(2.0, Math.max(0.7, prev + delta)));
  };

  const handleCanvasClick = () => {
    if (hoveredNode && onSelectCountry) {
      onSelectCountry(hoveredNode.country);
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden rounded-2xl border border-midnight-border bg-gradient-to-b from-midnight-surface to-midnight-base shadow-2xl backdrop-blur-md"
      style={{ height }}
    >
      {/* 3D Canvas Viewport */}
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onClick={handleCanvasClick}
        className="w-full h-full cursor-grab active:cursor-grabbing block select-none"
      />

      {/* Floating Header Overlay */}
      <div className="absolute top-4 left-4 z-10 flex items-center gap-2 pointer-events-none">
        <span className="flex h-2.5 w-2.5 rounded-full bg-accent-cyan shadow-[0_0_10px_#00C2FF] animate-pulse" />
        <span className="font-mono text-[11px] font-bold tracking-wider text-accent-cyan uppercase">
          Interactive Geospatial Sphere
        </span>
        <span className="text-[10px] font-mono text-accent-muted bg-midnight-blue/70 border border-midnight-border px-2 py-0.5 rounded">
          {globeNodes.length} NODES
        </span>
      </div>

      {/* Floating Controls HUD */}
      {showControls && (
        <div className="absolute top-4 right-4 z-10 flex items-center gap-1.5 bg-midnight-surface/85 border border-midnight-border rounded-xl p-1.5 backdrop-blur-md shadow-lg">
          <button
            onClick={() => setIsRotating((r) => !r)}
            className="p-1.5 rounded-lg text-accent-secondary hover:text-white hover:bg-midnight-blue transition-colors"
            title={isRotating ? 'Pause rotation' : 'Start rotation'}
          >
            {isRotating ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 text-accent-cyan" />}
          </button>
          <button
            onClick={() => {
              setRotX(0.3);
              setRotY(1.4);
              setZoom(1.0);
            }}
            className="p-1.5 rounded-lg text-accent-secondary hover:text-white hover:bg-midnight-blue transition-colors"
            title="Reset sphere orientation"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <div className="w-[1px] h-4 bg-midnight-border mx-0.5" />
          <button
            onClick={() => setZoom((z) => Math.min(2.0, z + 0.15))}
            className="p-1.5 rounded-lg text-accent-secondary hover:text-white hover:bg-midnight-blue transition-colors"
            title="Zoom in"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            onClick={() => setZoom((z) => Math.max(0.7, z - 0.15))}
            className="p-1.5 rounded-lg text-accent-secondary hover:text-white hover:bg-midnight-blue transition-colors"
            title="Zoom out"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Interactive Floating Node HUD Tooltip */}
      {hoveredNode && (
        <div
          className="absolute z-20 pointer-events-none transform -translate-x-1/2 -translate-y-full mb-3"
          style={{
            left: `${hoveredNode.screenX}px`,
            top: `${hoveredNode.screenY - 12}px`,
          }}
        >
          <div className="rounded-xl border border-accent-cyan/60 bg-midnight-surface/95 px-3.5 py-2.5 shadow-2xl backdrop-blur-md text-xs min-w-[190px]">
            <div className="flex items-center justify-between gap-2 border-b border-midnight-border pb-1.5 mb-1.5">
              <span className="font-bold text-accent-ice text-sm">
                {hoveredNode.country || hoveredNode.city}
              </span>
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase border ${
                  hoveredNode.riskClassification === RISK_LEVELS.HIGH
                    ? 'border-risk-critical/40 bg-risk-critical/15 text-risk-critical'
                    : hoveredNode.riskClassification === RISK_LEVELS.MEDIUM
                      ? 'border-risk-high/40 bg-risk-high/15 text-risk-high'
                      : 'border-risk-low/40 bg-risk-low/15 text-risk-low'
                }`}
              >
                {hoveredNode.riskClassification || hoveredNode.severity || 'MONITORED'}
              </span>
            </div>
            <div className="space-y-1 font-mono text-[11px] text-accent-secondary">
              <div className="flex justify-between">
                <span className="text-accent-muted">Risk Score:</span>
                <span className="font-bold text-accent-ice">{hoveredNode.riskScore ?? '—'}/100</span>
              </div>
              <div className="flex justify-between">
                <span className="text-accent-muted">Category:</span>
                <span className="text-accent-ice truncate max-w-[110px]">{hoveredNode.riskCategory || 'Geopolitical'}</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-accent-muted">Coords:</span>
                <span>
                  {hoveredNode.coordinates[0].toFixed(2)}°, {hoveredNode.coordinates[1].toFixed(2)}°
                </span>
              </div>
            </div>
            <div className="mt-2 pt-1 border-t border-midnight-border/60 text-[10px] text-accent-cyan font-mono flex items-center justify-between">
              <span>Click to view profile</span>
              <ExternalLink className="h-3 w-3" />
            </div>
          </div>
        </div>
      )}

      {/* Footer Instructions */}
      <div className="absolute bottom-3 inset-x-4 z-10 flex items-center justify-between pointer-events-none text-[10px] font-mono text-accent-muted">
        <span>DRAG TO ROTATE • SCROLL TO ZOOM</span>
        <span className="hidden sm:inline">PROJECTION: ORTHOGRAPHIC 3D</span>
      </div>
    </div>
  );
}
