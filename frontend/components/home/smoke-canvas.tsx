"use client";

import { useEffect, useRef } from "react";

import { prefersReducedMotion } from "@/lib/use-in-view";

interface Puff {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  grow: number;
  life: number;
  maxLife: number;
  seed: number;
  /** Which of the three wisps it rises in — the logo's left, centre, right. */
  lane: number;
}

/**
 * Smoke rising off a coal, drawn live.
 *
 * Three columns of soft puffs climb from the ember, swaying on their own slow
 * sine so they braid the way the logo's three wisps do. The pointer is a draft:
 * puffs near it are pushed aside and the column bends around your hand.
 *
 * Canvas 2D with one pre-rendered sprite, so a frame is a few hundred
 * drawImage calls. It stops drawing when scrolled away or the tab is hidden,
 * and with reduced motion it paints a single still frame.
 */
export function SmokeCanvas({
  className = "",
  origin = { x: 0.72, y: 0.86 },
  mobileOrigin = { x: 0.5, y: 0.92 },
}: {
  className?: string;
  /** Where the coal sits, as fractions of the canvas. */
  origin?: { x: number; y: number };
  mobileOrigin?: { x: number; y: number };
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const emberRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ember = emberRef.current;
    if (!canvas || !ember) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const ctx = context;

    // One soft grey disc, drawn once and stamped everywhere.
    const sprite = document.createElement("canvas");
    sprite.width = sprite.height = 128;
    const s = sprite.getContext("2d")!;
    const gradient = s.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, "rgba(214,218,214,0.35)");
    gradient.addColorStop(0.45, "rgba(170,176,172,0.12)");
    gradient.addColorStop(1, "rgba(140,146,142,0)");
    s.fillStyle = gradient;
    s.fillRect(0, 0, 128, 128);

    const puffs: Puff[] = [];
    const pointer = { x: -9999, y: -9999, vx: 0, vy: 0 };
    let width = 0;
    let height = 0;
    let ox = 0;
    let oy = 0;
    let raf = 0;
    let running = false;
    let last = performance.now();

    function resize() {
      const rect = canvas!.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      width = rect.width;
      height = rect.height;
      canvas!.width = Math.round(width * dpr);
      canvas!.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const o = width < 768 ? mobileOrigin : origin;
      ox = o.x * width;
      oy = o.y * height;
      ember!.style.left = `${ox}px`;
      ember!.style.top = `${oy}px`;
    }

    function spawn() {
      const lane = Math.floor(Math.random() * 3);
      puffs.push({
        x: ox + (lane - 1) * 6 + (Math.random() - 0.5) * 4,
        y: oy - 6,
        vx: (lane - 1) * 0.12 + (Math.random() - 0.5) * 0.1,
        vy: -(1.1 + Math.random() * 0.7) * (lane === 1 ? 1.15 : 1),
        size: 6 + Math.random() * 6,
        grow: 0.07 + Math.random() * 0.09,
        life: 0,
        maxLife: 5200 + Math.random() * 3800,
        seed: Math.random() * 1000,
        lane,
      });
    }

    let owed = 0;

    function step(dt: number, time: number) {
      // Puffs per second, not per frame, so a 120Hz screen is no smokier.
      owed += dt * (width < 768 ? 0.05 : 0.08);
      for (; owed >= 1; owed -= 1) if (puffs.length < 700) spawn();

      for (let i = puffs.length - 1; i >= 0; i -= 1) {
        const p = puffs[i];
        p.life += dt;
        if (p.life > p.maxLife || p.y < -120) {
          puffs.splice(i, 1);
          continue;
        }

        // The sway: each lane has its own slow wave, so the columns braid.
        const t = time * 0.0006 + p.seed;
        // Tight off the coal, then wider the higher it climbs — a column that
        // unravels instead of a cone.
        const climb = Math.min((oy - p.y) / 500, 1);
        const sway =
          Math.sin(t + p.lane * 2.1 + p.y * 0.012) * (0.25 + climb * 1.1) + (p.lane - 1) * climb * 0.35;
        p.vx += (sway - p.vx) * 0.03;

        // The draft from the pointer, falling off with distance.
        const dx = p.x - pointer.x;
        const dy = p.y - pointer.y;
        const dist2 = dx * dx + dy * dy;
        if (dist2 < 180 * 180) {
          const force = (1 - Math.sqrt(dist2) / 180) * 0.9;
          const inv = 1 / Math.max(Math.sqrt(dist2), 1);
          p.vx += (dx * inv * force + pointer.vx * 0.02) * dt * 0.06;
          p.vy += (dy * inv * force * 0.4 + pointer.vy * 0.01) * dt * 0.06;
        }

        p.vy += (-1.3 - p.vy) * 0.01;
        p.x += p.vx * dt * 0.06;
        p.y += p.vy * dt * 0.06;
        p.size += p.grow * dt * 0.06;
      }

      pointer.vx *= 0.9;
      pointer.vy *= 0.9;
    }

    function draw() {
      ctx.clearRect(0, 0, width, height);
      for (const p of puffs) {
        const k = p.life / p.maxLife;
        // Fade in fast off the coal, then thin out slowly as it climbs.
        const alpha = Math.min(k * 10, 1) * Math.pow(1 - k, 1.6) * 0.5;
        if (alpha <= 0.01) continue;
        ctx.globalAlpha = alpha;
        const d = p.size * 2;
        ctx.drawImage(sprite, p.x - p.size, p.y - p.size, d, d);
      }
      ctx.globalAlpha = 1;
    }

    function frame(now: number) {
      const dt = Math.min(now - last, 48);
      last = now;
      step(dt, now);
      draw();
      raf = requestAnimationFrame(frame);
    }

    function start() {
      if (running) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }

    function stop() {
      running = false;
      cancelAnimationFrame(raf);
    }

    resize();

    if (prefersReducedMotion()) {
      // Run the simulation forward off-screen and paint the result once.
      for (let t = 0; t < 900; t += 1) step(16, t * 16);
      draw();
      window.addEventListener("resize", resize);
      return () => window.removeEventListener("resize", resize);
    }

    const onMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      if (pointer.x > -9000) {
        pointer.vx = x - pointer.x;
        pointer.vy = y - pointer.y;
      }
      pointer.x = x;
      pointer.y = y;
    };
    const onLeave = () => {
      pointer.x = pointer.y = -9999;
    };

    let onScreen = false;
    const sync = () => (onScreen && !document.hidden ? start() : stop());
    const visibility = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      sync();
    });
    visibility.observe(canvas);
    const onVisibility = sync;

    // The canvas itself lets clicks through, so the draft is read off the
    // section it sits in.
    const host: HTMLElement = canvas.closest("section") ?? document.body;
    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerleave", onLeave);
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stop();
      visibility.disconnect();
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // The origins are layout constants per mount; re-running on identity
    // changes would restart the smoke on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div aria-hidden className={`pointer-events-none absolute inset-0 ${className}`}>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <span
        ref={emberRef}
        className="ember absolute block size-3.5 -translate-x-1/2 -translate-y-1/2"
      />
    </div>
  );
}
