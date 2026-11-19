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
  Flame,
  CloudLightning,
  Radio,
  Satellite,
  Compass,
} from 'lucide-react';

/**
 * Detailed world continent & island polygon coordinates for realistic 3D globe rendering.
 * Coordinates are in [longitude, latitude] degrees.
 */
const DETAILED_CONTINENTS = [
  // 1. North America
  [
    [-168, 65], [-162, 70], [-150, 71], [-130, 70], [-115, 69], [-95, 72], [-82, 63],
    [-84, 55], [-78, 52], [-65, 58], [-55, 48], [-64, 44], [-70, 42], [-76, 35],
    [-81, 25], [-82, 28], [-88, 30], [-97, 26], [-97, 21], [-90, 19], [-87, 21],
    [-83, 10], [-79, 8], [-84, 10], [-92, 14], [-105, 20], [-110, 23], [-115, 30],
    [-118, 34], [-124, 40], [-124, 48], [-132, 54], [-140, 59], [-153, 58], [-160, 55],
    [-166, 60], [-168, 65],
  ],
  // 2. Greenland
  [
    [-44, 60], [-35, 65], [-20, 70], [-18, 77], [-28, 82], [-50, 82], [-60, 78],
    [-55, 70], [-44, 60],
  ],
  // 3. South America
  [
    [-77, 8], [-68, 12], [-60, 9], [-50, -1], [-35, -5], [-35, -10], [-39, -15],
    [-43, -22], [-48, -28], [-56, -34], [-65, -42], [-67, -54], [-75, -52], [-74, -44],
    [-71, -30], [-76, -15], [-81, -5], [-80, 2], [-77, 8],
  ],
  // 4. Europe
  [
    [-9, 37], [-9, 43], [0, 43], [-1, 46], [-5, 48], [2, 51], [8, 54], [10, 58],
    [13, 56], [19, 54], [25, 59], [30, 60], [32, 70], [25, 71], [15, 68], [8, 63],
    [5, 62], [5, 58], [2, 53], [0, 49], [3, 44], [9, 44], [14, 41], [18, 40],
    [15, 38], [12, 38], [14, 44], [12, 45], [4, 44], [0, 41], [-5, 36], [-9, 37],
  ],
  // 5. United Kingdom & Ireland
  [
    [-5, 50], [1, 52], [0, 55], [-2, 58], [-5, 58], [-5, 55], [-4, 52], [-5, 50],
  ],
  // 6. Africa
  [
    [-17, 15], [-17, 21], [-12, 28], [-5, 36], [10, 37], [25, 32], [32, 31], [35, 27],
    [43, 12], [51, 11], [46, 5], [41, -4], [35, -20], [32, -28], [28, -33], [18, -34],
    [14, -23], [12, -15], [9, 4], [4, 5], [0, 6], [-8, 4], [-12, 5], [-17, 15],
  ],
  // 7. Madagascar
  [
    [44, -12], [50, -13], [50, -22], [47, -25], [43, -25], [44, -18], [44, -12],
  ],
  // 8. Asia & Siberia
  [
    [30, 60], [40, 68], [60, 70], [80, 73], [105, 77], [130, 73], [160, 70], [178, 65],
    [170, 60], [160, 55], [142, 50], [132, 43], [129, 35], [122, 30], [118, 22],
    [108, 16], [105, 10], [100, 4], [98, 10], [92, 21], [88, 22], [80, 13], [77, 8],
    [72, 19], [68, 24], [62, 25], [56, 26], [50, 30], [40, 32], [36, 32], [34, 36],
    [27, 41], [35, 42], [40, 47], [50, 47], [55, 55], [45, 58], [30, 60],
  ],
  // 9. Indian Subcontinent Focus
  [
    [68, 24], [72, 20], [76, 12], [78, 8], [80, 13], [85, 18], [88, 22], [85, 27],
    [76, 30], [70, 28], [68, 24],
  ],
  // 10. Japan Arc
  [
    [130, 31], [135, 34], [141, 38], [142, 44], [145, 44], [141, 41], [136, 35], [130, 31],
  ],
  // 11. Southeast Asia & Indonesia
  [
    [95, 5], [105, -5], [115, -8], [122, -8], [120, -1], [110, 2], [100, 4], [95, 5],
  ],
  // 12. Australia
  [
    [114, -22], [122, -18], [132, -12], [142, -11], [148, -19], [153, -28], [150, -37],
    [145, -39], [138, -35], [128, -32], [115, -34], [114, -28], [114, -22],
  ],
  // 13. New Zealand
  [
    [166, -46], [173, -42], [178, -38], [174, -36], [172, -40], [168, -44], [166, -46],
  ],
  // 14. Antarctica Rim
  [
    [-180, -78], [-130, -74], [-70, -68], [0, -70], [70, -68], [130, -72], [180, -78],
  ],
];

