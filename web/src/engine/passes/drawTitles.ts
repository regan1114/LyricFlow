import type { RenderFrame } from '../frame';
import type { RenderRuntime } from '../renderer';
import { smoothingFactor } from '../animation';
export function drawTitles(frame: RenderFrame, runtime: RenderRuntime) {
  const { context, smoothTitleRef, stateRef } = runtime;
  context.setTransform(1, 0, 0, 1, 0, 0);
  const titleAlpha =
    smoothTitleRef.current.alpha +
    (Math.min(1, 0.5 + (frame.safeBass / 255) * 0.45) - smoothTitleRef.current.alpha) *
      smoothingFactor(0.15, frame.frameStep);
  smoothTitleRef.current.alpha = isNaN(titleAlpha) ? 1 : Math.max(0, Math.min(1, titleAlpha));
  if (stateRef.current.titleStyle === `classic`) {
    context.save();
    context.textAlign = `left`;
    context.textBaseline = `top`;
    context.shadowBlur = Math.max(0, frame.safeBass / 10);
    context.shadowColor = frame.themeColor;
    context.fillStyle = `white`;
    context.globalAlpha = smoothTitleRef.current.alpha;
    context.font = `400 34px ${frame.customFont}, sans-serif`;
    context.fillText(frame.classicTagline, 80, 70, frame.width - 160);
    context.font = `400 34px ${frame.customFont}, sans-serif`;
    const title = frame.subTitle ? `${frame.songName} - ${frame.subTitle}` : frame.songName;
    context.fillText(title, 80, 115, frame.width - 160);
    context.globalAlpha = smoothTitleRef.current.alpha * 0.9;
    context.font = `400 26px ${frame.customFont}, sans-serif`;
    context.shadowBlur = 0;
    let creditY = 170;
    if (frame.originalSinger && frame.originalSinger.trim() !== ``) {
      context.fillText(`原唱: ${frame.originalSinger}`, 80, creditY);
      creditY += 38;
    }
    if (frame.originalLyricist && frame.originalLyricist.trim() !== ``) {
      context.fillText(`作詞: ${frame.originalLyricist}`, 80, creditY);
      creditY += 38;
    }
    if (frame.originalComposer && frame.originalComposer.trim() !== ``) {
      context.fillText(`作曲: ${frame.originalComposer}`, 80, creditY);
      creditY += 38;
    }
    context.restore();
  } else if (stateRef.current.titleStyle === `widget`) {
    context.save();
    context.globalAlpha = smoothTitleRef.current.alpha;
    context.fillStyle = `rgba(15, 15, 15, 0.4)`;
    context.shadowBlur = 25;
    context.shadowColor = `rgba(0,0,0,0.5)`;
    context.beginPath();
    context.roundRect(80, 70, 340, 100, 24);
    context.fill();
    context.strokeStyle = `rgba(255, 255, 255, 0.15)`;
    context.lineWidth = 1;
    context.stroke();
    context.save();
    context.translate(130, 120);
    if (frame.isPlaying) {
      context.rotate(frame.time * 1.5);
    }
    context.shadowBlur = 10;
    context.shadowColor = `rgba(0,0,0,0.6)`;
    context.beginPath();
    context.arc(0, 0, 32, 0, Math.PI * 2);
    context.fillStyle = `#111`;
    context.fill();
    context.shadowBlur = 0;
    context.beginPath();
    context.arc(0, 0, 12, 0, Math.PI * 2);
    context.fillStyle = frame.themeColor;
    context.fill();
    context.beginPath();
    context.arc(0, 0, 3, 0, Math.PI * 2);
    context.fillStyle = `#fff`;
    context.fill();
    context.strokeStyle = `rgba(255,255,255,0.1)`;
    context.lineWidth = 0.5;
    context.beginPath();
    context.arc(0, 0, 16, 0, Math.PI * 2);
    context.stroke();
    context.beginPath();
    context.arc(0, 0, 24, 0, Math.PI * 2);
    context.stroke();
    context.restore();
    context.textAlign = `left`;
    context.textBaseline = `middle`;
    context.fillStyle = `rgba(255,255,255,0.6)`;
    context.font = `500 13px system-ui, sans-serif`;
    context.fillText(`Music is playing..`, 180, 105);
    context.fillStyle = `white`;
    context.font = `bold 20px ${frame.customFont}, sans-serif`;
    const shortTitle =
      frame.songName.length > 11 ? frame.songName.substring(0, 10) + `...` : frame.songName;
    context.fillText(shortTitle, 180, 135);
    if (frame.isPlaying) {
      context.fillStyle = frame.themeColor;
      for (let index = 0; index < 4; index++) {
        const barHeight = 5 + (frame.safeBass / 255) * Math.random() * 15;
        context.fillRect(380 + index * 6, 135 - barHeight / 2, 3, barHeight);
      }
    }
    context.restore();
  }
  if (frame.showIntroTitle && frame.isPlaying && frame.currentTime > 0 && frame.currentTime <= 11) {
    const fade =
      frame.currentTime < 1
        ? frame.currentTime
        : frame.currentTime > 9
          ? Math.max(0, 10 - frame.currentTime)
          : 1;
    const alpha = Math.max(0, Math.min(1, isNaN(fade) ? 0 : fade));
    if (alpha > 0) {
      context.save();
      context.globalAlpha = alpha;
      context.textAlign = `center`;
      context.textBaseline = `middle`;
      const offsetY = (1 - alpha) * 20;
      context.shadowBlur = 40;
      context.shadowColor = frame.themeColor;
      context.fillStyle = `#ffffff`;
      context.font = `400 110px ${frame.customFont}, sans-serif`;
      context.fillText(
        frame.songName.toUpperCase(),
        frame.width / 2,
        frame.height / 2 - 60 - offsetY,
        frame.width - 160,
      );
      context.fillStyle = `#ffffff`;
      context.font = `400 50px ${frame.customFont}, sans-serif`;
      context.shadowBlur = 20;
      context.shadowColor = frame.themeColor;
      context.fillText(
        frame.subTitle,
        frame.width / 2,
        frame.height / 2 + 40 - offsetY,
        frame.width - 160,
      );
      context.restore();
    }
  }
}
