import React, { useEffect, useRef, Suspense, lazy } from 'react';
import { Code, Monitor, Music, Paintbrush, Megaphone, Lightbulb } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const LogoGlobe = lazy(() => import("./LogoGlobe"));

const GalaxyOrbit: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const navigate = useNavigate();

  const r1Ref = useRef<HTMLDivElement>(null);
  const r2Ref = useRef<HTMLDivElement>(null);
  const roRef = useRef<HTMLDivElement>(null);

  const planetRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const BASE = {
      inner1: { a: 200, b: 90, tilt: Math.PI / 3 },
      inner2: { a: 200, b: 90, tilt: -Math.PI / 3 },
      outer: { a: 260, b: 120, tilt: 0 },
    };

    const PLANETS = [
      { id: 'planet-web', orbit: 'inner1', phase: 0, speed: 0.35, r: 185, g: 28, b: 28, trailLen: 160, headW: 8 },
      { id: 'planet-digital', orbit: 'inner1', phase: Math.PI, speed: 0.35, r: 185, g: 28, b: 28, trailLen: 160, headW: 8 },
      { id: 'planet-music', orbit: 'inner2', phase: Math.PI * 0.5, speed: -0.5, r: 185, g: 28, b: 28, trailLen: 140, headW: 8 },
      { id: 'planet-graphics', orbit: 'outer', phase: 0, speed: 0.32, r: 255, g: 255, b: 255, trailLen: 180, headW: 9 },
      { id: 'planet-brand', orbit: 'outer', phase: Math.PI, speed: 0.32, r: 255, g: 255, b: 255, trailLen: 180, headW: 9 },
      { id: 'planet-general', orbit: 'outer', phase: Math.PI * (2 / 3), speed: 0.32, r: 255, g: 255, b: 255, trailLen: 180, headW: 9 },
    ];

    const trails = PLANETS.map(() => [] as {x: number, y: number}[]);
    const angles = PLANETS.map(p => p.phase);
    const DESIGN_H = 600;
    let gs = 1;

    const r1 = r1Ref.current;
    const r2 = r2Ref.current;
    const ro = roRef.current;

    function syncRings() {
      if (r1) r1.style.transform = `rotate(60deg) scale(${gs})`;
      if (r2) r2.style.transform = `rotate(-60deg) scale(${gs})`;
      if (ro) ro.style.transform = `rotate(0deg) scale(${gs})`;
    }

    function syncCanvas() {
      if (!container || !canvas) return;
      canvas.width = container.offsetWidth;
      canvas.height = container.offsetHeight;
      gs = Math.min(container.offsetHeight / DESIGN_H, container.offsetWidth / 560);
      gs = Math.max(0.35, Math.min(gs, 1));
      syncRings();
      trails.forEach(t => { t.length = 0 });
    }

    syncCanvas();
    const resizeObserver = new ResizeObserver(syncCanvas);
    resizeObserver.observe(container);

    function orbitXY(key: keyof typeof BASE, angle: number) {
      const { a, b, tilt } = BASE[key];
      const ct = Math.cos(tilt), st = Math.sin(tilt), ca = Math.cos(angle), sa = Math.sin(angle);
      return { x: (a * ca * ct - b * sa * st) * gs, y: (a * ca * st + b * sa * ct) * gs };
    }

    function drawComet(pts: {x: number, y: number}[], r: number, g: number, b: number, baseHeadW: number) {
      const n = pts.length;
      if (n < 3) return;
      const headW = baseHeadW * gs;
      const perp = [];
      for (let i = 0; i < n - 1; i++) {
        const dx = pts[i + 1].x - pts[i].x;
        const dy = pts[i + 1].y - pts[i].y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        perp.push({ x: -dy / len, y: dx / len });
      }
      perp.push(perp[perp.length - 1]);
      const lx = [], ly = [], rx = [], ry = [];
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        const w = headW * t * t;
        lx.push(pts[i].x + perp[i].x * w);
        ly.push(pts[i].y + perp[i].y * w);
        rx.push(pts[i].x - perp[i].x * w);
        ry.push(pts[i].y - perp[i].y * w);
      }
      const tail = pts[0], head = pts[n - 1];
      const grad = ctx!.createLinearGradient(tail.x, tail.y, head.x, head.y);
      grad.addColorStop(0, `rgba(${r},${g},${b},0)`);
      grad.addColorStop(0.5, `rgba(${r},${g},${b},0.35)`);
      grad.addColorStop(1, `rgba(${r},${g},${b},0.90)`);
      
      ctx!.beginPath();
      ctx!.moveTo(lx[0], ly[0]);
      for (let i = 1; i < n; i++) ctx!.lineTo(lx[i], ly[i]);
      for (let i = n - 1; i >= 0; i--) ctx!.lineTo(rx[i], ry[i]);
      ctx!.closePath();
      ctx!.fillStyle = grad;
      ctx!.fill();

      const hx = head.x, hy = head.y, nubR = headW * 2.2;
      const nub = ctx!.createRadialGradient(hx, hy, 0, hx, hy, nubR);
      nub.addColorStop(0, 'rgba(255,255,255,0.95)');
      nub.addColorStop(0.3, `rgba(${r},${g},${b},0.75)`);
      nub.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx!.beginPath();
      ctx!.arc(hx, hy, nubR, 0, Math.PI * 2);
      ctx!.fillStyle = nub;
      ctx!.fill();
    }

    let lastTs: number | null = null;
    let animationFrameId: number;

    function tick(ts: number) {
      if (!lastTs) lastTs = ts;
      const dt = Math.min((ts - lastTs) / 1000, 0.05);
      lastTs = ts;
      if (!canvas) return;
      const W = canvas.width, H = canvas.height, cx = W / 2, cy = H / 2;
      ctx!.clearRect(0, 0, W, H);
      
      PLANETS.forEach((p, i) => {
        angles[i] += p.speed * dt;
        const { x, y } = orbitXY(p.orbit as keyof typeof BASE, angles[i]);
        const ax = cx + x, ay = cy + y;
        trails[i].push({ x: ax, y: ay });
        if (trails[i].length > p.trailLen) trails[i].shift();
        drawComet(trails[i], p.r, p.g, p.b, p.headW);
        const el = planetRefs.current[i];
        if (el) {
          el.style.left = ax + 'px';
          el.style.top = ay + 'px';
        }
      });
      animationFrameId = requestAnimationFrame(tick);
    }
    animationFrameId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
    };
  }, []);

  const handlePlanetClick = (category: string) => {
    navigate(`/programs?category=${encodeURIComponent(category)}`);
  };

  return (
    <div ref={containerRef} className="galaxy-container w-full max-w-full h-[340px] sm:h-[480px] md:h-[580px] relative overflow-hidden">
      <canvas ref={canvasRef} id="trailCanvas" className="absolute inset-0 w-full h-full pointer-events-none z-[5]" />
      
      <div ref={r1Ref} className="orbit-path path-inner-1" />
      <div ref={r2Ref} className="orbit-path path-inner-2" />
      <div ref={roRef} className="orbit-path path-outer" />
      
      <div className="z-20 relative flex items-center justify-center" onDoubleClick={() => navigate('/portal')}>
        <Suspense fallback={<div className="w-48 h-48 md:w-56 md:h-56 rounded-full bg-brand-red/15 border border-brand-red/30 animate-pulse" />}>
          <LogoGlobe />
        </Suspense>
      </div>

      {/* PLANETS */}
      {/* 0. Website Development */}
      <div 
        ref={el => { planetRefs.current[0] = el; }}
        className="planet-node text-brand-red border-brand-red hover:bg-brand-red hover:text-white"
        onClick={() => handlePlanetClick('Website Development')}
      >
        <Code />
        <div className="subject-detail">
          <h5>Website Development</h5>
          <p>Learn to build modern, responsive websites and web applications.</p>
        </div>
      </div>

      {/* 1. Digital Literacy */}
      <div 
        ref={el => { planetRefs.current[1] = el; }}
        className="planet-node text-brand-red border-brand-red hover:bg-brand-red hover:text-white"
        onClick={() => handlePlanetClick('Digital Literacy')}
      >
        <Monitor />
        <div className="subject-detail">
          <h5>Digital Literacy</h5>
          <p>Master essential digital skills for the modern workplace.</p>
        </div>
      </div>

      {/* 2. Music */}
      <div 
        ref={el => { planetRefs.current[2] = el; }}
        className="planet-node text-brand-red border-brand-red hover:bg-brand-red hover:text-white"
        onClick={() => handlePlanetClick('Music')}
      >
        <Music />
        <div className="subject-detail">
          <h5>Music</h5>
          <p>Explore music production, theory, and performance.</p>
        </div>
      </div>

      {/* 3. Graphics Designing */}
      <div 
        ref={el => { planetRefs.current[3] = el; }}
        className="planet-node text-white border-white hover:bg-white hover:text-brand-slate"
        onClick={() => handlePlanetClick('Graphics Designing')}
      >
        <Paintbrush />
        <div className="subject-detail">
          <h5>Graphics Designing</h5>
          <p>Create stunning visual designs and digital art.</p>
        </div>
      </div>

      {/* 4. Brand Advertising */}
      <div 
        ref={el => { planetRefs.current[4] = el; }}
        className="planet-node text-white border-white hover:bg-white hover:text-brand-slate"
        onClick={() => handlePlanetClick('Brand Advertising')}
      >
        <Megaphone />
        <div className="subject-detail">
          <h5>Brand Advertising</h5>
          <p>Learn strategies for effective marketing and brand growth.</p>
        </div>
      </div>

      {/* 5. General Knowledge */}
      <div 
        ref={el => { planetRefs.current[5] = el; }}
        className="planet-node text-white border-white hover:bg-white hover:text-brand-slate"
        onClick={() => handlePlanetClick('General Knowledge')}
      >
        <Lightbulb />
        <div className="subject-detail">
          <h5>General Knowledge</h5>
          <p>Expand your understanding across various essential subjects.</p>
        </div>
      </div>
    </div>
  );
};

export default GalaxyOrbit;
