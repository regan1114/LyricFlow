import type {
  FireflyParticle,
  SnowParticle,
  FireworkParticle,
  LightLeak,
  DriftSeed,
} from './particleTypes';

export const spawnFirefly = (particles: FireflyParticle[], width: number, height: number) => {
  particles.push({
    x: Math.random() * width,
    y: height * 0.25 + Math.random() * height * 0.65,
    seed: Math.random() * Math.PI * 2,
    seed2: Math.random() * Math.PI * 2,
    speed: 0.3 + Math.random() * 0.4,
    size: 1.5 + Math.random() * 2,
    life: 1,
    glowPhase: Math.random() * Math.PI * 2,
  });
};
export const drawFireflies = (
  context: CanvasRenderingContext2D,
  particles: FireflyParticle[],
  time: number,
  width: number,
  height: number,
  step = 1,
) => {
  context.save();
  context.globalCompositeOperation = `lighter`;
  const survivors = particles.filter((particle) => {
    particle.x += Math.sin(time * particle.speed + particle.seed) * 0.6 * step;
    particle.y += (Math.cos(time * particle.speed * 0.8 + particle.seed2) * 0.4 - 0.05) * step;
    const pulseAlpha = 0.35 + 0.65 * Math.max(0, Math.sin(time * 1.5 + particle.glowPhase));
    context.globalAlpha = Math.max(0, Math.min(1, pulseAlpha * particle.life));
    const gradient = context.createRadialGradient(
      particle.x,
      particle.y,
      0,
      particle.x,
      particle.y,
      particle.size * 4,
    );
    gradient.addColorStop(0, `rgba(255, 244, 190, 0.9)`);
    gradient.addColorStop(1, `rgba(255, 244, 190, 0)`);
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(particle.x, particle.y, particle.size * 4, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = `#fff9e0`;
    context.beginPath();
    context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
    context.fill();
    particle.life -= 0.0015 * step;
    return (
      particle.life > 0 &&
      particle.x > -20 &&
      particle.x < width + 20 &&
      particle.y > -20 &&
      particle.y < height + 20
    );
  });
  context.restore();
  return survivors;
};
export const spawnSnowflake = (particles: SnowParticle[], width: number) => {
  particles.push({
    x: Math.random() * width,
    y: -10,
    vy: 0.6 + Math.random() * 1.2,
    vx: (Math.random() - 0.5) * 0.3,
    size: 1 + Math.random() * 2.5,
    drift: Math.random() * Math.PI * 2,
    alpha: 0.4 + Math.random() * 0.5,
  });
};
export const drawSnow = (
  context: CanvasRenderingContext2D,
  particles: SnowParticle[],
  time: number,
  height: number,
  step = 1,
) => {
  context.save();
  const survivors = particles.filter((particle) => {
    particle.x += (particle.vx + Math.sin(time + particle.drift) * 0.3) * step;
    particle.y += particle.vy * step;
    context.globalAlpha = particle.alpha;
    context.fillStyle = `#ffffff`;
    context.shadowBlur = 4;
    context.shadowColor = `rgba(255,255,255,0.8)`;
    context.beginPath();
    context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
    context.fill();
    return particle.y < height + 20;
  });
  context.restore();
  return survivors;
};
export const spawnLightLeak = (leaks: LightLeak[], time: number, color: string) => {
  leaks.push({
    angle: -0.5 + Math.random() * 0.4,
    startTime: time,
    duration: 3 + Math.random() * 1.5,
    color,
    band: 0.18 + Math.random() * 0.12,
  });
};
export const drawLightLeaks = (
  context: CanvasRenderingContext2D,
  leaks: LightLeak[],
  time: number,
  width: number,
  height: number,
) => {
  context.save();
  context.globalCompositeOperation = `screen`;
  const activeLeaks = leaks.filter((leak) => {
    const progress = (time - leak.startTime) / leak.duration;
    if (progress >= 1) {
      return false;
    }
    const opacity = Math.sin(Math.min(1, Math.max(0, progress)) * Math.PI);
    const diagonal = Math.hypot(width, height);
    const offsetX = -diagonal * 0.2 + progress * diagonal * 1.4;
    context.save();
    context.translate(offsetX, height * 0.5);
    context.rotate(leak.angle);
    const bandWidth = diagonal * leak.band;
    const gradient = context.createLinearGradient(-bandWidth, 0, bandWidth, 0);
    gradient.addColorStop(0, `rgba(255,255,255,0)`);
    gradient.addColorStop(0.5, leak.color);
    gradient.addColorStop(1, `rgba(255,255,255,0)`);
    context.globalAlpha = opacity * 0.5;
    context.fillStyle = gradient;
    context.fillRect(-bandWidth, -diagonal, bandWidth * 2, diagonal * 2);
    context.restore();
    return true;
  });
  context.restore();
  return activeLeaks;
};
export const confettiColors = [`#ffffff`, `#ffd700`, `#ff6b6b`, `#4ecdc4`, `#a855f7`, `#f59e0b`];
export const spawnFireworks = (particles: FireworkParticle[], x: number, y: number) => {
  const count = 40 + Math.floor(Math.random() * 20);
  for (let index = 0; index < count; index++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 3 + Math.random() * 9;
    const isConfetti = Math.random() > 0.55;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      color: confettiColors[Math.floor(Math.random() * confettiColors.length)],
      size: isConfetti ? 4 + Math.random() * 4 : 1.5 + Math.random() * 2.5,
      isConfetti,
      rot: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.3,
    });
  }
};
export const drawFireworks = (
  context: CanvasRenderingContext2D,
  particles: FireworkParticle[],
  step = 1,
) => {
  context.save();
  context.globalCompositeOperation = `lighter`;
  const survivors = particles.filter((particle) => {
    particle.x += particle.vx * step;
    particle.y += particle.vy * step + 0.06 * step * step;
    particle.vy += 0.12 * step;
    particle.rot += particle.spin * step;
    particle.life -= 0.014 * step;
    return particle.life <= 0
      ? false
      : (context.save(),
        (context.globalAlpha = Math.max(0, Math.min(1, particle.life))),
        particle.isConfetti
          ? (context.translate(particle.x, particle.y),
            context.rotate(particle.rot),
            (context.fillStyle = particle.color),
            context.fillRect(
              -particle.size / 2,
              -particle.size / 3,
              particle.size,
              particle.size / 1.5,
            ))
          : ((context.fillStyle = particle.color),
            (context.shadowBlur = 8),
            (context.shadowColor = particle.color),
            context.beginPath(),
            context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2),
            context.fill()),
        context.restore(),
        true);
  });
  context.restore();
  return survivors;
};
export const ensureDriftSeeds = (seeds: DriftSeed[], count: number) => {
  for (; seeds.length < count;)
    seeds.push({
      phase: Math.random() * Math.PI * 2,
      speed: 0.15 + Math.random() * 0.2,
      y: Math.random(),
      scale: 0.7 + Math.random() * 0.6,
      hue: Math.random(),
    });
  seeds.length = count;
};
export const drawFog = (
  context: CanvasRenderingContext2D,
  seeds: DriftSeed[],
  time: number,
  width: number,
  height: number,
) => {
  ensureDriftSeeds(seeds, 3);
  context.save();
  context.globalCompositeOperation = `lighter`;
  seeds.forEach((seed, index) => {
    const centerX =
      ((time * seed.speed * 30 + seed.phase * 200 + index * width * 0.4) % (width + 600)) - 300;
    const centerY = height * (0.72 + seed.y * 0.2);
    const radiusX = width * 0.35 * seed.scale;
    const radiusY = height * 0.12 * seed.scale;
    const gradient = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, radiusX);
    gradient.addColorStop(0, `rgba(220, 225, 235, 0.10)`);
    gradient.addColorStop(1, `rgba(220, 225, 235, 0)`);
    context.fillStyle = gradient;
    context.beginPath();
    context.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
    context.fill();
  });
  context.restore();
};
export const auroraColors = [`#22d3ee`, `#a855f7`, `#34d399`, `#818cf8`];
export const drawAurora = (
  context: CanvasRenderingContext2D,
  seeds: DriftSeed[],
  time: number,
  width: number,
  height: number,
) => {
  ensureDriftSeeds(seeds, 4);
  context.save();
  context.globalCompositeOperation = `screen`;
  seeds.forEach((seed, seedIndex) => {
    const baseX = ((seedIndex + 0.5) / seeds.length) * width;
    context.beginPath();
    for (let index = 0; index <= 24; index++) {
      const progress = index / 24;
      const pointY = progress * height * 0.55;
      const pointX =
        baseX + Math.sin(progress * 3 + time * seed.speed + seed.phase) * 90 * seed.scale;
      if (index === 0) {
        context.moveTo(pointX, pointY);
      } else {
        context.lineTo(pointX, pointY);
      }
    }
    const gradient = context.createLinearGradient(baseX, 0, baseX, height * 0.55);
    const auroraColor =
      auroraColors[Math.floor(seed.hue * auroraColors.length) % auroraColors.length];
    gradient.addColorStop(0, `rgba(0,0,0,0)`);
    gradient.addColorStop(0.5, auroraColor);
    gradient.addColorStop(1, `rgba(0,0,0,0)`);
    context.strokeStyle = gradient;
    context.lineWidth = 60 * seed.scale;
    context.globalAlpha = 0.16;
    context.stroke();
  });
  context.restore();
};
export const phoneticCharacters =
  `ㄅㄆㄇㄈㄉㄊㄋㄌㄍㄎㄏㄐㄑㄒㄓㄔㄕㄖㄗㄘㄙㄧㄨㄩㄚㄛㄜㄝㄞㄟㄠㄡㄢㄣㄤㄥㄦˊˇˋ˙`.split(``);
