import { complementaryColor } from '../colors';
import { createTextCache } from '../textBitmap';
import { smoothingFactor } from '../animation';
import {
  drawElvenRing,
  drawInkLyrics,
  drawParticleLyrics,
  drawSpiralLyrics,
  drawGlitchLyrics,
  drawTypewriterLyrics,
  drawFlipLyrics,
  drawKaraokeBall,
} from '../lyrics';
import type { RenderFrame } from '../frame';
import type { RenderRuntime } from '../renderer';
export function drawLyrics(frame: RenderFrame, runtime: RenderRuntime) {
  const { textCacheRef, stateRef, context, effectParticlesRef } = runtime;
  let mainFontSize = 48;
  let subFontSize = 24;
  if (frame.lyricsSize === `large`) {
    mainFontSize = 60;
    subFontSize = 30;
  }
  if (frame.lyricsSize === `xlarge`) {
    mainFontSize = 72;
    subFontSize = 36;
  }
  const keywords = frame.keywordsStr
    ? frame.keywordsStr
        .split(`,`)
        .map((keyword) => keyword.trim())
        .filter((keyword) => keyword)
    : [];
  const getTextBitmap = createTextCache(
    textCacheRef,
    frame.customFont,
    keywords,
    frame.width - 180,
  );
  if (frame.parsedLyrics.length > 0) {
    const lyricColor = complementaryColor(frame.themeColor, 1);
    const effect = frame.lyricsEffect;
    const textStyle = effect === `neon` ? `neon` : `default`;
    if (frame.lyricsPosition === `list-left`) {
      const targetIndex = Math.max(0, frame.activeLyricIndex);
      if (stateRef.current.smoothActiveIdx === undefined) {
        stateRef.current.smoothActiveIdx = targetIndex;
      }
      if (Math.abs(targetIndex - stateRef.current.smoothActiveIdx) < 0.001) {
        stateRef.current.smoothActiveIdx = targetIndex;
      } else {
        stateRef.current.smoothActiveIdx +=
          (targetIndex - stateRef.current.smoothActiveIdx) * smoothingFactor(0.1, frame.frameStep);
      }
      context.save();
      context.textAlign = `left`;
      context.textBaseline = `middle`;
      const centerY = frame.height / 2 + 30;
      frame.parsedLyrics.forEach((cue, cueIndex) => {
        const distance = cueIndex - stateRef.current.smoothActiveIdx;
        if (Math.abs(distance) < 15) {
          const active = cueIndex === frame.activeLyricIndex;
          const opacity = active ? 1 : Math.max(0.05, 0.45 - Math.abs(distance) * 0.05);
          const scale = active ? 1 : Math.max(0.7, 0.9 - Math.abs(distance) * 0.02);
          const glow = active ? 20 : 0;
          const bitmap = getTextBitmap({
            id: cue.uid,
            text: cue.text,
            subText: cue.subText,
            thirdText: cue.thirdText,
            mainFontSize,
            subFontSize,
            glow: glow,
            color: lyricColor,
            centered: false,
            style: textStyle,
          });
          const angle = distance * 0.14;
          let waveOffset = 0;
          if (effect === `wave`) {
            const frequencyIndex = (cueIndex * 15) % 256;
            waveOffset = -(frame.frequencyData[frequencyIndex] / 255) * 20 * (active ? 1 : 0.5);
          }
          const start = isNaN(cue.time) ? 0 : cue.time;
          const end = isNaN(cue.endTime) ? start + 6 : cue.endTime;
          const progress = Math.max(
            0,
            Math.min(1, (frame.currentTime - start) / Math.max(0.01, end - start)),
          );
          context.save();
          context.translate(-550, centerY + waveOffset);
          context.rotate(angle);
          context.translate(650, 0);
          context.scale(scale, scale);
          context.globalAlpha = opacity;
          const drawX = -bitmap.paddingX;
          const drawY = -bitmap.paddingY;
          if (effect === `ink`) {
            context.filter = `blur(${active ? (frame.safeBass / 255) * 5 : 0}px) contrast(${active ? 150 : 100}%)`;
            context.drawImage(bitmap.canvas, drawX, drawY);
            context.filter = `none`;
          } else if (effect === `elven` && active) {
            drawElvenRing(
              context,
              frame.themeColor,
              frame.time,
              frame.safeBass,
              true,
              drawX,
              drawY,
              0.5,
            );
            context.drawImage(bitmap.canvas, drawX, drawY);
          } else if (effect === `chladni`) {
            drawInkLyrics(context, frame.safeBass, active, drawX, drawY, bitmap);
          } else if (effect === `particle`) {
            drawParticleLyrics(
              context,
              effectParticlesRef,
              frame.themeColor,
              cue.uid,
              active ? 1 : 0.25,
              bitmap,
              drawX,
              drawY,
            );
          } else if (effect === `gravity`) {
            drawSpiralLyrics(context, 1, false, drawX, drawY, bitmap);
          } else if (effect === `glitch` && active && frame.safeBass > 180 && Math.random() > 0.7) {
            drawGlitchLyrics(context, bitmap, drawX, drawY, opacity);
          } else if (effect === `vapor` && active) {
            context.save();
            context.globalCompositeOperation = `screen`;
            const elapsed = Math.max(0, frame.currentTime - cue.time);
            for (let index = 1; index <= 3; index++) {
              context.globalAlpha = (0.2 / index) * opacity;
              const offsetX = Math.sin(frame.time * 3 + index + cueIndex) * 10 * index;
              const offsetY = -elapsed * 25 * index;
              context.drawImage(bitmap.canvas, drawX + offsetX, drawY + offsetY);
            }
            context.restore();
          } else {
            if (effect === `typewriter` && active) {
              drawTypewriterLyrics(context, bitmap, drawX, drawY, progress, frame.time);
            } else {
              if (effect === `split-flap` && active) {
                drawFlipLyrics(context, bitmap, drawX, drawY, progress, cue.text.length);
              } else {
                context.drawImage(bitmap.canvas, drawX, drawY);
              }
            }
          }
          if (frame.showKaraokeBall && active) {
            drawKaraokeBall(context, bitmap, drawX, drawY, progress, frame.themeColor);
          }
          context.restore();
        }
      });
      context.restore();
    } else {
      frame.parsedLyrics.forEach((cue, cueIndex) => {
        const start = isNaN(cue.time) ? 0 : cue.time;
        const end = isNaN(cue.endTime) ? start + 6 : cue.endTime;
        if (frame.currentTime >= start - 0.1 && frame.currentTime <= end + 0.1) {
          let transition = 1;
          let exiting = false;
          const elapsed = frame.currentTime - start;
          const remaining = end - frame.currentTime;
          const fadeDuration = Math.max(0.01, Math.min(0.5, (end - start) / 2));
          if (elapsed < fadeDuration) {
            transition = elapsed / fadeDuration;
            exiting = false;
          } else {
            if (remaining < fadeDuration) {
              transition = remaining / fadeDuration;
              exiting = true;
            }
          }
          transition = isNaN(transition) ? 1 : Math.max(0, Math.min(1, transition));
          const eased = Math.max(0, Math.min(1, transition * (2 - transition)));
          const progress = Math.max(
            0,
            Math.min(1, (frame.currentTime - start) / Math.max(0.01, end - start)),
          );
          context.save();
          let baselineY = frame.lyricsPosition === `center` ? frame.height / 2 : frame.height - 280;
          if (effect === `wave`) {
            const frequencyIndex = (cueIndex * 15) % 256;
            baselineY += -(frame.frequencyData[frequencyIndex] / 255) * 20;
          }
          context.translate(frame.width / 2, baselineY);
          const displacement = Math.max(0, Math.min(1, 1 - eased));
          const direction = exiting ? -1 : 1;
          let opacity = 1;
          if (effect === `gravity`) {
            opacity = exiting ? 1 - displacement : eased;
            context.globalAlpha = opacity;
          } else if (exiting) {
            opacity = eased ** 1.5;
            context.globalAlpha = opacity;
            const exitOffsetX = Math.sin(frame.time * 2.5 + cue.time * 15) * displacement * 80;
            const exitOffsetY = -(displacement ** 1.2) * 150;
            context.translate(exitOffsetX, exitOffsetY);
            context.rotate(Math.sin(frame.time * 1.5 + cue.time) * displacement * 0.15);
            const exitScale = Math.max(0.001, 1 + displacement * 0.8);
            context.scale(exitScale, exitScale);
            context.filter = `blur(${displacement * 30}px)`;
          } else {
            switch (((opacity = eased), (context.globalAlpha = opacity), cue.animType)) {
              case 0:
                context.translate(0, displacement * 50 * direction);
                break;
              case 1: {
                const entranceScale = Math.max(0.001, 1 + displacement * 0.2 * direction);
                context.scale(entranceScale, entranceScale);
                break;
              }
              case 2:
                context.filter = `blur(${Math.max(0, displacement * 15)}px)`;
                break;
              case 3:
                context.scale(1, Math.max(0.001, eased));
                break;
              case 4:
                context.translate(-displacement * 80 * direction, 0);
                break;
              case 5: {
                context.rotate(displacement * 0.15 * direction);
                const rotationScale = Math.max(0.001, 0.9 + eased * 0.1);
                context.scale(rotationScale, rotationScale);
                break;
              }
              case 6:
                context.transform(
                  1,
                  0,
                  displacement * 0.5 * direction,
                  1,
                  displacement * 30 * direction,
                  0,
                );
                break;
              case 7:
                context.scale(Math.max(0.001, eased), 1);
                break;
              case 8: {
                const compressionScale = Math.max(0.001, 1 - displacement * 0.4 * direction);
                context.scale(compressionScale, compressionScale);
                break;
              }
              case 9: {
                context.shadowBlur = Math.max(0, displacement * 60);
                context.shadowColor = lyricColor;
                const glowScale = Math.max(0.001, 1 + displacement * 0.05);
                context.scale(glowScale, glowScale);
                break;
              }
              case 10: {
                const bounceOffset = exiting
                  ? displacement * displacement
                  : Math.sin(eased * Math.PI * 3.5) * displacement * 0.4;
                context.translate(0, exiting ? -displacement * 50 : bounceOffset * 100);
                break;
              }
              case 11:
                context.scale(Math.max(0.001, 1 + displacement * 0.8), Math.max(0.001, eased));
            }
          }
          const bitmap = getTextBitmap({
            id: cue.uid,
            text: cue.text,
            subText: cue.subText,
            thirdText: cue.thirdText,
            mainFontSize,
            subFontSize,
            glow: 20,
            color: lyricColor,
            centered: true,
            style: textStyle,
          });
          const drawX = -(bitmap.canvas.width / 2);
          const drawY = -bitmap.paddingY;
          if (effect === `particle`) {
            drawParticleLyrics(
              context,
              effectParticlesRef,
              frame.themeColor,
              cue.uid,
              transition,
              bitmap,
              drawX,
              drawY,
            );
          } else if (effect === `ink`) {
            context.filter = `blur(${(frame.safeBass / 255) * 8}px) contrast(180%)`;
            context.drawImage(bitmap.canvas, drawX, drawY);
          } else if (effect === `elven`) {
            drawElvenRing(
              context,
              frame.themeColor,
              frame.time,
              frame.safeBass,
              true,
              drawX,
              drawY,
              transition,
            );
            context.drawImage(bitmap.canvas, drawX, drawY);
          } else if (effect === `gravity`) {
            drawSpiralLyrics(context, eased, exiting, drawX, drawY, bitmap);
          } else if (effect === `chladni`) {
            drawInkLyrics(context, frame.safeBass, true, drawX, drawY, bitmap);
          } else if (effect === `glitch` && frame.safeBass > 180 && Math.random() > 0.7) {
            drawGlitchLyrics(context, bitmap, drawX, drawY, opacity);
          } else if (effect === `vapor`) {
            context.save();
            context.globalCompositeOperation = `screen`;
            const elapsed = Math.max(0, frame.currentTime - cue.time);
            for (let index = 1; index <= 3; index++) {
              context.globalAlpha = (0.2 / index) * opacity;
              const offsetX = Math.sin(frame.time * 3 + index + cueIndex) * 10 * index;
              const offsetY = -elapsed * 25 * index;
              context.drawImage(bitmap.canvas, drawX + offsetX, drawY + offsetY);
            }
            context.restore();
          } else {
            if (effect === `typewriter`) {
              drawTypewriterLyrics(context, bitmap, drawX, drawY, progress, frame.time);
            } else {
              if (effect === `split-flap`) {
                drawFlipLyrics(context, bitmap, drawX, drawY, progress, cue.text.length);
              } else {
                context.drawImage(bitmap.canvas, drawX, drawY);
              }
            }
          }
          if (frame.showKaraokeBall) {
            drawKaraokeBall(context, bitmap, drawX, drawY, progress, frame.themeColor);
          }
          context.filter = `none`;
          context.restore();
        }
      });
    }
  }
}
