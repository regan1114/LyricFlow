export const withAlpha = (hex: string, alpha: number) => {
  const safeAlpha = Math.max(0, Math.min(1, isNaN(alpha) ? 1 : alpha));
  return `rgba(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)}, ${safeAlpha})`;
};
export const withAccentTint = (hex: string, alpha = 0.35) => {
  const safeAlpha = Math.max(0, Math.min(1, isNaN(alpha) ? 0.35 : alpha));
  let red = parseInt(hex.slice(1, 3), 16);
  let green = parseInt(hex.slice(3, 5), 16);
  let blue = parseInt(hex.slice(5, 7), 16);
  red = Math.min(255, red + 40);
  green = Math.max(0, green - 10);
  blue = Math.min(255, blue + 50);
  return `rgba(${red}, ${green}, ${blue}, ${safeAlpha})`;
};
export const complementaryColor = (hex: string, alpha = 1) => {
  const safeAlpha = Math.max(0, Math.min(1, isNaN(alpha) ? 1 : alpha));
  const red = parseInt(hex.slice(1, 3), 16);
  const green = parseInt(hex.slice(3, 5), 16);
  const blue = parseInt(hex.slice(5, 7), 16);
  return `rgba(${255 - red}, ${255 - green}, ${255 - blue}, ${safeAlpha})`;
};
export const rgbToHex = (red: number, green: number, blue: number) => {
  const clampChannel = (channel: number) => Math.max(0, Math.min(255, Math.round(channel)));
  return `#${[clampChannel(red), clampChannel(green), clampChannel(blue)].map((channel) => channel.toString(16).padStart(2, `0`)).join(``)}`;
};
export const interpolateColor = (fromColor: string, toColor: string, progress: number) => {
  const ratio = Math.max(0, Math.min(1, progress));
  const fromRed = parseInt(fromColor.slice(1, 3), 16);
  const fromGreen = parseInt(fromColor.slice(3, 5), 16);
  const fromBlue = parseInt(fromColor.slice(5, 7), 16);
  const toRed = parseInt(toColor.slice(1, 3), 16);
  const toGreen = parseInt(toColor.slice(3, 5), 16);
  const toBlue = parseInt(toColor.slice(5, 7), 16);
  return rgbToHex(
    fromRed + (toRed - fromRed) * ratio,
    fromGreen + (toGreen - fromGreen) * ratio,
    fromBlue + (toBlue - fromBlue) * ratio,
  );
};
export const sampleImageColor = (
  canvas: HTMLCanvasElement,
  source: CanvasImageSource | null,
  sampleSize = 16,
) => {
  if (!source) {
    return null;
  }
  if (canvas.width !== sampleSize) {
    canvas.width = sampleSize;
    canvas.height = sampleSize;
  }
  const context = canvas.getContext(`2d`, {
    willReadFrequently: true,
  });
  if (!context) {
    return null;
  }
  try {
    context.drawImage(source, 0, 0, sampleSize, sampleSize);
    const data = context.getImageData(0, 0, sampleSize, sampleSize).data;
    let red = 0;
    let green = 0;
    let blue = 0;
    let pixelCount = 0;
    for (let index = 0; index < data.length; index += 4) {
      red += data[index];
      green += data[index + 1];
      blue += data[index + 2];
      pixelCount++;
    }
    if (pixelCount === 0) {
      return null;
    }
    red /= pixelCount;
    green /= pixelCount;
    blue /= pixelCount;
    const peakChannel = Math.max(red, green, blue);
    if (peakChannel > 0) {
      const brightnessScale = Math.min(1.6, 200 / peakChannel);
      red = Math.min(255, red * brightnessScale);
      green = Math.min(255, green * brightnessScale);
      blue = Math.min(255, blue * brightnessScale);
    }
    return rgbToHex(red, green, blue);
  } catch {
    return null;
  }
};
