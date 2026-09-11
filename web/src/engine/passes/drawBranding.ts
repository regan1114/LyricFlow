import { withAlpha } from '../colors';
import { emissionCount, smoothingFactor } from '../animation';
import type { RenderFrame } from '../frame';
import type { RenderRuntime } from '../renderer';
export function drawBranding(frame: RenderFrame, runtime: RenderRuntime) {
  const {
    zhuyinParticles,
    context,
    stateRef,
    sakuraParticles,
    smoothFooterRef,
    logoImgRef,
    logoVideoRef,
  } = runtime;
  zhuyinParticles.current = zhuyinParticles.current.filter((particle) => {
    particle.x += (isNaN(particle.vx) ? 0 : particle.vx) * frame.frameStep;
    particle.y += (isNaN(particle.vy) ? 0 : particle.vy) * frame.frameStep;
    particle.life -= 0.01 * frame.frameStep;
    context.save();
    context.globalAlpha = Math.max(0, Math.min(1, particle.life));
    context.textAlign = `center`;
    context.textBaseline = `middle`;
    context.fillStyle = `rgba(255, 255, 255, 0.85)`;
    context.shadowBlur = 15;
    context.shadowColor = frame.themeColor;
    context.font = `400 ${Math.max(1, 56 * particle.scale)}px "精靈文 岩ㄧㄢˊ", "Taiwan Elven Rock", "Microsoft JhengHei", sans-serif`;
    context.fillText(particle.text, particle.x, particle.y);
    context.restore();
    return particle.life > 0;
  });
  for (
    let remaining =
      stateRef.current.showSakura && frame.isPlaying ? emissionCount(0.4, frame.frameStep) : 0;
    remaining > 0;
    remaining--
  ) {
    sakuraParticles.current.push({
      x: frame.width + 50,
      y: Math.random() * (frame.height + 200) - 100,
      vx: -(Math.random() * 3 + 2),
      vy: Math.random() * 1.5 + 0.5,
      size: Math.random() * 8 + 4,
      angle: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.05,
      wobbleSpeed: Math.random() * 0.05 + 0.02,
      color: Math.random() > 0.4 ? `#ffb7c5` : `#ffcce6`,
      alpha: Math.random() * 0.5 + 0.5,
    });
  }
  sakuraParticles.current = sakuraParticles.current.filter((particle) => {
    particle.x +=
      (particle.vx + Math.sin(frame.time * 3 * particle.wobbleSpeed) * 1.5) * frame.frameStep;
    particle.y += particle.vy * frame.frameStep;
    particle.angle += particle.spin * frame.frameStep;
    context.save();
    context.globalAlpha = Math.max(0, Math.min(1, particle.alpha));
    context.translate(particle.x, particle.y);
    context.rotate(particle.angle);
    context.fillStyle = particle.color;
    context.shadowBlur = 10;
    context.shadowColor = `#ffb7c5`;
    context.beginPath();
    context.moveTo(0, -particle.size);
    context.bezierCurveTo(
      particle.size,
      -particle.size,
      particle.size,
      particle.size,
      0,
      particle.size * 1.5,
    );
    context.bezierCurveTo(
      -particle.size,
      particle.size,
      -particle.size,
      -particle.size,
      0,
      -particle.size,
    );
    context.fill();
    context.restore();
    return particle.x > -50 && particle.y < frame.height + 50;
  });
  if (frame.showFooter && frame.footerText) {
    const targetFooterAlpha =
      smoothFooterRef.current.alpha +
      (Math.min(1, 0.7 + (frame.safeBass / 255) * 0.3) - smoothFooterRef.current.alpha) *
        smoothingFactor(0.15, frame.frameStep);
    smoothFooterRef.current.alpha = isNaN(targetFooterAlpha)
      ? 1
      : Math.max(0, Math.min(1, targetFooterAlpha));
    context.save();
    const footerText = frame.footerText || ` `;
    context.font = `400 22px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    const footerWidth = context.measureText(footerText).width + 70;
    const footerLeft = frame.width / 2 - footerWidth / 2;
    const footerTop = frame.height - 90;
    context.globalAlpha = smoothFooterRef.current.alpha;
    context.beginPath();
    context.moveTo(footerLeft + 23, footerTop);
    context.lineTo(footerLeft + footerWidth - 23, footerTop);
    context.quadraticCurveTo(
      footerLeft + footerWidth,
      footerTop,
      footerLeft + footerWidth,
      footerTop + 23,
    );
    context.lineTo(footerLeft + footerWidth, footerTop + 23);
    context.quadraticCurveTo(
      footerLeft + footerWidth,
      footerTop + 46,
      footerLeft + footerWidth - 23,
      footerTop + 46,
    );
    context.lineTo(footerLeft + 23, footerTop + 46);
    context.quadraticCurveTo(footerLeft, footerTop + 46, footerLeft, footerTop + 23);
    context.lineTo(footerLeft, footerTop + 23);
    context.quadraticCurveTo(footerLeft, footerTop, footerLeft + 23, footerTop);
    context.closePath();
    context.fillStyle = `rgba(0, 0, 0, 0.65)`;
    context.shadowBlur = 20;
    context.shadowColor = withAlpha(frame.themeColor, 0.4);
    context.fill();
    context.strokeStyle = withAlpha(frame.themeColor, 0.6);
    context.lineWidth = 1.5;
    context.stroke();
    context.textAlign = `center`;
    context.textBaseline = `middle`;
    context.shadowBlur = 10;
    context.shadowColor = frame.themeColor;
    context.fillStyle = `white`;
    context.fillText(footerText, frame.width / 2, footerTop + 23);
    context.restore();
  }
  const logoType = stateRef.current.logoType;
  let logoSource = null;
  if (logoType === `image` && logoImgRef.current && logoImgRef.current.complete) {
    logoSource = logoImgRef.current;
  } else {
    if (logoType === `video` && logoVideoRef.current && logoVideoRef.current.readyState >= 2) {
      logoSource = logoVideoRef.current;
    }
  }
  if (logoSource) {
    context.save();
    context.globalAlpha = stateRef.current.logoOpacity / 100;
    const targetLogoWidth = frame.width * (stateRef.current.logoScale / 100);
    const sourceWidth =
      logoSource instanceof HTMLVideoElement ? logoSource.videoWidth : logoSource.width;
    const sourceHeight =
      logoSource instanceof HTMLVideoElement ? logoSource.videoHeight : logoSource.height;
    const logoScale = targetLogoWidth / sourceWidth;
    const logoWidth = sourceWidth * logoScale;
    const logoHeight = sourceHeight * logoScale;
    let logoX = 0;
    let logoY = 0;
    switch (stateRef.current.logoPosition) {
      case `top-left`:
        logoX = 40;
        logoY = 40;
        break;
      case `top-right`:
        logoX = frame.width - logoWidth - 40;
        logoY = 40;
        break;
      case `bottom-left`:
        logoX = 40;
        logoY = frame.height - logoHeight - 40;
        break;
      case `bottom-right`:
        logoX = frame.width - logoWidth - 40;
        logoY = frame.height - logoHeight - 40;
        break;
      default:
        logoX = 40;
        logoY = 40;
    }
    context.drawImage(logoSource, logoX, logoY, logoWidth, logoHeight);
    context.restore();
  }
}
