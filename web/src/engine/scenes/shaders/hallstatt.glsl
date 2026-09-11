// Adapted photographic visual: CC BY-SA 4.0. See public/scenes/hallstatt-attribution.txt.
precision highp float;
uniform vec2 resolution;
uniform sampler2D photograph;
uniform sampler2D masks;
uniform sampler2D moonAlbedo;
uniform vec4 imageBounds;
uniform vec2 surfaceNorth;
uniform vec2 libration;
uniform float time;
uniform float sunAltitude;
uniform float moonAltitude;
uniform float illumination;
uniform float nightMode;
uniform float reflections;
uniform float sourceClear;
uniform float bodyRadius;
uniform vec3 sunDirection;
uniform vec3 moonDirection;
uniform vec3 moonLight;
uniform vec3 moonRight;
uniform vec3 moonUp;
uniform vec3 cameraForward;
uniform vec3 cameraRight;
uniform vec3 cameraUp;
float hash(vec2 samplePosition){return fract(sin(dot(samplePosition,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 samplePosition){vec2 layerIndex=floor(samplePosition),cellFraction=fract(samplePosition);cellFraction=cellFraction*cellFraction*(3.-2.*cellFraction);return mix(mix(hash(layerIndex),hash(layerIndex+vec2(1,0)),cellFraction.x),mix(hash(layerIndex+vec2(0,1)),hash(layerIndex+1.),cellFraction.x),cellFraction.y);}
vec2 imageSize(){return resolution/imageBounds.zw;}
vec3 rayAt(vec2 samplePosition){return normalize(cameraForward+cameraRight*((samplePosition.x-.5)*1.5)+cameraUp*((.5-samplePosition.y)*1.));}
vec3 celestial(vec3 ray,float aa){
 vec3 source=nightMode>.5?moonDirection:sunDirection;
 float cosAngle=dot(ray,source);
 if(cosAngle<.998)return vec3(0.);
 float angle=atan(length(cross(ray,source)),cosAngle);
 float disc=1.-smoothstep(bodyRadius-aa,bodyRadius+aa,angle);
 if(nightMode<.5){
   vec3 light=mix(vec3(1.,.40,.09),vec3(1.,.97,.83),smoothstep(0.,18.,sunAltitude));
   return light*(disc*2.3+exp(-angle*angle/.00016)*.35)*step(0.,sunAltitude);
 }
 if(moonAltitude<=0. || illumination<.001) return vec3(0.);
 vec2 localPosition=vec2(dot(ray,moonRight),dot(ray,moonUp))/sin(bodyRadius);
 float z=sqrt(max(0.,1.-dot(localPosition,localPosition)));
 float mu0=dot(vec3(localPosition,z),moonLight);
 // NASA LROC base color, oriented to lunar north and the current optical libration.
 vec2 face=vec2(dot(localPosition,vec2(surfaceNorth.y,-surfaceNorth.x)),dot(localPosition,surfaceNorth));
 float lat=asin(clamp(face.y*cos(libration.y)+z*sin(libration.y),-1.,1.));
 float lon=libration.x+atan(face.x,z*cos(libration.y)-face.y*sin(libration.y));
 vec3 albedo=texture2D(moonAlbedo,vec2(fract(.5+lon/6.2831853),.5-lat/3.14159265)).rgb;
 float mu=max(.001,z),sunlit=max(0.,mu0);
 // Lunar-regolith scattering retains maria at full Moon and softens the terminator.
 float scattering=.70*(2.*sunlit/(sunlit+mu))+.30*sunlit;
 float edge=max(.006,aa/bodyRadius*.40);
 float lit=smoothstep(-edge,edge,mu0)*min(1.15,scattering);
 float airMass=1./max(.12,sin(moonAltitude*.0174533));
 float transmission=exp(-.055*(airMass-1.));
 vec3 tint=mix(vec3(1.,.82,.64),vec3(.97,.98,1.),smoothstep(2.,24.,moonAltitude));
 float earthshine=.012*pow(1.-illumination,2.);
 float halo=.011*illumination*illumination*exp(-angle*angle/(bodyRadius*bodyRadius*7.));
 return albedo*tint*(lit*1.15+earthshine)*transmission*disc+vec3(.90,.94,1.)*halo;

}
void main(){
 vec2 size=imageSize();
 vec2 screenUV=vec2(gl_FragCoord.x,resolution.y-gl_FragCoord.y)/resolution;
 vec2 samplePosition=imageBounds.xy+screenUV*imageBounds.zw;
 if(samplePosition.x<0. || samplePosition.x>1. || samplePosition.y<0. || samplePosition.y>1.){gl_FragColor=vec4(0.);return;}
 vec3 mask=texture2D(masks,samplePosition).rgb;
 vec2 sampleP=samplePosition;
 if(mask.g>.95){
  vec2 ripple=vec2(sin(samplePosition.y*680.+time*.6)+sin(samplePosition.y*213.-time*.37),sin(samplePosition.x*300.+samplePosition.y*70.+time*.4))*.00055;
  vec2 displaced=samplePosition+ripple*clamp((samplePosition.y-.60)*2.5,0.,1.);
  if(texture2D(masks,displaced).g>.95) sampleP=displaced;
 }
 vec3 photo=texture2D(photograph,sampleP).rgb;
 vec3 ray=rayAt(samplePosition);
 float day=smoothstep(-12.,6.,sunAltitude);
 float moonlight=illumination*max(0.,sin(moonAltitude*.0174533));
 vec3 nocturnal=pow(photo,vec3(.9))*vec3(.075,.115,.19)+photo*moonlight*.095;
 vec3 dayColor=photo*mix(vec3(1.04,.74,.54),vec3(1.),smoothstep(0.,18.,sunAltitude));
 vec3 color=mix(nocturnal,dayColor,day);
 float sunset=(1.-smoothstep(0.,12.,abs(sunAltitude)));
 vec3 skyNight=mix(vec3(.0025,.006,.016),vec3(.015,.028,.053),pow(1.-clamp(ray.z,0.,1.),3.));
 skyNight+=vec3(.012,.018,.026)*moonlight;
 vec3 skyDay=photo*vec3(.97,1.,1.02);
 vec3 twilight=mix(vec3(.08,.13,.23),vec3(.72,.39,.20),pow(1.-clamp(ray.z,0.,1.),4.));
 vec3 sky=mix(skyNight,mix(skyDay,twilight,sunset*.75),day);
 color=mix(color,sky,mask.r);
 float aa=.85/size.x;
 if(mask.r>.01){
  vec2 grid=samplePosition*vec2(800.,533.);vec2 cell=floor(grid),cellFraction=fract(grid)-.5;
  float star=(1.-smoothstep(0.,.12,length(cellFraction)))*step(.9975,hash(cell));
  color+=vec3(.62,.70,.83)*star*(1.-day)*(.6-.3*illumination)*mask.r;
  if(nightMode>.5 && moonAltitude>0. && illumination>=.001){
   float angle=atan(length(cross(ray,moonDirection)),dot(ray,moonDirection));
   float coverage=1.-smoothstep(bodyRadius-aa,bodyRadius+aa,angle);
   color*=1.-coverage*mask.r;
  }
  color+=celestial(ray,aa)*mask.r;
 }
 color+=vec3(1.,.46,.12)*mask.b*(1.-day)*1.6;
 if(mask.g>.001 && reflections>.5 && sourceClear>.5 && ray.z<0.){
  vec3 light=nightMode>.5?moonDirection:sunDirection;
  vec3 halfVector=normalize(light-ray);
  float slope2=dot(halfVector.xy,halfVector.xy)/max(.001,halfVector.z*halfVector.z);
  // A rough-water microfacet lobe creates a vertical glitter path. Only water receives it.
  float rough=.105;
  float specular=exp(-slope2/(rough*rough));
  float wave=.22+.78*pow(noise(vec2(samplePosition.x*260.,samplePosition.y*1100.-time*.8)),2.0);
  float striation=.35+.65*noise(vec2(samplePosition.x*33.,samplePosition.y*1850.+time*.32));
  vec3 reflectionColor=nightMode>.5?vec3(.67,.76,.90)*illumination:mix(vec3(1.,.43,.12),vec3(1.,.90,.63),smoothstep(0.,20.,sunAltitude));
  color+=reflectionColor*specular*wave*striation*mask.g*(nightMode>.5?1.1:2.5);
  // The small coherent reflection preserves the lunar terminator; waves perturb its ray.
  vec3 waterNormal=normalize(vec3(.0015*sin(samplePosition.y*670.+time*.6),.0012*sin(samplePosition.y*890.-time*.7),1.));
  vec3 reflectedRay=reflect(ray,waterNormal);
  color+=celestial(reflectedRay,aa*1.6)*mask.g*.24;
 }
 gl_FragColor=vec4(clamp(color,0.,1.),1.);
}
