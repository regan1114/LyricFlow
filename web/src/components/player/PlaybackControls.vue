<script setup lang="ts">
import { Circle, Pause, Play, Square, Volume2 } from '@lucide/vue';
import { useStudio } from '../../composables/useStudio';
import { formatPlaybackTime } from '../../engine/time';
import IconButton from '../ui/IconButton.vue';
const { player, recording, lyrics } = useStudio();
const { isPlaying, isLoaded, currentTime, duration, volume } = player;
const { isRecording } = recording;
</script>

<template>
  <div class="playback-controls">
    <div class="transport">
      <IconButton
        :label="
          recording.status.value === 'preparing'
            ? '取消準備錄影'
            : recording.status.value === 'stopping'
              ? '正在匯出'
              : isRecording
                ? '停止錄影並匯出'
                : '開始錄影'
        "
        :class="{ recording: isRecording }"
        :disabled="
          recording.status.value === 'stopping' ||
          (!isRecording && (!isLoaded || lyrics.isSyncing.value))
        "
        @click="isRecording ? recording.stop() : recording.start()"
        ><component
          :is="isRecording ? Square : Circle"
          :size="20"
      /></IconButton>
      <IconButton
        :label="isPlaying ? '暫停' : '播放'"
        class="play-button"
        :disabled="!isLoaded || isRecording"
        @click="player.toggle"
        ><component
          :is="isPlaying ? Pause : Play"
          :size="25"
      /></IconButton>
      <span class="timecode"
        >{{ formatPlaybackTime(currentTime) }} / {{ formatPlaybackTime(duration) }}</span
      >
      <label class="volume-control"
        ><Volume2
          :size="17"
          aria-hidden="true" /><input
          v-model.number="volume"
          aria-label="音量"
          type="range"
          min="0"
          max="1"
          step="0.01"
      /></label>
    </div>
    <input
      class="seek-control"
      aria-label="播放進度"
      type="range"
      min="0"
      :max="duration || 1"
      step="0.01"
      :value="currentTime"
      :disabled="!isLoaded || isRecording"
      @input="player.seek(Number(($event.target as HTMLInputElement).value))"
    />
  </div>
</template>
