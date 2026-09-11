import {
  ClampToEdgeWrapping,
  LinearFilter,
  Mesh,
  NoBlending,
  NoColorSpace,
  NoToneMapping,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Texture,
  TextureLoader,
  WebGLRenderer,
  type IUniform,
} from 'three';
import {
  isLandscapeId,
  sceneDefinitions,
  type LandscapeId,
  type SceneSettings,
} from '../../config/scenes';
import * as hallstatt from './hallstattModel';
import auroraCabinShader from './shaders/auroraCabin.glsl?raw';
import kyotoShader from './shaders/kyoto.glsl?raw';
import forestShader from './shaders/forest.glsl?raw';
import hallstattShader from './shaders/hallstatt.glsl?raw';

type UniformValue = number | number[] | Texture;
type Uniforms = Record<string, IUniform<UniformValue>>;
interface SceneEntry {
  material: ShaderMaterial;
  uniforms: Uniforms;
  textures: Texture[];
  elapsed: number;
  fireElapsed: number;
}

const shaders: Record<LandscapeId, string> = {
  'aurora-fjord': auroraCabinShader,
  'nordic-cabin': auroraCabinShader,
  kyoto: kyotoShader,
  forest: forestShader,
  hallstatt: hallstattShader,
};

// One GPU context, one full-screen plane. Every effect samples the same image coordinates.
export class SceneRenderer {
  readonly canvas = document.createElement('canvas');
  private renderer: WebGLRenderer | null = null;
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly geometry = new PlaneGeometry(2, 2);
  private mesh: Mesh | null = null;
  private readonly entries = new Map<LandscapeId, SceneEntry>();
  private readonly pending = new Map<LandscapeId, Promise<void>>();
  private readonly retries = new Map<LandscapeId, { attempts: number; after: number }>();
  private disposed = false;
  private failed = false;
  private stamp = '';
  private skyStamp = '';
  private sky: ReturnType<typeof hallstatt.ephemeris> | null = null;

  constructor(private readonly onError: (message: string) => void) {
    this.canvas.addEventListener('webglcontextlost', this.contextLost);
    this.canvas.addEventListener('webglcontextrestored', this.contextRestored);
  }

  private contextLost = (event: Event) => {
    event.preventDefault();
    this.failed = true;
    this.onError('場景動態光影暫時中斷，目前顯示靜態背景。');
  };

  private contextRestored = () => {
    this.failed = false;
    this.stamp = '';
  };

  private initialize() {
    if (this.renderer) return;
    this.renderer = new WebGLRenderer({
      canvas: this.canvas,
      alpha: false,
      antialias: false,
      preserveDrawingBuffer: true,
      powerPreference: 'low-power',
    });
    this.renderer.toneMapping = NoToneMapping;
    this.renderer.setPixelRatio(1);
    this.renderer.debug.onShaderError = (context, _program, _vertexShader, fragmentShader) => {
      console.error(context.getShaderInfoLog(fragmentShader));
      this.failed = true;
      this.onError('此裝置無法編譯場景光影，目前顯示靜態背景。');
    };
  }

  async prepare(sceneId: LandscapeId): Promise<void> {
    if (this.disposed || this.entries.has(sceneId)) return;
    const pending = this.pending.get(sceneId);
    if (pending) return pending;
    const load = this.loadScene(sceneId)
      .then(() => {
        this.retries.delete(sceneId);
      })
      .catch(() => {
        const attempts = (this.retries.get(sceneId)?.attempts ?? 0) + 1;
        this.retries.set(sceneId, {
          attempts,
          after: performance.now() + Math.min(30000, 1000 * 2 ** Math.min(attempts, 5)),
        });
        if (!this.disposed)
          this.onError(`${sceneDefinitions[sceneId].name}動態素材無法載入，目前顯示靜態背景。`);
      })
      .finally(() => {
        this.pending.delete(sceneId);
      });
    this.pending.set(sceneId, load);
    return load;
  }

  private async loadScene(sceneId: LandscapeId) {
    this.initialize();
    const textures: Texture[] = [];
    const loader = new TextureLoader();
    const loadTexture = async (url: string) => {
      const texture = await loader.loadAsync(url);
      texture.flipY = false;
      texture.colorSpace = NoColorSpace;
      texture.generateMipmaps = false;
      texture.minFilter = texture.magFilter = LinearFilter;
      texture.wrapS = texture.wrapT = ClampToEdgeWrapping;
      textures.push(texture);
      return texture;
    };
    try {
      const photograph = await loadTexture(sceneDefinitions[sceneId].url);
      const uniforms: Uniforms = {
        resolution: { value: [1, 1] },
        photoSize: { value: [photograph.image.width, photograph.image.height] },
        photograph: { value: photograph },
        time: { value: 0 },
        brightness: { value: 1 },
        fireTime: { value: 4 },
        cabinScene: { value: sceneId === 'nordic-cabin' ? 1 : 0 },
        naturalColor: { value: 1 },
        rainAmount: { value: 0.58 },
        lampLevel: { value: 1 },
      };
      if (sceneId === 'forest')
        uniforms.waterMask = { value: await loadTexture('/scenes/forest-water-mask.png') };
      if (sceneId === 'hallstatt') {
        uniforms.masks = { value: await loadTexture('/scenes/hallstatt-mask.png') };
        uniforms.moonAlbedo = { value: await loadTexture('/scenes/moon-albedo.jpg') };
        for (const [key, value] of Object.entries({
          imageBounds: [0, 0, 1, 1],
          surfaceNorth: [0, 1],
          libration: [0, 0],
          sunAltitude: 30,
          moonAltitude: 0,
          illumination: 1,
          nightMode: 0,
          reflections: 1,
          sourceClear: 1,
          bodyRadius: 0.00465,
          sunDirection: [0, 0, 1],
          moonDirection: [0, 0, 1],
          moonLight: [0, 0, 1],
          moonRight: [1, 0, 0],
          moonUp: [0, 1, 0],
          cameraForward: hallstatt.cameraForward,
          cameraRight: hallstatt.cameraRight,
          cameraUp: hallstatt.cameraUp,
        }))
          uniforms[key] = { value };
      }
      if (this.disposed) {
        textures.forEach((texture) => texture.dispose());
        return;
      }
      const material = new ShaderMaterial({
        vertexShader: 'void main() { gl_Position = vec4(position.xy, 0., 1.); }',
        fragmentShader: shaders[sceneId],
        uniforms,
        depthTest: false,
        depthWrite: false,
        blending: NoBlending,
        toneMapped: false,
      });
      this.entries.set(sceneId, {
        material,
        uniforms,
        textures,
        elapsed: sceneId === 'forest' ? 12 : 14,
        fireElapsed: 4,
      });
    } catch (error) {
      textures.forEach((texture) => texture.dispose());
      throw error;
    }
  }

