// Image-calibrated effect ported from immersive-landscapes.
precision highp float;
uniform vec2 resolution;
uniform vec2 photoSize;
uniform sampler2D photograph;
uniform float time;
uniform float rainAmount;
uniform float lampLevel;
float hash(vec2 samplePosition){return fract(sin(dot(samplePosition,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 samplePosition){vec2 layerIndex=floor(samplePosition),cellFraction=fract(samplePosition);cellFraction=cellFraction*cellFraction*(3.-2.*cellFraction);return mix(mix(hash(layerIndex),hash(layerIndex+vec2(1,0)),cellFraction.x),mix(hash(layerIndex+vec2(0,1)),hash(layerIndex+1.),cellFraction.x),cellFraction.y);}
float box(vec2 samplePosition,vec2 lowerBound,vec2 upperBound){return smoothstep(lowerBound.x,lowerBound.x+.001,samplePosition.x)*(1.-smoothstep(upperBound.x-.001,upperBound.x,samplePosition.x))*smoothstep(lowerBound.y,lowerBound.y+.001,samplePosition.y)*(1.-smoothstep(upperBound.y-.001,upperBound.y,samplePosition.y));}
// Asset-specific opening and wet ground; calibrated after inspecting the image.
float outside(vec2 samplePosition){return box(samplePosition,vec2(.18,.08),vec2(.84,.636));}
float wetGround(vec2 samplePosition){float progress=clamp((samplePosition.y-.535)/.10,0.,1.);return box(samplePosition,vec2(mix(.45,.39,progress),.535),vec2(mix(.66,.73,progress),.635));}
float rainfall(vec2 samplePosition,float imageHeight){
 float total=0.;
 // Keep rain about a pixel wide even when the full scene is downsampled.
 for(int layerIndex=0;layerIndex<4;layerIndex++){
  float layer=float(layerIndex);float scale=76.-layer*15.;
  vec2 localPosition=vec2(samplePosition.x*(photoSize.x/photoSize.y)+.035*samplePosition.y,samplePosition.y)*scale;
  localPosition.y-=time*(5.+layer*2.5);
  vec2 cell=floor(localPosition),cellFraction=fract(localPosition);float seed=hash(cell+layer*31.);
  float centerX=.20+.60*hash(cell+12.);
  float centerY=.43+.12*hash(cell+29.);
  float pixel=scale/imageHeight;
  float width=max(.028+layer*.014,pixel*(.70+layer*.12));
  float line=1.-smoothstep(width*.2,width,abs(cellFraction.x-centerX));
  float tail=.23+layer*.045;
  line*=smoothstep(centerY-tail,centerY+.05,cellFraction.y)*(1.-smoothstep(centerY+.05,centerY+tail,cellFraction.y));
  total+=line*step(1.-rainAmount*.82,seed)*(.28+layer*.12);
 }
 return total*sqrt(rainAmount);
}
float rings(vec2 samplePosition){
 float contribution=0.;
 for(int layerIndex=0;layerIndex<14;layerIndex++){
  float sampleIndex=float(layerIndex);
  vec2 center=vec2(.40+.30*hash(vec2(sampleIndex,7.)),.545+.085*hash(vec2(sampleIndex,3.)));
  float phase=fract(time*(.42+hash(vec2(sampleIndex,4.))*.25)+hash(vec2(sampleIndex,17.)));
  vec2 offset=(samplePosition-center)*vec2(1.,3.3);
  float radius=phase*.018;
  float ring=1.-smoothstep(.0005,.0015,abs(length(offset)-radius));
  contribution+=ring*sin(phase*3.14159)*(1.-phase)*step(hash(vec2(sampleIndex,8.)),rainAmount);
 }
 return contribution;
}
float eaveDrops(vec2 samplePosition){
 float contribution=0.;
 for(int layerIndex=0;layerIndex<8;layerIndex++){
  float sampleIndex=float(layerIndex);float x=.24+sampleIndex*.073;
  float phase=fract(time*(.50+.18*hash(vec2(sampleIndex,2.)))+hash(vec2(sampleIndex,6.)));
  float y=.08+phase*phase*.55;
  vec2 offset=(samplePosition-vec2(x,y))*vec2(1.7778,1.);
  float droplet=exp(-offset.x*offset.x/.0000007-offset.y*offset.y/.000025);
  contribution+=droplet*step(hash(vec2(sampleIndex,9.)),rainAmount)*.34;
 }
 return contribution*rainAmount;
}
void main(){
 float scale=max(resolution.x/photoSize.x,resolution.y/photoSize.y);
 vec2 size=photoSize*scale;
 vec2 samplePosition=(vec2(gl_FragCoord.x,resolution.y-gl_FragCoord.y)-resolution*.5)/size+.5;
 float garden=outside(samplePosition),wet=wetGround(samplePosition);
 float veranda=box(samplePosition,vec2(.14,.645),vec2(.84,.687));
 float shimmer=sin(samplePosition.y*510.+time*.8)*sin(samplePosition.x*41.-time*.24);
 vec2 ripple=vec2(shimmer*.0007,sin(samplePosition.y*370.-time*.42)*.00025)*rainAmount*(wet+veranda*.3);
 vec3 base=texture2D(photograph,samplePosition+ripple).rgb;
 // Dimming affects warm illumination; the cold, sheltered garden keeps its ambient exposure.
 float warmth=smoothstep(.01,.15,base.r-base.b);
 float lightMask=max(warmth,.48*(1.-garden));
 vec3 color=base*mix(1.,.22+.78*lampLevel,lightMask);
 vec2 lampDelta=(samplePosition-vec2(.966,.576))*vec2(1.7778,1.);
 vec2 lanternDelta=(samplePosition-vec2(.624,.421))*vec2(1.7778,1.);
 color+=vec3(.09,.040,.012)*(exp(-dot(lampDelta,lampDelta)*28.)+exp(-dot(lanternDelta,lanternDelta)*95.))*lampLevel;
 vec3 rainColor=mix(vec3(.60,.72,.83),vec3(.94,.73,.44),exp(-dot(lanternDelta,lanternDelta)*120.)*lampLevel);
 color+=rainColor*(rainfall(samplePosition,size.y)+eaveDrops(samplePosition)*1.6)*garden;
 float ring=rings(samplePosition)*wet*rainAmount;
 color+=vec3(.16,.22,.25)*ring;
 float reflection=exp(-pow((samplePosition.x-.624)/.035,2.))*(wet+veranda*.6);
 float reflectedLight=(.45+.55*noise(vec2(samplePosition.x*42.,samplePosition.y*780.-time*.6)))*(.6+.4*shimmer*rainAmount);
 color+=vec3(.16,.07,.014)*reflection*reflectedLight*lampLevel;
 gl_FragColor=vec4(clamp(color,0.,1.),1.);
}
