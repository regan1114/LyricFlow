precision highp float;
uniform vec2 resolution;
uniform vec2 photoSize;
uniform sampler2D photograph;
uniform float time;
uniform float fireTime;
uniform float brightness;
uniform float cabinScene;
uniform float naturalColor;

float hash(vec2 samplePosition) {
  return fract(sin(dot(samplePosition, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 samplePosition) {
  vec2 cell = floor(samplePosition);
  vec2 fraction = fract(samplePosition);
  fraction = fraction * fraction * (3. - 2. * fraction);
  return mix(mix(hash(cell), hash(cell + vec2(1, 0)), fraction.x),
    mix(hash(cell + vec2(0, 1)), hash(cell + 1.), fraction.x), fraction.y);
}

float boxMask(vec2 samplePosition, vec2 lowerBound, vec2 upperBound) {
  vec2 inside = smoothstep(lowerBound, lowerBound + .0015, samplePosition)
    * (1. - smoothstep(upperBound - .0015, upperBound, samplePosition));
  return inside.x * inside.y;
}

vec3 aurora(vec2 skyPosition) {
  float driftTime = time * .075;
  float horizontal = skyPosition.x;
  vec3 light = vec3(0.);
  for (int curtainIndex = 0; curtainIndex < 3; curtainIndex++) {
    float layer = float(curtainIndex);
    float offset = layer * 1.71;
    float warp = horizontal + .07 * sin(horizontal * 5. + driftTime * .48 + offset)
      + .02 * sin(horizontal * 17. - driftTime * .3);
    float base = .53 + layer * .082 + .085 * sin(warp * 3.8 + driftTime * .38 + offset)
      + .025 * sin(warp * 11. - driftTime * .5 + offset);
    float altitude = skyPosition.y - base;
    float curtainHeight = .22 + .05 * sin(horizontal * 5. + driftTime + offset);
    float envelope = smoothstep(-.025, .035, altitude)
      * exp(-max(altitude, 0.) / curtainHeight * 3.6);
    float drift = warp * 5. + driftTime * .12 + offset;
    float folds = .5 + .5 * sin(drift * 4. + 2.6 * noise(vec2(drift * 2., driftTime * .18 + offset)));
    float rayCoordinate = warp * 210. + driftTime * .5 + offset + .8 * noise(vec2(altitude * 4., driftTime * .2));
    float rays = pow(noise(vec2(rayCoordinate, altitude * 2.5 + driftTime * .05)), 2.);
    float fine = .78 + .22 * sin(warp * 750. + sin(warp * 84. + driftTime) * 3.);
    float density = (.2 + folds * .8) * (.35 + .95 * rays) * fine;
    float cycle = (.5 + .5 * sin(driftTime * .19 + offset * .4 + horizontal * 1.2)) * naturalColor;
    vec3 curtainColor = mix(vec3(.08, .94, .49), vec3(.12, .64, .95), smoothstep(.35, 1., cycle) * .7);
    curtainColor = mix(curtainColor, vec3(.57, .15, .77), smoothstep(.05, .23, altitude) * (.4 + .6 * cycle));
    light += curtainColor * envelope * density * (.72 - layer * .13);
    light += vec3(.22, .8, .47) * exp(-abs(altitude) * 95.) * (.3 + .7 * folds) * .025;
  }
  return light * smoothstep(.4, .57, skyPosition.y) * (.78 + .22 * sin(time * .06));
}

// Conservative skyline follows the photograph; aurora cannot illuminate mountain faces.
float skyMask(vec2 imagePosition) {
  float ridgeHeight = .70;
  if (imagePosition.x < .26) ridgeHeight = mix(.45, .70, smoothstep(.04, .26, imagePosition.x));
  if (imagePosition.x > .64) ridgeHeight = mix(.70, .54, smoothstep(.64, .82, imagePosition.x));
  return 1. - smoothstep(ridgeHeight - .015, ridgeHeight, imagePosition.y);
}

float snow(vec2 windowPosition) {
  float flakes = 0.;
  for (int layerIndex = 0; layerIndex < 3; layerIndex++) {
    float layer = float(layerIndex);
    float gridSize = 47. - layer * 12.;
    vec2 drift = vec2(sin(time * .11 + layer) * .026 - time * .003, time * (.017 + layer * .009));
    vec2 grid = (windowPosition + drift) * vec2(gridSize * 1.7778, gridSize);
    vec2 cell = floor(grid);
    vec2 localPosition = fract(grid);
    vec2 seed = vec2(hash(cell + layer * 57.), hash(cell + layer * 21. + 13.));
    vec2 center = .2 + .6 * seed;
    float radius = .024 + layer * .012 + seed.x * .023;
    flakes += (1. - smoothstep(radius * .15, radius, length(localPosition - center)))
      * (.38 + layer * .2) * step(.35, seed.y);
  }
  return flakes;
}

vec3 cabin(vec2 imagePosition, vec3 photo) {
  vec2 windowPosition = vec2(imagePosition.x, 1. - imagePosition.y);
  float glass = boxMask(windowPosition, vec2(.056, .412), vec2(.436, .832));
  glass *= 1. - boxMask(windowPosition, vec2(.387, .412), vec2(.422, .464));
  glass *= 1. - boxMask(windowPosition, vec2(.356, .412), vec2(.391, .442));
  vec3 snowLight = vec3(.66, .78, .93) * snow(windowPosition) * glass;

  vec2 firePosition = (windowPosition - vec2(.643, .405)) / vec2(.14, .24);
  float altitude = firePosition.y;
  float opening = boxMask(windowPosition, vec2(.567, .375), vec2(.718, .551));
  float field = 0.;
  for (int flameIndex = 0; flameIndex < 5; flameIndex++) {
    float flame = float(flameIndex);
    float center = (flame - 2.) * .145;
    float flameHeight = .34 + .20 * noise(vec2(flame * 7., fireTime * .8));
    float sway = (noise(vec2(altitude * 5. + flame * 4., fireTime * 1.2)) - .5) * .23 * max(altitude, 0.);
    float flameWidth = .045 + .046 * (1. - clamp(altitude / flameHeight, 0., 1.));
    float tongue = exp(-pow((firePosition.x - center - sway) / flameWidth, 2.));
    tongue *= smoothstep(-.05, .02, altitude) * (1. - smoothstep(flameHeight * .18, flameHeight, altitude));
    field += tongue * (.75 + .35 * noise(vec2(firePosition.x * 21. + flame, altitude * 15. - fireTime * 2.8)));
  }
  float flicker = .84 + .09 * sin(fireTime * 2.4) + .07 * noise(vec2(fireTime * 3.7, 4.));
  vec3 flameLight = (vec3(1., .28, .025) * field + vec3(1., .65, .16) * pow(clamp(field, 0., 1.), 1.8))
    * opening * brightness * .85;
  vec2 hearthDistance = (windowPosition - vec2(.643, .405)) * vec2(1.78, 1.);
  float hearthSpill = exp(-dot(hearthDistance, hearthDistance) * 60.) * (1. - glass);
  vec3 base = photo * mix(1., .3 + .7 * brightness, opening);
  base *= 1. + (flicker - .85) * .06 * hearthSpill * brightness;
  vec3 emitted = snowLight + flameLight + vec3(.045, .016, .004) * hearthSpill * flicker * brightness;
  return 1. - (1. - clamp(base, 0., 1.)) * exp(-emitted);
}

void main() {
  float coverScale = max(resolution.x / photoSize.x, resolution.y / photoSize.y);
  vec2 coveredSize = photoSize * coverScale;
  vec2 imagePosition = (vec2(gl_FragCoord.x, resolution.y - gl_FragCoord.y) - resolution * .5) / coveredSize + .5;
  vec3 photo = texture2D(photograph, imagePosition).rgb;
  if (cabinScene > .5) {
    gl_FragColor = vec4(cabin(imagePosition, photo), 1.);
    return;
  }
  vec2 skyPosition = vec2(imagePosition.x, 1. - imagePosition.y);
  vec3 emitted = aurora(skyPosition) * skyMask(imagePosition) * brightness;
  vec2 starGrid = imagePosition * vec2(890., 500.);
  float starSeed = hash(floor(starGrid));
  float star = (1. - smoothstep(0., .11, length(fract(starGrid) - .5))) * step(.996, starSeed);
  emitted += vec3(.64, .76, .9) * star * skyMask(imagePosition) * (.65 + .35 * sin(time * .5 + starSeed * 200.));
  float waterMask = smoothstep(.826, .839, imagePosition.y) * (1. - smoothstep(.929, .945, imagePosition.y));
  vec2 reflectionPosition = vec2(imagePosition.x + .003 * sin(imagePosition.y * 410. + time * .32), .54 + (imagePosition.y - .824) * 3.2);
  float ripple = .5 + .5 * noise(vec2(imagePosition.x * 8., imagePosition.y * 750. + time * .3));
  emitted += aurora(reflectionPosition) * .23 * ripple * waterMask * brightness;
  gl_FragColor = vec4(1. - (1. - photo) * exp(-emitted * 1.45), 1.);
}
