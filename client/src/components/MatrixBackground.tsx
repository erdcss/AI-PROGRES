import { useEffect, useRef } from "react";

const CHARS = "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ$#@%&*";

function createMatrixCanvas(
  canvasRef: React.RefObject<HTMLCanvasElement>,
  options: { fontSize: number; opacity: number; speed: number }
) {
  const canvas = canvasRef.current;
  if (!canvas) return () => {};
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};

  const { fontSize, speed } = options;

  const resize = () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  };
  resize();
  window.addEventListener("resize", resize);

  const cols = Math.floor(window.innerWidth / fontSize);
  const drops: number[] = Array(cols).fill(1).map(() => Math.random() * -50);

  let animFrameId: number;
  let lastTime = 0;

  const draw = (timestamp: number) => {
    animFrameId = requestAnimationFrame(draw);
    if (timestamp - lastTime < speed) return;
    lastTime = timestamp;

    ctx.fillStyle = "rgba(0, 0, 0, 0.05)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = `${fontSize}px monospace`;

    for (let i = 0; i < drops.length; i++) {
      const char = CHARS[Math.floor(Math.random() * CHARS.length)];
      const x = i * fontSize;
      const y = drops[i] * fontSize;

      if (Math.random() > 0.95) {
        ctx.fillStyle = "#ccffcc";
      } else if (drops[i] < 3) {
        ctx.fillStyle = "rgba(180, 255, 180, 0.9)";
      } else {
        const alpha = 0.35 + Math.random() * 0.45;
        ctx.fillStyle = `rgba(0, 220, 60, ${alpha})`;
      }

      ctx.fillText(char, x, y);

      if (y > canvas.height && Math.random() > 0.975) {
        drops[i] = 0;
      }
      drops[i] += 0.5;
    }
  };

  animFrameId = requestAnimationFrame(draw);

  return () => {
    cancelAnimationFrame(animFrameId);
    window.removeEventListener("resize", resize);
  };
}

// Arka katman — siyah arka planlı sayfalarda güçlü görünür
function MatrixBase() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    return createMatrixCanvas(canvasRef, { fontSize: 14, opacity: 0.45, speed: 40 });
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        zIndex: 0,
        pointerEvents: "none",
        opacity: 0.06,
      }}
    />
  );
}

// Üst katman — her sayfada çok ince Matrix overlay
function MatrixOverlay() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    return createMatrixCanvas(canvasRef, { fontSize: 16, opacity: 0.06, speed: 80 });
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        zIndex: 9999,
        pointerEvents: "none",
        opacity: 0.02,
        mixBlendMode: "screen",
      }}
    />
  );
}

export function MatrixBackground() {
  return (
    <>
      <MatrixBase />
      <MatrixOverlay />
    </>
  );
}