  render(
    sceneId: unknown,
    settings: SceneSettings,
    width: number,
    height: number,
    deltaSeconds: number,
  ): HTMLCanvasElement | null {
    if (this.disposed || this.failed || !isLandscapeId(sceneId)) return null;
    const entry = this.entries.get(sceneId);
    if (!entry) {
      if (performance.now() >= (this.retries.get(sceneId)?.after ?? 0)) void this.prepare(sceneId);
      return null;
    }
    const renderer = this.renderer;
    if (!renderer) return null;
    const delta = settings.sceneAnimationEnabled ? Math.max(0, Math.min(0.1, deltaSeconds)) : 0;
    const speed =
      sceneId === 'aurora-fjord'
        ? settings.auroraFlowSpeed
        : sceneId === 'nordic-cabin'
          ? settings.cabinSnowSpeed
          : sceneId === 'forest'
            ? settings.forestWaterSpeed
            : 1;
    entry.elapsed += delta * speed;
    entry.fireElapsed += delta;
    const stamp = [
      sceneId,
      width,
      height,
      entry.elapsed,
      entry.fireElapsed,
      JSON.stringify(settings),
    ].join(':');
    if (stamp === this.stamp) return this.canvas;
    this.stamp = stamp;
    if (!this.mesh) {
      this.mesh = new Mesh(this.geometry, entry.material);
      this.scene.add(this.mesh);
    } else this.mesh.material = entry.material;
    if (this.canvas.width !== width || this.canvas.height !== height)
      renderer.setSize(width, height, false);
    const uniforms = entry.uniforms;
    uniforms.resolution.value = [width, height];
    uniforms.time.value = entry.elapsed;
    uniforms.fireTime.value = entry.fireElapsed;
    uniforms.brightness.value =
      (sceneId === 'aurora-fjord' ? settings.auroraBrightness : settings.cabinFireBrightness) / 100;
    uniforms.naturalColor.value = settings.auroraNaturalColor ? 1 : 0;
    uniforms.rainAmount.value = settings.kyotoRainIntensity / 100;
    uniforms.lampLevel.value =
      (sceneId === 'forest' ? settings.forestDaylightBrightness : settings.kyotoLampBrightness) /
      100;
    if (sceneId === 'hallstatt') this.updateHallstatt(uniforms, settings, width, height);
    renderer.render(this.scene, this.camera);
    return this.failed ? null : this.canvas;
  }

  private updateHallstatt(
    uniforms: Uniforms,
    settings: SceneSettings,
    width: number,
    height: number,
  ) {
    const mode = settings.hallstattMode === 'night' ? 'night' : 'day';
    const date = hallstatt.validDate(settings.hallstattDate)
      ? settings.hallstattDate
      : '2026-10-20';
    const stamp = `${mode}:${date}:${settings.hallstattProgress}`;
    if (stamp !== this.skyStamp) {
      this.sky = hallstatt.ephemeris(
        mode,
        hallstatt.makeRange(mode, date),
        settings.hallstattProgress / 100,
      );
      this.skyStamp = stamp;
    }
    const sky = this.sky!;
    const view = hallstatt.viewport(width, height);
    const projected = sky.body.projected;
    const clear =
      sky.body.altitude > 0 &&
      projected.depth > 0 &&
      projected.x >= 0 &&
      projected.x <= 1 &&
      projected.y < hallstatt.ridge(projected.x);
    for (const [key, value] of Object.entries({
      imageBounds: [view.x, view.y, view.width, view.height],
      surfaceNorth: sky.moonSurface.north,
      libration: sky.moonSurface.libration,
      sunAltitude: sky.sun.altitude,
      moonAltitude: sky.moon.altitude,
      illumination: sky.illumination,
      nightMode: mode === 'night' ? 1 : 0,
      reflections: settings.hallstattReflections ? 1 : 0,
      sourceClear: clear ? 1 : 0,
      bodyRadius: mode === 'night' ? sky.moonSurface.radius : (0.2666 * Math.PI) / 180,
      sunDirection: sky.sun.vector,
      moonDirection: sky.moon.vector,
      moonLight: sky.moonLight,
      moonRight: sky.tangentRight,
      moonUp: sky.tangentUp,
    }))
      uniforms[key].value = value;
  }

  dispose() {
    this.disposed = true;
    this.canvas.removeEventListener('webglcontextlost', this.contextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.contextRestored);
    this.entries.forEach((entry) => {
      entry.textures.forEach((texture) => texture.dispose());
      entry.material.dispose();
    });
    this.entries.clear();
    this.pending.clear();
    this.retries.clear();
    this.geometry.dispose();
    this.renderer?.dispose();
    this.renderer?.forceContextLoss();
  }
}
