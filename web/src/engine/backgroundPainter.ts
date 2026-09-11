import type { RenderResources } from './resources';
import type { VisualMedia } from '../composables/useMediaLibrary';
type BackgroundSource = HTMLImageElement | HTMLCanvasElement;

export function createBackgroundPainter(
  context: CanvasRenderingContext2D,
  resources: RenderResources,
) {
  function getBackgroundSource(media: VisualMedia | undefined): BackgroundSource | null {
    if (!media) {
      return null;
    }
    if (media.type === 'image') {
      const image = resources.imageCache.current[media.url] || media.element;
      return image?.complete && image.width > 0 ? image : null;
    }
    const video = resources.videoRefs.current[media.url] || media.element;
    if (!video) {
      return null;
    }
    const cache = resources.cacheCanvases.current;
    const cachedFrame = (cache[media.url] ??= document.createElement('canvas'));
    if (video.readyState < 2 || video.videoWidth === 0) {
      return null;
    }

    // Keep the previous frame only while a seek is waiting for decoded pixels.
    if (!video.seeking || !cachedFrame.dataset.initialized) {
      if (cachedFrame.width !== video.videoWidth || cachedFrame.height !== video.videoHeight) {
        cachedFrame.width = video.videoWidth;
        cachedFrame.height = video.videoHeight;
      }
      cachedFrame.getContext('2d')?.drawImage(video, 0, 0);
      cachedFrame.dataset.initialized = 'true';
    }
    return cachedFrame;
  }
  function drawMovingImage(
    image: BackgroundSource,
    index: number,
    elapsed: number,
    interval: number,
    transition: number,
    width: number,
    height: number,
  ) {
    const progress = Math.max(0, Math.min(1, elapsed / (interval + transition * 2)));
    const pan = 0.02 - 0.04 * progress;
    const motions = [
      {
        zoom: 1.04 + 0.04 * progress,
        x: 0,
        y: 0,
      },
      {
        zoom: 1.08 - 0.04 * progress,
        x: 0,
        y: 0,
      },
      {
        zoom: 1.05,
        x: pan,
        y: 0,
      },
      {
        zoom: 1.05,
        x: -pan,
        y: 0,
      },
      {
        zoom: 1.05,
        x: 0,
        y: pan,
      },
      {
        zoom: 1.05,
        x: 0,
        y: -pan,
      },
      {
        zoom: 1.04 + 0.04 * progress,
        x: pan,
        y: pan,
      },
      {
        zoom: 1.08 - 0.04 * progress,
        x: -pan,
        y: -pan,
      },
    ];
    const motion = motions[index % motions.length];
    const scale = Math.max(
      0.001,
      Math.max(width / image.width, height / image.height) * motion.zoom,
    );
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;
    context.drawImage(
      image,
      -drawWidth / 2 + width * motion.x,
      -drawHeight / 2 + height * motion.y,
      drawWidth,
      drawHeight,
    );
  }
  function drawBackgroundSource(
    source: BackgroundSource | null,
    media: VisualMedia | undefined,
    index: number,
    elapsed: number,
    interval: number,
    transition: number,
    width: number,
    height: number,
  ) {
    if (!source) {
      return;
    }
    if (media?.type === 'image') {
      drawMovingImage(source, index, elapsed, interval, transition, width, height);
      return;
    }
    const scale = Math.max(0.001, Math.max(width / source.width, height / source.height) * 1.04);
    context.drawImage(
      source,
      (-source.width * scale) / 2,
      (-source.height * scale) / 2,
      source.width * scale,
      source.height * scale,
    );
  }
  return {
    getBackgroundSource,
    drawBackgroundSource,
  };
}
