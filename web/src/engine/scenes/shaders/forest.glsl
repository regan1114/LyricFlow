// Image-calibrated effect ported from immersive-landscapes.
precision highp float;
uniform vec2 resolution;
uniform vec2 photoSize;
uniform sampler2D photograph;
uniform float time;
uniform sampler2D waterMask;
uniform float lampLevel;
float hash(vec2 samplePosition){return fract(sin(dot(samplePosition,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 samplePosition){vec2 layerIndex=floor(samplePosition),cellFraction=fract(samplePosition);cellFraction=cellFraction*cellFraction*(3.-2.*cellFraction);return mix(mix(hash(layerIndex),hash(layerIndex+vec2(1,0)),cellFraction.x),mix(hash(layerIndex+vec2(0,1)),hash(layerIndex+1.),cellFraction.x),cellFraction.y);}
float water(vec2 samplePosition){return texture2D(waterMask,samplePosition).r;}
void main(){
 float scale=max(resolution.x/photoSize.x,resolution.y/photoSize.y);
 vec2 size=photoSize*scale;
 vec2 samplePosition=(vec2(gl_FragCoord.x,resolution.y-gl_FragCoord.y)-resolution*.5)/size+.5;
 float wet=water(samplePosition);
 float depth=smoothstep(.31,.77,samplePosition.y);
 float flow=time*.065;
 vec2 current=vec2(samplePosition.x*18.,samplePosition.y*32.-flow*14.);
 float broad=noise(current),fine=noise(current*2.7+vec2(time*.18,-time*.5));
 vec2 displacement=vec2((broad-.5)*.005,(fine-.5)*.0025)*( .25+.75*depth)*wet;
 vec2 displacedPosition=samplePosition+displacement;
 if(water(displacedPosition)<.95) displacedPosition=samplePosition;
 vec3 base=texture2D(photograph,displacedPosition).rgb;
 // Sunlit leaf shadows drift in brightness without bending trunks or the deck.
 float canopy=noise(samplePosition*vec2(15.,12.)+vec2(sin(time*.16)*.15,cos(time*.13)*.12));
 float dapple=smoothstep(.48,.75,canopy);
 float sunArea=exp(-dot((samplePosition-vec2(.87,.18))*vec2(1.,.75),(samplePosition-vec2(.87,.18))*vec2(1.,.75))*2.3);
 vec3 color=base*(.62+.38*lampLevel);
 float canopyRegion=1.-smoothstep(.68,.77,samplePosition.y);
 color*=1.+(dapple-.35)*.10*lampLevel*sunArea*canopyRegion;
 color+=vec3(.065,.048,.019)*dapple*sunArea*lampLevel*canopyRegion;
 float glints=pow(max(0.,sin(samplePosition.y*570.-time*2.2+6.*broad)*sin(samplePosition.x*190.+3.*fine)),12.);
 color+=vec3(.20,.24,.22)*glints*wet*(.3+.7*depth)*lampLevel;
 gl_FragColor=vec4(clamp(color,0.,1.),1.);
}
