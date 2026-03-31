'use client';

import Image from 'next/image';
import Link from 'next/link';
import {
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

const FRAME_COUNT = 120;
const PARTICLE_SEEDS = Array.from({ length: 34 }, (_, index) => ({
  angle: (Math.PI * 2 * index) / 34,
  radius: 0.45 + (index % 6) * 0.1,
  drift: 14 + (index % 7) * 4.6,
  size: 1.6 + (index % 4) * 0.65,
  speed: 0.7 + (index % 5) * 0.16,
}));

function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function lerp(start: number, end: number, amount: number) {
  return start + (end - start) * amount;
}

function easeInOut(value: number) {
  return value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

function preloadImage(src: string) {
  return new Promise<void>((resolve, reject) => {
    const image = new window.Image();
    image.onload = async () => {
      try {
        await image.decode();
      } catch {
        // Older browsers can throw on decode while still having the image ready.
      }
      resolve();
    };
    image.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    image.src = src;
  });
}

function drawRat(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  opacity: number,
  stride: number,
  rotation: number,
) {
  if (opacity <= 0) {
    return;
  }

  context.save();
  context.translate(x, y);
  context.rotate(rotation);
  context.scale(scale, scale);
  context.globalAlpha = opacity;

  const bodyGradient = context.createLinearGradient(-48, -18, 52, 22);
  bodyGradient.addColorStop(0, 'rgba(18, 27, 38, 0.98)');
  bodyGradient.addColorStop(0.6, 'rgba(43, 62, 89, 0.98)');
  bodyGradient.addColorStop(1, 'rgba(36, 74, 106, 0.94)');

  context.fillStyle = bodyGradient;
  context.beginPath();
  context.ellipse(0, 0, 54, 28, 0.08, 0, Math.PI * 2);
  context.fill();

  context.beginPath();
  context.ellipse(44, -6, 23, 18, -0.22, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = 'rgba(255, 255, 255, 0.16)';
  context.beginPath();
  context.ellipse(48, -10, 4, 3.6, 0, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = 'rgba(255, 255, 255, 0.12)';
  context.beginPath();
  context.arc(36, -24, 7.5, 0, Math.PI * 2);
  context.arc(52, -20, 6.8, 0, Math.PI * 2);
  context.fill();

  context.strokeStyle = 'rgba(214, 228, 241, 0.28)';
  context.lineWidth = 2.8;
  context.lineCap = 'round';
  context.beginPath();
  context.moveTo(-46, -5);
  context.bezierCurveTo(-90, -16, -120, -32, -160, -18);
  context.stroke();

  context.strokeStyle = 'rgba(255, 255, 255, 0.14)';
  context.lineWidth = 3.2;
  context.beginPath();
  context.moveTo(-24, 14);
  context.lineTo(-18 + stride * 5, 34 - Math.abs(stride) * 2);
  context.moveTo(-4, 16);
  context.lineTo(6 - stride * 4, 36 - Math.abs(stride) * 2);
  context.moveTo(22, 14);
  context.lineTo(28 + stride * 4, 35 - Math.abs(stride) * 3);
  context.moveTo(40, 12);
  context.lineTo(48 - stride * 5, 32 - Math.abs(stride) * 3);
  context.stroke();

  context.restore();
}

function drawComputer(
  context: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  scale: number,
  glowStrength: number,
  logoStrength: number,
) {
  const monitorWidth = 302 * scale;
  const monitorHeight = 192 * scale;
  const baseX = screenX - monitorWidth / 2;
  const baseY = screenY - monitorHeight / 2;

  context.save();

  const shellGradient = context.createLinearGradient(baseX, baseY, baseX + monitorWidth, baseY + monitorHeight);
  shellGradient.addColorStop(0, 'rgba(18, 28, 43, 0.95)');
  shellGradient.addColorStop(1, 'rgba(42, 68, 99, 0.92)');
  context.fillStyle = shellGradient;
  context.strokeStyle = 'rgba(255,255,255,0.08)';
  context.lineWidth = 1.5;
  context.beginPath();
  context.roundRect(baseX, baseY, monitorWidth, monitorHeight, 24 * scale);
  context.fill();
  context.stroke();

  const screenPadding = 18 * scale;
  const innerX = baseX + screenPadding;
  const innerY = baseY + screenPadding;
  const innerWidth = monitorWidth - screenPadding * 2;
  const innerHeight = monitorHeight - screenPadding * 2;

  const screenGradient = context.createRadialGradient(
    screenX,
    screenY - 10 * scale,
    20 * scale,
    screenX,
    screenY,
    190 * scale,
  );
  screenGradient.addColorStop(0, `rgba(255, 255, 255, ${0.12 + glowStrength * 0.44})`);
  screenGradient.addColorStop(0.55, `rgba(198, 224, 244, ${0.08 + glowStrength * 0.12})`);
  screenGradient.addColorStop(1, 'rgba(25, 40, 60, 0.92)');
  context.fillStyle = screenGradient;
  context.beginPath();
  context.roundRect(innerX, innerY, innerWidth, innerHeight, 18 * scale);
  context.fill();

  context.strokeStyle = `rgba(255,255,255,${0.09 + glowStrength * 0.22})`;
  context.lineWidth = 1;
  for (let index = 0; index < 8; index += 1) {
    const lineY = innerY + 16 * scale + index * 18 * scale;
    context.beginPath();
    context.moveTo(innerX + 18 * scale, lineY);
    context.lineTo(innerX + innerWidth - 22 * scale, lineY);
    context.stroke();
  }

  context.fillStyle = 'rgba(205, 221, 235, 0.18)';
  context.beginPath();
  context.roundRect(screenX - 28 * scale, baseY + monitorHeight + 12 * scale, 56 * scale, 42 * scale, 16 * scale);
  context.fill();
  context.beginPath();
  context.roundRect(screenX - 88 * scale, baseY + monitorHeight + 46 * scale, 176 * scale, 13 * scale, 10 * scale);
  context.fill();

  if (glowStrength > 0) {
    const halo = context.createRadialGradient(screenX, screenY, 40 * scale, screenX, screenY, 240 * scale);
    halo.addColorStop(0, `rgba(255,255,255,${0.14 + glowStrength * 0.2})`);
    halo.addColorStop(0.55, `rgba(95, 150, 198, ${0.08 + glowStrength * 0.12})`);
    halo.addColorStop(1, 'rgba(44, 66, 97, 0)');
    context.fillStyle = halo;
    context.beginPath();
    context.arc(screenX, screenY, 240 * scale, 0, Math.PI * 2);
    context.fill();
  }

  if (logoStrength > 0) {
    context.strokeStyle = `rgba(255,255,255,${logoStrength * 0.5})`;
    context.lineWidth = 2.2 * scale;
    const squareSize = 40 * scale + logoStrength * 26 * scale;
    context.strokeRect(screenX - squareSize / 2, screenY - squareSize / 2, squareSize, squareSize);
  }

  context.restore();
}

function drawParticles(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  dissolve: number,
  reveal: number,
) {
  if (dissolve <= 0 && reveal <= 0) {
    return;
  }

  context.save();

  PARTICLE_SEEDS.forEach((particle, index) => {
    const travel = dissolve > 0
      ? dissolve * particle.drift * 24 * scale
      : reveal * particle.radius * 180 * scale;
    const direction = particle.angle + reveal * 0.45 + index * 0.03;
    const px = x + Math.cos(direction) * travel;
    const py = y + Math.sin(direction) * travel * (0.8 + particle.speed * 0.2);
    const alpha = dissolve > 0 ? (1 - dissolve) * 0.6 : reveal * 0.45;

    context.fillStyle =
      index % 4 === 0
        ? `rgba(255,255,255,${alpha})`
        : `rgba(126, 170, 208, ${alpha * 0.9})`;
    context.beginPath();
    context.arc(px, py, particle.size * scale * (0.8 + dissolve + reveal), 0, Math.PI * 2);
    context.fill();
  });

  context.restore();
}

function drawScene(context: CanvasRenderingContext2D, width: number, height: number, progress: number) {
  context.clearRect(0, 0, width, height);
  context.fillStyle = '#2C4261';
  context.fillRect(0, 0, width, height);

  const vignette = context.createRadialGradient(
    width * 0.56,
    height * 0.44,
    30,
    width * 0.52,
    height * 0.5,
    Math.max(width, height) * 0.8,
  );
  vignette.addColorStop(0, 'rgba(76, 110, 148, 0.10)');
  vignette.addColorStop(0.45, 'rgba(44, 66, 97, 0.24)');
  vignette.addColorStop(1, 'rgba(16, 27, 42, 0.76)');
  context.fillStyle = vignette;
  context.fillRect(0, 0, width, height);

  const gridOpacity = clamp(0.08 - progress * 0.04, 0.025, 0.08);
  context.strokeStyle = `rgba(255,255,255,${gridOpacity})`;
  context.lineWidth = 1;
  for (let x = 0; x <= width; x += 64) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  }
  for (let y = 0; y <= height; y += 64) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }

  const scale = Math.min(width / 1440, height / 960);
  const groundY = height * 0.72;
  const screenX = width * (width < 900 ? 0.57 : 0.67);
  const screenY = height * 0.46;
  const glowStrength = clamp((progress - 0.24) / 0.34) * 0.9 + clamp((progress - 0.72) / 0.14) * 0.5;
  const logoStrength = clamp((progress - 0.84) / 0.16);

  context.save();
  context.strokeStyle = 'rgba(255,255,255,0.12)';
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(width * 0.05, groundY + 56 * scale);
  context.lineTo(width * 0.95, groundY + 56 * scale);
  context.stroke();
  context.restore();

  drawComputer(context, screenX, screenY, scale, glowStrength, logoStrength);

  let ratX = screenX - 280 * scale;
  let ratY = groundY + 22 * scale;
  let ratScale = 1;
  let ratOpacity = 1;
  let ratRotation = 0;

  if (progress <= 0.55) {
    const runT = clamp(progress / 0.55);
    const eased = easeInOut(runT);
    ratX = lerp(-260 * scale, screenX - 180 * scale, eased);
    ratY = groundY + Math.sin(progress * 42) * 6 * scale;
    ratRotation = Math.sin(progress * 18) * 0.02;
  } else if (progress <= 0.72) {
    const jumpT = clamp((progress - 0.55) / 0.17);
    const eased = easeInOut(jumpT);
    ratX = lerp(screenX - 180 * scale, screenX - 8 * scale, eased);
    ratY = lerp(groundY, screenY + 30 * scale, eased) - Math.sin(jumpT * Math.PI) * 165 * scale;
    ratScale = lerp(1, 0.74, eased);
    ratRotation = lerp(-0.08, 0.4, eased);
  } else if (progress <= 0.88) {
    const dissolveT = clamp((progress - 0.72) / 0.16);
    ratX = lerp(screenX - 8 * scale, screenX + 14 * scale, dissolveT);
    ratY = lerp(screenY - 8 * scale, screenY + 8 * scale, dissolveT);
    ratScale = lerp(0.74, 0.18, dissolveT);
    ratOpacity = 1 - dissolveT;
    ratRotation = lerp(0.4, 0.9, dissolveT);
  } else {
    ratOpacity = 0;
  }

  const stride = Math.sin(progress * 70);
  drawRat(context, ratX, ratY, 1.05 * scale * ratScale, ratOpacity, stride, ratRotation);

  const dissolveAmount = progress > 0.72 && progress <= 0.88 ? clamp((progress - 0.72) / 0.16) : 0;
  const revealAmount = progress > 0.86 ? clamp((progress - 0.86) / 0.14) : 0;
  drawParticles(context, screenX, screenY, scale, dissolveAmount, revealAmount);

  if (progress > 0.9) {
    const pulse = clamp((progress - 0.9) / 0.1);
    const aura = context.createRadialGradient(screenX, screenY, 30, screenX, screenY, 300 * scale);
    aura.addColorStop(0, `rgba(255,255,255,${0.15 + pulse * 0.2})`);
    aura.addColorStop(0.45, `rgba(141, 182, 215, ${0.10 + pulse * 0.16})`);
    aura.addColorStop(1, 'rgba(44,66,97,0)');
    context.fillStyle = aura;
    context.beginPath();
    context.arc(screenX, screenY, 300 * scale, 0, Math.PI * 2);
    context.fill();
  }
}

function Beat({
  progress,
  start,
  end,
  title,
  subtitle,
  align,
}: {
  progress: ReturnType<typeof useSpring>;
  start: number;
  end: number;
  title: string;
  subtitle: string;
  align: 'left' | 'center' | 'right';
}) {
  const fadeRange = (end - start) * 0.12;
  const opacity = useTransform(progress, [start, start + fadeRange, end - fadeRange, end], [0, 1, 1, 0]);
  const y = useTransform(progress, [start, start + fadeRange, end - fadeRange, end], [20, 0, 0, -20]);

  const alignmentClass =
    align === 'left'
      ? 'items-start text-left'
      : align === 'right'
        ? 'items-end text-right'
        : 'items-center text-center';

  return (
    <motion.div
      style={{ opacity, y }}
      className={`pointer-events-none absolute inset-x-0 top-0 flex h-full px-6 sm:px-10 lg:px-16 ${alignmentClass}`}
    >
      <div className="mt-[16vh] max-w-[24rem] sm:max-w-[32rem] lg:mt-[18vh]">
        <p className="mb-4 text-[0.68rem] font-semibold uppercase tracking-[0.34em] text-white/48 sm:text-xs">
          Remi Sequence
        </p>
        <h2 className="font-display text-[3.6rem] leading-[0.88] tracking-hero text-white sm:text-[5.3rem] lg:text-[7rem] xl:text-[8.4rem]">
          {title}
        </h2>
        <p className="mt-5 max-w-xl text-base leading-7 text-white/68 sm:text-lg">
          {subtitle}
        </p>
      </div>
    </motion.div>
  );
}

function ReducedMotionHero() {
  return (
    <section className="relative isolate overflow-hidden bg-remi-dark pb-24 pt-36 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_62%_36%,rgba(255,255,255,0.22),transparent_0),linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0))]" />
      <div className="absolute right-[-8%] top-24 h-[24rem] w-[24rem] rounded-full bg-white/8 blur-3xl sm:h-[30rem] sm:w-[30rem]" />
      <div className="relative mx-auto flex max-w-[1280px] flex-col gap-12 px-6 sm:px-10 lg:flex-row lg:items-center lg:px-16">
        <div className="max-w-2xl">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.34em] text-white/52">Remi</p>
          <h1 className="font-display text-6xl leading-[0.9] tracking-hero text-white sm:text-7xl lg:text-[6.6rem]">
            Operational memory for fast-moving teams.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-white/72">
            Remi reconstructs the missing owner, blocker, and next step across Slack, Jira, and email.
          </p>
          <div className="mt-10 flex flex-wrap gap-4">
            <Link
              href="/contact"
              className="rounded-full bg-white px-6 py-3 text-sm font-semibold text-remi-blue transition hover:-translate-y-0.5"
            >
              Request a demo
            </Link>
            <Link
              href="/#how-it-works"
              className="rounded-full border border-white/18 px-6 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-white/10"
            >
              See how it works
            </Link>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-[30rem]">
          <div className="absolute inset-0 rounded-[2.5rem] bg-white/10 blur-3xl" />
          <div className="relative rounded-[2rem] border border-white/10 bg-white/6 p-6 shadow-glow backdrop-blur-xl">
            <div className="rounded-[1.6rem] border border-white/10 bg-[#1B3048] p-5">
              <div className="rounded-[1.2rem] bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.28),rgba(255,255,255,0.04)_60%,transparent)] p-10">
                <div className="mx-auto flex h-40 w-40 items-center justify-center rounded-[2rem] border border-white/16 bg-white/10">
                  <Image
                    src="/brand/remi-light-mark.png"
                    alt="Remi mark"
                    width={100}
                    height={100}
                    className="h-auto w-20"
                  />
                </div>
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-white/62">
              Motion-reduced mode shows a still hero while preserving the same message and conversion path.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function RatIntoRemiSequence() {
  const shouldReduceMotion = useReducedMotion();
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  const sizeRef = useRef({ width: 0, height: 0, dpr: 1 });
  const progressRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const [loadingProgress, setLoadingProgress] = useState(0.08);
  const [ready, setReady] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [assetsReady, setAssetsReady] = useState(false);

  const { scrollYProgress } = useScroll({
    target: wrapperRef,
    offset: ['start start', 'end end'],
  });

  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
  });

  const indicatorOpacity = useTransform(smoothProgress, [0, 0.06, 0.1], [1, 1, 0]);
  const indicatorY = useTransform(smoothProgress, [0, 0.1], [0, 14]);
  const logoOpacity = useTransform(smoothProgress, [0.84, 0.92, 1], [0, 1, 1]);
  const logoScale = useTransform(smoothProgress, [0.84, 0.92, 1], [0.82, 1, 1]);
  const wordmarkOpacity = useTransform(smoothProgress, [0.9, 0.95, 1], [0, 1, 1]);
  const ctaOpacity = useTransform(smoothProgress, [0.92, 0.97, 1], [0, 1, 1]);

  useEffect(() => {
    if (shouldReduceMotion) {
      return;
    }

    let isActive = true;

    const setupCanvas = () => {
      const canvas = canvasRef.current;
      if (!canvas) {
        return false;
      }

      const width = window.innerWidth;
      const height = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      const context = canvas.getContext('2d');
      if (!context) {
        return false;
      }

      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      contextRef.current = context;
      sizeRef.current = { width, height, dpr };
      drawScene(context, width, height, progressRef.current);
      return true;
    };

    const runSetup = async () => {
      try {
        const assetPromises = [
          preloadImage('/brand/remi-light-wordmark.png'),
          preloadImage('/brand/remi-light-mark.png'),
          preloadImage('/brand/remi-dark-wordmark.png'),
        ];

        await Promise.all(
          assetPromises.map(async (promise, index) => {
            await promise;
            if (isActive) {
              setLoadingProgress(0.18 + (index + 1) * 0.16);
            }
          }),
        );

        setAssetsReady(true);
        setLoadingProgress(0.66);

        if ('fonts' in document) {
          await document.fonts.ready;
        }

        if (!isActive) {
          return;
        }

        setLoadingProgress(0.82);
        setupCanvas();
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => resolve());
        });

        if (!isActive) {
          return;
        }

        setLoadingProgress(1);
        window.setTimeout(() => {
          if (isActive) {
            setReady(true);
          }
        }, 220);
      } catch {
        if (!isActive) {
          return;
        }

        setupCanvas();
        setAssetsReady(true);
        setLoadingProgress(1);
        setReady(true);
      }
    };

    runSetup();

    return () => {
      isActive = false;
    };
  }, [shouldReduceMotion]);

  useEffect(() => {
    if (shouldReduceMotion) {
      return;
    }

    const resizeCanvas = () => {
      const canvas = canvasRef.current;
      if (!canvas) {
        return;
      }

      const width = window.innerWidth;
      const height = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      const context = contextRef.current ?? canvas.getContext('2d');
      if (!context) {
        return;
      }

      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      contextRef.current = context;
      sizeRef.current = { width, height, dpr };
      drawScene(context, width, height, progressRef.current);
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    if ('ResizeObserver' in window && canvasRef.current?.parentElement) {
      resizeObserverRef.current = new ResizeObserver(() => {
        resizeCanvas();
      });
      resizeObserverRef.current.observe(canvasRef.current.parentElement);
    }

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }

      if (contextRef.current) {
        contextRef.current.clearRect(0, 0, sizeRef.current.width, sizeRef.current.height);
      }
    };
  }, [shouldReduceMotion]);

  useMotionValueEvent(smoothProgress, 'change', (latest) => {
    if (shouldReduceMotion || !contextRef.current) {
      return;
    }

    const clamped = clamp(latest);
    progressRef.current = clamped;
    setCurrentFrame(Math.min(FRAME_COUNT - 1, Math.floor(clamped * FRAME_COUNT)));

    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }

    rafRef.current = requestAnimationFrame(() => {
      const context = contextRef.current;
      if (!context) {
        return;
      }

      drawScene(context, sizeRef.current.width, sizeRef.current.height, progressRef.current);
    });
  });

  if (shouldReduceMotion) {
    return <ReducedMotionHero />;
  }

  return (
    <section ref={wrapperRef} className="relative h-[400vh] bg-remi-dark text-white">
      <div className="sticky top-0 h-screen overflow-hidden">
        <div className="absolute inset-0 bg-hero-grid bg-[size:64px_64px] opacity-[0.16]" />
        <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-[#1B3048]/35 to-transparent" />

        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-screen w-full"
          aria-hidden="true"
        />

        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_62%_34%,rgba(255,255,255,0.18),transparent_16%),linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0))]" />

        <div className="pointer-events-none absolute inset-0">
          <Beat
            progress={smoothProgress}
            start={0}
            end={0.2}
            title="Context Runs Wild"
            subtitle="Critical detail slips between Slack, Jira, and email before anyone can catch it."
            align="center"
          />
          <Beat
            progress={smoothProgress}
            start={0.25}
            end={0.45}
            title="Signals Scatter"
            subtitle="A simple ticket hides the real blocker, ownership shift, and side-thread reasoning."
            align="left"
          />
          <Beat
            progress={smoothProgress}
            start={0.5}
            end={0.7}
            title="Remi Reconstructs"
            subtitle="The missing trail gets pulled back into one operational view with a clear next step."
            align="right"
          />
          <Beat
            progress={smoothProgress}
            start={0.75}
            end={0.95}
            title="Operational Memory"
            subtitle="Recover the owner, blocker, and next step."
            align="center"
          />
        </div>

        <motion.div
          style={{ opacity: logoOpacity, scale: logoScale }}
          className="absolute inset-x-0 top-[56%] z-10 flex -translate-y-1/2 flex-col items-center px-6 text-center"
        >
          <div className="rounded-[2rem] border border-white/14 bg-white/8 p-4 shadow-glow backdrop-blur-md">
            <Image
              src="/brand/remi-light-mark.png"
              alt="Remi mark"
              width={128}
              height={128}
              priority={assetsReady}
              className="h-auto w-20 sm:w-24 lg:w-28"
            />
          </div>
          <motion.div style={{ opacity: wordmarkOpacity }} className="mt-6">
            <Image
              src="/brand/remi-light-wordmark.png"
              alt="Remi"
              width={360}
              height={92}
              priority={assetsReady}
              className="mx-auto h-auto w-[11rem] sm:w-[14rem] lg:w-[18rem]"
            />
          </motion.div>
          <motion.div style={{ opacity: ctaOpacity }} className="mt-7 flex flex-wrap justify-center gap-3">
            <Link
              href="/contact"
              className="pointer-events-auto rounded-full bg-white px-5 py-3 text-sm font-semibold text-remi-blue transition hover:-translate-y-0.5"
            >
              Request a demo
            </Link>
            <Link
              href="/#proof"
              className="pointer-events-auto rounded-full border border-white/16 px-5 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-white/10"
            >
              See the proof
            </Link>
          </motion.div>
        </motion.div>

        <div className="absolute left-6 top-28 hidden rounded-full border border-white/12 bg-white/7 px-4 py-2 text-xs uppercase tracking-[0.32em] text-white/52 md:block">
          Frame {String(currentFrame + 1).padStart(3, '0')} / {FRAME_COUNT}
        </div>

        <motion.div
          style={{ opacity: indicatorOpacity, y: indicatorY }}
          className="absolute bottom-10 left-1/2 flex -translate-x-1/2 flex-col items-center gap-3 text-center text-[0.68rem] uppercase tracking-[0.34em] text-white/52"
        >
          <span>Scroll to explore</span>
          <span className="h-14 w-px bg-gradient-to-b from-white/60 to-transparent" />
        </motion.div>

        <motion.div
          initial={false}
          animate={{ opacity: ready ? 0 : 1, pointerEvents: ready ? 'none' : 'auto' }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
          className="absolute inset-0 z-20 flex items-center justify-center bg-remi-dark"
        >
          <div className="w-full max-w-sm px-8 text-center">
            <div className="mx-auto mb-8 h-12 w-12 animate-spin rounded-full border border-white/15 border-t-white/75" />
            <p className="mb-2 text-xs uppercase tracking-[0.36em] text-white/46">Preparing the sequence</p>
            <p className="text-sm leading-6 text-white/64">
              Loading the brand marks, fonts, and the first frame before the story begins.
            </p>
            <div className="mt-8 h-1.5 overflow-hidden rounded-full bg-white/10">
              <motion.div
                className="h-full rounded-full bg-white"
                animate={{ width: `${Math.round(loadingProgress * 100)}%` }}
                transition={{ ease: 'easeOut', duration: 0.35 }}
              />
            </div>
            <div className="mt-3 text-[0.68rem] uppercase tracking-[0.3em] text-white/44">
              {Math.round(loadingProgress * 100)}%
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