/**
 * Global city night lights for NASA Earth at Night nocturnal glow simulation.
 * [lon, lat, intensity]
 */
const CITY_LIGHTS = [
  [-74.0, 40.7, 1.0],   // New York
  [-0.12, 51.5, 1.0],   // London
  [2.35, 48.8, 0.9],    // Paris
  [139.69, 35.68, 1.0], // Tokyo
  [77.2, 28.6, 0.95],   // Delhi
  [72.8, 19.0, 0.95],   // Mumbai
  [121.4, 31.2, 1.0],   // Shanghai
  [116.4, 39.9, 0.95],  // Beijing
  [103.8, 1.35, 0.9],   // Singapore
  [55.27, 25.2, 0.95],  // Dubai
  [-118.2, 34.0, 0.9],  // Los Angeles
  [-87.6, 41.8, 0.85],  // Chicago
  [-46.6, -23.5, 0.9],  // Sao Paulo
  [-58.3, -34.6, 0.85], // Buenos Aires
  [151.2, -33.8, 0.85], // Sydney
  [31.2, 30.0, 0.9],    // Cairo
  [37.6, 55.7, 0.85],   // Moscow
  [126.9, 37.5, 0.95],  // Seoul
  [100.5, 13.7, 0.85],  // Bangkok
  [18.4, -33.9, 0.8],   // Cape Town
];

