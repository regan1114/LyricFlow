<script setup lang="ts">
import {
  AudioLines,
  CircleDashed,
  CloudRain,
  Flower2,
  Focus,
  ScrollText,
  Snowflake,
  Sparkles,
  Sun,
  Type,
  WandSparkles,
  Zap,
} from '@lucide/vue';
import { useStudio } from '../../composables/useStudio';
import IconButton from '../ui/IconButton.vue';

const { settings, recording } = useStudio();
const effects = [
  { key: 'showIntroTitle', label: '片頭標題', icon: Type },
  { key: 'showFloatingText', label: '氛圍直書', icon: ScrollText },
  { key: 'showNostalgic', label: '懷舊濾鏡', icon: Sun },
  { key: 'showSakura', label: '櫻花', icon: Flower2 },
  { key: 'showRain', label: '雨絲', icon: CloudRain },
  { key: 'showElvenParticles', label: '精靈粒子', icon: WandSparkles },
  { key: 'showFireflies', label: '螢火蟲', icon: Sparkles },
  { key: 'showSnow', label: '飄雪', icon: Snowflake },
  { key: 'showBeatStrobe', label: '節奏閃光', icon: Zap },
  { key: 'showVignette', label: '暗角', icon: Focus },
  { key: 'showWaveform', label: '頻譜', icon: AudioLines },
  { key: 'showBokeh', label: '散景', icon: CircleDashed },
] as const;
</script>

<template>
  <div
    class="effects-toolbar"
    role="group"
    aria-label="環境特效快捷列"
  >
    <IconButton
      v-for="effect in effects"
      :key="effect.key"
      :label="effect.label"
      :active="settings[effect.key]"
      :aria-pressed="settings[effect.key]"
      :disabled="recording.isRecording.value"
      @click="settings[effect.key] = !settings[effect.key]"
    >
      <component
        :is="effect.icon"
        :size="18"
      />
    </IconButton>
  </div>
</template>
