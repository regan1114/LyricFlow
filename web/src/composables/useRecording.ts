import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { downloadBlob } from '../services/download';
import { ensureFontLoaded } from '../config/fonts';
import {
  createExportSettings,
  exportDimensions,
  exportRange,
  recordingMime,
  type ExportSettings,
} from '../config/export';
import { RecordingBuffer } from '../services/recordingBuffer';
import type { StudioSettings } from '../config/settings';
import type { RenderResources, RenderState, Slot } from '../engine/resources';
import type { AudioPlayer } from './useAudioPlayer';

type RecordingStatus = 'idle' | 'preparing' | 'recording' | 'stopping';
interface RecordingSession {
  recorder: MediaRecorder;
  stream: MediaStream;
  destination: MediaStreamAudioDestinationNode;
  buffer: RecordingBuffer;
  save: boolean;
  end: number;
  stopDrawing: () => void;
}

export function useRecording(
  resources: RenderResources,
  renderState: Slot<RenderState>,
  player: AudioPlayer,
  settings: StudioSettings,
  reportError: (message: string) => void,
  exportSettings: ExportSettings = createExportSettings(),
  blocked: () => boolean = () => false,
) {
  const status = ref<RecordingStatus>('idle');
  const isRecording = computed(() => status.value !== 'idle');
  const recordedBytes = ref(0);
  let session: RecordingSession | null = null;
  let startRequest = 0;
  let disposed = false;

  function cleanup(current: RecordingSession) {
    current.stopDrawing();
    current.stream.getTracks().forEach((track) => track.stop());
    try {
      resources.sourceRef.current?.disconnect(current.destination);
    } catch {
      // The audio player may already have disconnected its source during unmount.
    }
    current.buffer.clear();
    if (session === current) {
      session = null;
      status.value = 'idle';
    }
  }

  async function start() {
    if (isRecording.value || !player.isLoaded.value || disposed || blocked()) return;
    const request = ++startRequest;
    const cancelled = () => disposed || request !== startRequest;
    status.value = 'preparing';
    recordedBytes.value = 0;
    try {
      const options = { ...exportSettings };
      const range = exportRange(options, player.duration.value);
      const canvas = resources.canvasRef.current;
      if (!window.MediaRecorder || !canvas?.captureStream)
        throw new Error('此瀏覽器不支援畫布錄影。');
      if (settings.selectedFont !== 'custom') await ensureFontLoaded(settings.selectedFont);
      if (cancelled()) return;
      await player.initAudio();
      if (cancelled()) return;
      const audioContext = resources.audioContextRef.current;
      const source = resources.sourceRef.current;
      if (!audioContext || !source) throw new Error('音訊尚未準備完成。');
      player.pause();
      player.seek(range.start);
      Object.assign(renderState.current, {
        currentBgIndex: 0,
        nextBgIndex: 0,
        isBgTransitioning: false,
        randomBgQueue: [],
        lastActiveIdx: -1,
        smoothActiveIdx: 0,
        wallTime: 0,
        lastColorChangeTime: -16,
        lastBgSwitchTime: renderState.current.trueTime,
        currentBgStartTime: renderState.current.trueTime,
      });
      Object.values(resources.videoRefs.current).forEach((video) => {
        video.currentTime = 0;
      });
      const mimeType = recordingMime(options.format, (type) => MediaRecorder.isTypeSupported(type));
      if (!mimeType) throw new Error('此瀏覽器不支援所選錄影格式，請改選自動或其他格式。');
      const [width, height] = exportDimensions(canvas.width, canvas.height, options.resolution);
      let output = canvas;
      let drawingFrame: number | undefined;
      const stopDrawing = () => {
        if (drawingFrame !== undefined) cancelAnimationFrame(drawingFrame);
      };
      if (width !== canvas.width || height !== canvas.height) {
        output = document.createElement('canvas');
        output.width = width;
        output.height = height;
        const context = output.getContext('2d', { alpha: false });
        if (!context) throw new Error('無法建立匯出畫布。');
        const draw = () => {
          context.drawImage(canvas, 0, 0, width, height);
          drawingFrame = requestAnimationFrame(draw);
        };
        draw();
      }
      let stream: MediaStream;
      try {
        stream = output.captureStream(options.fps);
      } catch (error) {
        stopDrawing();
        throw error;
      }
      let destination: MediaStreamAudioDestinationNode | null = null;
      let connected = false;
      let recorder: MediaRecorder;
      try {
        destination = audioContext.createMediaStreamDestination();
        source.connect(destination);
        connected = true;
        destination.stream.getAudioTracks().forEach((track) => stream.addTrack(track));
        recorder = new MediaRecorder(stream, {
          mimeType,
          videoBitsPerSecond: options.bitrate * 1000000,
          audioBitsPerSecond: 128000,
        });
      } catch (error) {
        stopDrawing();
        stream.getTracks().forEach((track) => track.stop());
        destination?.stream.getTracks().forEach((track) => track.stop());
        if (connected && destination) source.disconnect(destination);
        throw error;
      }
      const current: RecordingSession = {
        recorder,
        stream,
        destination,
        buffer: new RecordingBuffer(),
        save: true,
        end: range.end,
        stopDrawing,
      };
      session = current;
      const filename = `${settings.songName || 'Resonance'}.${mimeType.startsWith('video/mp4') ? 'mp4' : 'webm'}`;
      recorder.ondataavailable = (event) => {
        if (disposed || session !== current) return;
        const full = current.buffer.append(event.data);
        recordedBytes.value = current.buffer.bytes;
        if (full && status.value === 'recording') {
          reportError('錄影已達 256 MiB 暫存上限，已停止並匯出目前片段。');
          stop();
        }
      };
      recorder.onstop = () => {
        try {
          const blob = current.buffer.take(mimeType);
          if (!disposed && current.save && blob) downloadBlob(blob, filename);
        } catch {
          reportError('無法下載錄影片段，請檢查瀏覽器的下載權限。');
        } finally {
          cleanup(current);
        }
      };
      recorder.onerror = () => {
        reportError('錄影失敗，正在結束並保留已錄製的片段。');
        stop();
      };
      recorder.start(1000);
      status.value = 'recording';
      await player.play();
    } catch (error) {
      if (cancelled()) return;
      if (session) {
        session.save = false;
        if (session.recorder.state !== 'inactive') stop();
        else cleanup(session);
      } else status.value = 'idle';
      player.pause();
      reportError(error instanceof Error ? error.message : '無法開始錄影。');
    }
  }

  function stop() {
    startRequest++;
    player.pause();
    if (status.value === 'preparing') status.value = 'idle';
    if (!session || status.value === 'stopping') return;
    status.value = 'stopping';
    if (session.recorder.state !== 'inactive') session.recorder.stop();
  }
  watch(player.currentTime, (time) => {
    if (status.value === 'recording' && session && time >= session.end) stop();
  });
  onBeforeUnmount(() => {
    disposed = true;
    stop();
    if (session) {
      session.recorder.onstop = null;
      session.recorder.ondataavailable = null;
      session.recorder.onerror = null;
      cleanup(session);
    }
  });
  return { isRecording, status, recordedBytes, start, stop };
}