export default function InteractiveGlobe({
  locations = sampleLocations,
  incidents = [],
  liveEvents = [],
  onSelectCountry,
  selectedCountry = null,
  height = 480,
  showControls = true,
}) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  // Mutable animation state in REFS to avoid triggering React re-render loops at 60Hz
  const rotXRef = useRef(0.25); // Pitch (latitude tilt)
  const rotYRef = useRef(1.4);  // Yaw (rotation longitude)
  const zoomRef = useRef(1.0);
  const isRotatingRef = useRef(true);
  const isDraggingRef = useRef(false);
  const lastMouseRef = useRef({ x: 0, y: 0 });
  const mousePosRef = useRef({ x: 0, y: 0 });
  const animFrameRef = useRef(null);
  const hoveredNodeRef = useRef(null);

  // UI States (only updated on deliberate user interaction)
  const [isRotatingState, setIsRotatingState] = useState(true);
  const [zoomDisplay, setZoomDisplay] = useState(1.0);
  const [globeTheme, setGlobeTheme] = useState('nasa'); // 'nasa' | 'tactical'
  const [activeFilter, setActiveFilter] = useState('ALL');
  const [hoveredNode, setHoveredNode] = useState(null);

  // Keep refs synchronized with UI state
  useEffect(() => {
    isRotatingRef.current = isRotatingState;
  }, [isRotatingState]);

  // Aggregate nodes memoized cleanly
  const globeNodes = useMemo(() => {
    const list = [];

    // 1. Base Country Monitoring Sites
    if (activeFilter === 'ALL' || activeFilter === 'COUNTRY') {
      locations.forEach((loc) => {
        list.push({
          id: `loc-${loc.id || loc.country}`,
          country: loc.country,
          city: loc.city || loc.country,
          coordinates: loc.coordinates,
          riskScore: loc.riskScore || 50,
          riskClassification: loc.riskClassification || RISK_LEVELS.MEDIUM,
          riskCategory: loc.riskCategory || 'Geopolitical',
          type: 'country',
          source: 'GRICC Monitoring Index',
        });
      });
    }

    // 2. Real Stored Incidents
    if (activeFilter === 'ALL' || activeFilter === 'INCIDENT') {
      incidents.forEach((inc) => {
        if (typeof inc.latitude === 'number' && typeof inc.longitude === 'number') {
          list.push({
            id: `inc-${inc.id}`,
            country: inc.country,
            city: inc.location || inc.country,
            coordinates: [inc.latitude, inc.longitude],
            riskScore: inc.severity === 'Critical' ? 95 : inc.severity === 'High' ? 80 : 55,
            riskClassification:
              inc.severity === 'Critical' || inc.severity === 'High'
                ? RISK_LEVELS.HIGH
                : RISK_LEVELS.MEDIUM,
            riskCategory: inc.category || 'Incident',
            type: 'incident',
            severity: inc.severity,
            title: inc.title,
            source: 'Operational Incident DB',
          });
        }
      });
    }

    // 3. Live NASA EONET Hazards & GitHub Threat Feeds
    (liveEvents || []).forEach((ev, idx) => {
      if (Array.isArray(ev.coordinates) && ev.coordinates.length === 2 && !isNaN(ev.coordinates[0])) {
        const isNasa =
          ev.source?.toLowerCase().includes('nasa') ||
          ev.category?.toLowerCase().includes('wildfire') ||
          ev.category?.toLowerCase().includes('storm') ||
          ev.category?.toLowerCase().includes('volcano');
        const isCyber =
          ev.source?.toLowerCase().includes('github') ||
          ev.source?.toLowerCase().includes('cisa') ||
          ev.category?.toLowerCase().includes('cyber');

        if (activeFilter === 'NASA' && !isNasa) return;
        if (activeFilter === 'CYBER' && !isCyber) return;

        list.push({
          id: `live-ev-${idx}-${ev.id || idx}`,
          country: ev.country || (isNasa ? 'NASA Global Observation' : 'Threat Intelligence Net'),
          city: ev.title || 'Live Hazard',
          coordinates: ev.coordinates,
          riskScore: 92,
          riskClassification: RISK_LEVELS.HIGH,
          riskCategory: ev.category || (isNasa ? 'Natural Hazard' : 'Cyber IOC'),
          type: isNasa ? 'nasa' : isCyber ? 'cyber' : 'hazard',
          severity: ev.severity || 'Critical',
          title: ev.title,
          source: ev.source || (isNasa ? 'NASA EONET v3' : 'GitHub Threat Net'),
          url: ev.url,
          date: ev.date,
        });
      }
    });

    return list;
  }, [locations, incidents, liveEvents, activeFilter]);

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

  // Main 60FPS High-Performance Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let activeHoverTracked = null;

    const render = () => {
      // 1. Advance rotation without updating React state
      if (isRotatingRef.current && !isDraggingRef.current) {
        rotYRef.current += 0.002;
      }

      const width = canvas.width;
      const height = canvas.height;
      if (width === 0 || height === 0) {
        animFrameRef.current = requestAnimationFrame(render);
        return;
      }

      const centerX = width / 2;
      const centerY = height / 2;
      const radius = (Math.min(width, height) / 2.3) * zoomRef.current;
      const curRotX = rotXRef.current;
      const curRotY = rotYRef.current;
      const time = Date.now() / 1000;
      const isNasaTheme = globeTheme === 'nasa';

      ctx.clearRect(0, 0, width, height);

      // 2. Realistic Rayleigh Atmospheric Scattering Halo
      const atmosphereGrad = ctx.createRadialGradient(
        centerX,
        centerY,
        radius * 0.94,
        centerX,
        centerY,
        radius * 1.28
      );

      if (isNasaTheme) {
        atmosphereGrad.addColorStop(0, 'rgba(56, 189, 248, 0.40)'); // Vibrant cyan-blue ozone
        atmosphereGrad.addColorStop(0.35, 'rgba(14, 165, 233, 0.18)'); // Mid-atmospheric haze
        atmosphereGrad.addColorStop(0.75, 'rgba(3, 105, 161, 0.06)'); // Outer thermosphere
        atmosphereGrad.addColorStop(1, 'rgba(2, 6, 23, 0)');
      } else {
        atmosphereGrad.addColorStop(0, 'rgba(0, 194, 255, 0.25)');
        atmosphereGrad.addColorStop(0.5, 'rgba(54, 214, 176, 0.10)');
        atmosphereGrad.addColorStop(1, 'rgba(8, 20, 38, 0)');
      }

      ctx.fillStyle = atmosphereGrad;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius * 1.28, 0, Math.PI * 2);
      ctx.fill();

      // 3. Globe Sphere Base with Photorealistic Deep Oceans Gradient
      const oceanGrad = ctx.createRadialGradient(
        centerX - radius * 0.35,
        centerY - radius * 0.35,
        radius * 0.05,
        centerX,
        centerY,
        radius
      );

      if (isNasaTheme) {
        oceanGrad.addColorStop(0, '#1a4971'); // Sunlit tropical blue highlight
        oceanGrad.addColorStop(0.35, '#0e2f50'); // Deep ocean shelf
        oceanGrad.addColorStop(0.75, '#07182c'); // Abyssal plain
        oceanGrad.addColorStop(1, '#020b17'); // Planetary shadow limb
      } else {
        oceanGrad.addColorStop(0, '#102A43');
        oceanGrad.addColorStop(0.65, '#0B192B');
        oceanGrad.addColorStop(1, '#060e18');
      }

      ctx.save();
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.clip(); // Clip all subsequent drawings strictly inside the planetary sphere

      ctx.fillStyle = oceanGrad;
      ctx.fill();

      // 4. Photorealistic Graticule (Latitude & Longitude)
      ctx.strokeStyle = isNasaTheme ? 'rgba(38, 100, 150, 0.25)' : 'rgba(27, 53, 82, 0.40)';
      ctx.lineWidth = 0.8;

      // Parallels (Latitudes)
      for (let lat = -60; lat <= 60; lat += 30) {
        ctx.beginPath();
        let first = true;
        for (let lon = -180; lon <= 180; lon += 5) {
          const pt = projectPoint(lon, lat, radius, centerX, centerY, curRotX, curRotY);
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
          const pt = projectPoint(lon, lat, radius, centerX, centerY, curRotX, curRotY);
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

      // 5. Detailed Realistic Continents with Coastal Shelf Shading
      DETAILED_CONTINENTS.forEach((poly) => {
        ctx.beginPath();
        let first = true;
        let visibleCount = 0;

        poly.forEach(([lon, lat]) => {
          const pt = projectPoint(lon, lat, radius, centerX, centerY, curRotX, curRotY);
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
          // Landmass color
          ctx.fillStyle = isNasaTheme ? 'rgba(24, 76, 52, 0.92)' : 'rgba(16, 42, 67, 0.85)';
          ctx.fill();

          // Coastal shelf outline
          ctx.strokeStyle = isNasaTheme ? 'rgba(52, 211, 153, 0.55)' : 'rgba(0, 194, 255, 0.40)';
          ctx.lineWidth = 1.2;
          ctx.stroke();
        }
      });

      // 6. NASA Earth at Night Nocturnal City Lights
      if (isNasaTheme) {
        CITY_LIGHTS.forEach(([cLon, cLat, intensity]) => {
          const pt = projectPoint(cLon, cLat, radius, centerX, centerY, curRotX, curRotY);
          if (pt.z > 0.05) {
            // City lights softly glow
            const flicker = 0.85 + Math.sin(time * 3 + cLon) * 0.15;
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, 1.8 * intensity, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(254, 240, 138, ${0.75 * intensity * flicker})`; // Golden city radiance
            ctx.shadowColor = '#facc15';
            ctx.shadowBlur = 6 * intensity;
            ctx.fill();
            ctx.shadowBlur = 0;
          }
        });
      }

      // 7. NASA Atmospheric Swirl & Realistic Cloud Bands
      if (isNasaTheme) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.lineWidth = 8;
        for (let cLat of [-25, 5, 25, 50]) {
          ctx.beginPath();
          let cFirst = true;
          for (let cLon = -180; cLon <= 180; cLon += 8) {
            const dynamicLon = cLon + Math.sin(time * 0.15 + cLat * 0.1) * 12;
            const pt = projectPoint(dynamicLon, cLat, radius, centerX, centerY, curRotX, curRotY);
            if (pt.z > 0.05) {
              if (cFirst) {
                ctx.moveTo(pt.x, pt.y);
                cFirst = false;
              } else {
                ctx.lineTo(pt.x, pt.y);
              }
            } else {
              cFirst = true;
            }
          }
          ctx.stroke();
        }

        // NASA / NOAA Orbit Track line (ISS / Earth Observation Simulation)
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.55)'; // Gold orbital path
        ctx.lineWidth = 1.4;
        ctx.setLineDash([4, 6]);
        ctx.beginPath();
        let oFirst = true;
        for (let step = -180; step <= 180; step += 5) {
          const orbitLat = Math.sin(((step + time * 8) * Math.PI) / 180) * 51.6;
          const pt = projectPoint(step, orbitLat, radius, centerX, centerY, curRotX, curRotY);
          if (pt.z > 0.02) {
            if (oFirst) {
              ctx.moveTo(pt.x, pt.y);
              oFirst = false;
            } else {
              ctx.lineTo(pt.x, pt.y);
            }
          } else {
            oFirst = true;
          }
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // 8. Dynamic Day/Night Terminator Shadow Effect
      const terminatorGrad = ctx.createLinearGradient(
        centerX - radius,
        centerY,
        centerX + radius,
        centerY
      );
      terminatorGrad.addColorStop(0, 'rgba(2, 6, 23, 0)');
      terminatorGrad.addColorStop(0.55, 'rgba(2, 6, 23, 0.08)');
      terminatorGrad.addColorStop(0.85, 'rgba(2, 6, 23, 0.42)');
      terminatorGrad.addColorStop(1, 'rgba(2, 6, 23, 0.70)');
      ctx.fillStyle = terminatorGrad;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.fill();

      // 9. Telemetry Nodes, NASA Natural Hazards & Threat Markers
      let hitNode = null;
      const mouse = mousePosRef.current;

      globeNodes.forEach((node) => {
        const [lat, lon] = node.coordinates;
        const pt = projectPoint(lon, lat, radius, centerX, centerY, curRotX, curRotY);

        // Render only if on front visible hemisphere
        if (pt.z > 0.05) {
          const isSelected = selectedCountry && node.country?.toLowerCase() === selectedCountry.toLowerCase();
          const isNasa = node.type === 'nasa';
          const isCyber = node.type === 'cyber';

          // Determine marker color
          let markerColor = '#36D6B0'; // Default Emerald/Teal
          if (isNasa) {
            markerColor = '#f59e0b'; // NASA Hazard Flame
          } else if (isCyber) {
            markerColor = '#a855f7'; // Cyber Threat Purple
          } else if (node.riskClassification === RISK_LEVELS.HIGH || node.severity === 'Critical') {
            markerColor = '#FF4D5A'; // Critical Red
          } else if (node.riskClassification === RISK_LEVELS.MEDIUM || node.severity === 'High') {
            markerColor = '#FF8A45'; // High Orange
          }

          // Pulsing radar ping ring
          const pulse = (time * 2 + (node.riskScore || 10)) % 2;
          const pulseRadius = 5 + pulse * (isNasa ? 9 : 7);
          const pulseAlpha = Math.max(0, 1 - pulse / 2);

          ctx.beginPath();
          ctx.arc(pt.x, pt.y, pulseRadius, 0, Math.PI * 2);
          ctx.strokeStyle = markerColor;
          ctx.globalAlpha = pulseAlpha * 0.85;
          ctx.lineWidth = isNasa ? 2.0 : 1.5;
          ctx.stroke();
          ctx.globalAlpha = 1;

          // Inner solid core node
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, isSelected ? 6.5 : isNasa ? 5.0 : 4.0, 0, Math.PI * 2);
          ctx.fillStyle = markerColor;
          ctx.shadowColor = markerColor;
          ctx.shadowBlur = isSelected || isNasa ? 18 : 8;
          ctx.fill();
          ctx.shadowBlur = 0;

          // Country / Hazard label for prominent or selected nodes
          if (pt.z > 0.55 || isSelected || isNasa) {
            ctx.font = isNasa ? 'bold 9px monospace' : '9px monospace';
            ctx.fillStyle = isNasa ? '#fbbf24' : isSelected ? '#00C2FF' : '#EAF2F8';
            const labelText = isNasa
              ? `⚡ ${node.title ? (node.title.length > 20 ? node.title.slice(0, 20) + '...' : node.title) : 'NASA Hazard'}`
              : node.country || node.city;
            ctx.fillText(labelText, pt.x + 8, pt.y + 3);
          }

          // Mouse hit test
          const dx = pt.x - mouse.x;
          const dy = pt.y - mouse.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 18) {
            hitNode = { ...node, screenX: pt.x, screenY: pt.y };
          }
        }
      });

      // Update hovered node only if target ID changed to eliminate unnecessary React re-renders
      if (hitNode?.id !== hoveredNodeRef.current?.id) {
        hoveredNodeRef.current = hitNode;
        setHoveredNode(hitNode);
      }

      ctx.restore(); // End sphere clipping

      // 10. Outer Atmospheric Perimeter Ring
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.strokeStyle = isNasaTheme ? 'rgba(56, 189, 248, 0.45)' : 'rgba(0, 194, 255, 0.50)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Outer dashed tactical telemetry ring
      ctx.beginPath();
      ctx.setLineDash([4, 8]);
      ctx.arc(centerX, centerY, radius + 8, 0, Math.PI * 2);
      ctx.strokeStyle = isNasaTheme ? 'rgba(52, 211, 153, 0.35)' : 'rgba(54, 214, 176, 0.30)';
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
  }, [globeTheme, globeNodes, selectedCountry, projectPoint]);

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
      mousePosRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    }

    if (!isDraggingRef.current) return;
    const dx = e.clientX - lastMouseRef.current.x;
    const dy = e.clientY - lastMouseRef.current.y;

    rotYRef.current += dx * 0.005;
    rotXRef.current = Math.max(-1.1, Math.min(1.1, rotXRef.current - dy * 0.005));

    lastMouseRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  const handleWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY * -0.001;
    zoomRef.current = Math.min(2.2, Math.max(0.65, zoomRef.current + delta));
    setZoomDisplay(zoomRef.current);
  };

  const handleCanvasClick = () => {
    const current = hoveredNodeRef.current;
    if (current && onSelectCountry && current.country) {
      onSelectCountry(current.country);
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden rounded-2xl border border-navy-700/70 bg-gradient-to-b from-navy-900 to-navy-950 shadow-2xl backdrop-blur-md"
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
      <div className="absolute top-4 left-4 z-10 flex flex-wrap items-center gap-2">
        <span className="flex h-2.5 w-2.5 rounded-full bg-cyan-400 shadow-[0_0_10px_#22d3ee] animate-pulse" />
        <span className="font-mono text-xs font-bold tracking-wider text-cyan-400 uppercase">
          {globeTheme === 'nasa' ? 'NASA Planetary Earth Sphere' : 'Tactical Cyber Globe'}
        </span>
        <span className="text-[10px] font-mono text-slate-300 bg-navy-800/90 border border-navy-700 px-2 py-0.5 rounded">
          {globeNodes.length} ACTIVE NODES
        </span>
        <span className="text-[10px] font-mono text-amber-300 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded flex items-center gap-1">
          <Satellite className="h-3 w-3" />
          <span>NASA EONET + Night Lights</span>
        </span>
      </div>

      {/* Interactive Controls Overlay */}
      {showControls && (
        <div className="absolute top-4 right-4 z-10 flex items-center gap-1.5 bg-navy-900/90 border border-navy-700/80 p-1 rounded-xl backdrop-blur-md shadow-lg">
          {/* Globe Theme Toggle (NASA Planetary vs Tactical) */}
          <button
            onClick={() => setGlobeTheme((t) => (t === 'nasa' ? 'tactical' : 'nasa'))}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-medium transition-colors flex items-center gap-1 ${
              globeTheme === 'nasa'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Toggle NASA Earth / Tactical theme"
          >
            <Globe2 className="h-3.5 w-3.5" />
            <span>{globeTheme === 'nasa' ? 'NASA Earth' : 'Tactical'}</span>
          </button>

          {/* Filter Dropdown */}
          <select
            value={activeFilter}
            onChange={(e) => setActiveFilter(e.target.value)}
            className="rounded-lg border border-navy-700 bg-navy-950 px-2 py-1 text-[11px] font-mono text-slate-300 focus:outline-none"
            title="Filter Globe telemetry layers"
          >
            <option value="ALL">All Layers</option>
            <option value="NASA">NASA Hazards</option>
            <option value="CYBER">Cyber Threat Net</option>
            <option value="INCIDENT">Stored Incidents</option>
          </select>

          {/* Rotation Toggle */}
          <button
            onClick={() => setIsRotatingState((r) => !r)}
            className="p-1.5 rounded-lg text-slate-300 hover:bg-navy-800 transition-colors"
            title={isRotatingState ? 'Pause Rotation' : 'Resume Rotation'}
          >
            {isRotatingState ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>

          {/* Reset Orientation */}
          <button
            onClick={() => {
              rotXRef.current = 0.25;
              rotYRef.current = 1.4;
              zoomRef.current = 1.0;
              setZoomDisplay(1.0);
            }}
            className="p-1.5 rounded-lg text-slate-300 hover:bg-navy-800 transition-colors"
            title="Reset Globe Orientation"
          >
            <RotateCcw className="h-4 w-4" />
          </button>

          {/* Zoom In */}
          <button
            onClick={() => {
              zoomRef.current = Math.min(2.2, zoomRef.current + 0.15);
              setZoomDisplay(zoomRef.current);
            }}
            className="p-1.5 rounded-lg text-slate-300 hover:bg-navy-800 transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="h-4 w-4" />
          </button>

          {/* Zoom Out */}
          <button
            onClick={() => {
              zoomRef.current = Math.max(0.65, zoomRef.current - 0.15);
              setZoomDisplay(zoomRef.current);
            }}
            className="p-1.5 rounded-lg text-slate-300 hover:bg-navy-800 transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Hover Node Tooltip Card */}
      {hoveredNode && (
        <div
          className="absolute z-20 pointer-events-none rounded-xl border border-navy-700/90 bg-navy-900/95 p-3 text-xs text-white shadow-2xl backdrop-blur-md max-w-[280px]"
          style={{
            left: Math.min(hoveredNode.screenX + 12, (containerRef.current?.clientWidth || 400) - 290),
            top: Math.max(12, Math.min(hoveredNode.screenY - 20, height - 140)),
          }}
        >
          <div className="flex items-center gap-1.5 border-b border-navy-800 pb-1.5">
            {hoveredNode.type === 'nasa' ? (
              <span className="flex items-center gap-1 text-[10px] font-mono font-bold text-amber-400 bg-amber-500/20 px-1.5 py-0.5 rounded border border-amber-500/30">
                ⚡ NASA EONET HAZARD
              </span>
            ) : hoveredNode.type === 'cyber' ? (
              <span className="flex items-center gap-1 text-[10px] font-mono font-bold text-purple-400 bg-purple-500/20 px-1.5 py-0.5 rounded border border-purple-500/30">
                🛡 CYBER THREAT NODE
              </span>
            ) : (
              <span className="text-[10px] font-mono text-cyan-400 bg-cyan-500/20 px-1.5 py-0.5 rounded border border-cyan-500/30">
                {hoveredNode.type === 'incident' ? 'INCIDENT' : 'MONITORING SITE'}
              </span>
            )}
          </div>
          <p className="mt-1.5 font-bold text-slate-100 text-sm leading-snug">
            {hoveredNode.title || hoveredNode.country}
          </p>
          <div className="mt-1.5 space-y-1 text-[11px] font-mono text-slate-300">
            <div className="flex justify-between">
              <span className="text-slate-400">Category:</span>
              <span className="text-cyan-300 font-semibold">{hoveredNode.riskCategory}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Coordinates:</span>
              <span>
                {hoveredNode.coordinates[0].toFixed(1)}°, {hoveredNode.coordinates[1].toFixed(1)}°
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Source:</span>
              <span className="text-amber-300">{hoveredNode.source}</span>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Telemetry Bar */}
      <div className="pointer-events-none absolute bottom-3 left-4 right-4 z-10 flex items-center justify-between text-[10px] font-mono text-slate-400 bg-navy-950/80 border border-navy-800/80 px-3 py-1.5 rounded-lg backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <span>NASA PLANETARY SPHERE</span>
          <span>•</span>
          <span>ZOOM: {zoomDisplay.toFixed(1)}x</span>
        </div>
        <div className="flex items-center gap-2 text-cyan-400">
          <span>NOCTURNAL CITY LIGHTS ON</span>
          <span>•</span>
          <span>EONET v3 ACTIVE</span>
        </div>
      </div>
    </div>
  );
}
