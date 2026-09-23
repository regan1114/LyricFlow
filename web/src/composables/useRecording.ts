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
import {
  canStreamRecording,
  openRecordingFile,
  type RecordingFile,
} from '../services/recordingFile';
import type { StudioSettings } from '../config/settings';
import type { RenderResources, RenderState, Slot } from '../engine/resources';
import type { AudioPlayer } from './useAudioPlayer';

type RecordingStatus = 'idle' | 'preparing' | 'recording' | 'stopping';
interface RecordingSession {
  recorder: MediaRecorder;
  stream: MediaStream;
  destination: MediaStreamAudioDestinationNode;
  buffer: RecordingBuffer;
  file: RecordingFile | null;
  save: boolean;
  released: boolean;
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
  const streamsToFile = canStreamRecording();
  let session: RecordingSession | null = null;
  let startRequest = 0;
  let disposed = false;

  function cleanup(current: RecordingSession) {
    if (current.released) return;
    current.released = true;
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
    let file: RecordingFile | null = null;
    try {
      const options = { ...exportSettings };
      const range = exportRange(options, player.duration.value);
      const canvas = resources.canvasRef.current;
      if (!window.MediaRecorder || !canvas?.captureStream)
        throw new Error('此瀏覽器不支援畫布錄影。');
      const mimeType = recordingMime(options.format, (type) => MediaRecorder.isTypeSupported(type));
      if (!mimeType) throw new Error('此瀏覽器不支援所選錄影格式，請改選自動或其他格式。');
      const filename = `${settings.songName || 'Resonance'}.${mimeType.startsWith('video/mp4') ? 'mp4' : 'webm'}`;
      file = await openRecordingFile(filename, mimeType, () => {
        if (disposed || session?.file !== file) return;
        reportError('錄影檔案寫入失敗，已停止錄影。請檢查儲存空間與檔案權限後重新錄製。');
        stop();
      });
      if (cancelled()) return;
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
        smoothActiveIdx: 0,
        wallTime: 0,
        lastColorChangeTime: -16,
        currentBgStartTime: renderState.current.trueTime,
      });
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
        file,
        save: true,
        released: false,
        end: range.end,
        stopDrawing,
      };
      session = current;
      recorder.ondataavailable = (event) => {
        if (disposed || session !== current) return;
        const storage = current.file || current.buffer;
        const full = storage.append(event.data);
        recordedBytes.value = storage.bytes;
        if (full && status.value === 'recording') {
          reportError(
            current.file
              ? '磁碟寫入速度不足，待寫入資料已達 256 MiB，正在停止並保存目前片段。'
              : '此瀏覽器使用記憶體暫存，錄影已達 256 MiB，正在停止並匯出目前片段。長影片請使用支援直接存檔的 Chrome／Edge。',
          );
          stop();
        }
      };
      recorder.onstop = async () => {
        try {
          if (current.file) {
            if (!disposed && current.save) await current.file.finish();
            else await current.file.abort();
          } else {
            const blob = current.buffer.take(mimeType);
            if (!disposed && current.save && blob) downloadBlob(blob, filename);
          }
        } catch {
          if (!disposed)
            reportError(
              current.file
                ? '無法完成錄影存檔，請檢查儲存空間與檔案權限後重新錄製。'
                : '無法下載錄影片段，請檢查瀏覽器的下載權限。',
            );
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
      if (!(error instanceof Error && error.name === 'AbortError'))
        reportError(error instanceof Error ? error.message : '無法開始錄影。');
    } finally {
      // Preparation may be cancelled before a recorder owns the selected output file.
      if (file && session?.file !== file) await file.abort().catch(() => {});
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
      void session.file?.abort().catch(() => {});
      cleanup(session);
    }
  });
  return { isRecording, status, recordedBytes, streamsToFile, start, stop };
}
