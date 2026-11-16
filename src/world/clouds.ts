// "Above the clouds" cruise deck, drawn as a post-process: every pixel where nothing was
// rendered (sky/background) and whose view ray hits a sphere at cloud-top height gets a
// procedural cloud. No geometry, no map tiles needed, so cruise is cheap on an iPad.
// See docs/GAME_PLAN.md §6.3.

import { Cartesian2, Cartesian3, Cartesian4, Ellipsoid, PostProcessStage, Transforms, Matrix4, type Scene } from "cesium";
import type { LatLon } from "../sim/geo.ts";
import { gfxOn } from "./safety.ts";

/** The grown-up "Clouds" setting, shared by the puffy clouds and this cruise layer. */
export const cloudPrefs = { on: true };

const FRAG = /* glsl */ `
uniform sampler2D colorTexture;
uniform sampler2D depthTexture;
uniform float u_opacity;
uniform float u_R;
uniform float u_h;
uniform vec3 u_east;
uniform vec3 u_north;
uniform vec3 u_up;
uniform vec2 u_offset;
in vec2 v_textureCoordinates;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
  return v;
}

void main() {
  vec4 color = texture(colorTexture, v_textureCoordinates);
  if (u_opacity <= 0.001) { out_FragColor = color; return; }
  float depth = czm_readDepth(depthTexture, v_textureCoordinates);
  if (depth < 0.999999) { out_FragColor = color; return; }

  vec2 ndc = v_textureCoordinates * 2.0 - 1.0;
  vec4 nearP = czm_inverseProjection * vec4(ndc, -1.0, 1.0);
  vec4 farP = czm_inverseProjection * vec4(ndc, 1.0, 1.0);
  vec3 dirEC = normalize(farP.xyz / farP.w - nearP.xyz / nearP.w);
  vec3 dirWC = normalize((czm_inverseView * vec4(dirEC, 0.0)).xyz);
  vec3 d = vec3(dot(dirWC, u_east), dot(dirWC, u_north), dot(dirWC, u_up));

  // Ray from (0, 0, R + h) against a sphere of radius R centred at the origin (local frame).
  float rh = u_R + u_h;
  float b = rh * d.z;
  float c = u_h * (2.0 * u_R + u_h);
  float disc = b * b - c;
  if (disc < 0.0 || b > 0.0) { out_FragColor = color; return; }
  float t = -b - sqrt(disc);
  vec2 xy = d.xy * t + u_offset;

  float n = fbm(xy / 3200.0);
  float n2 = fbm(xy / 700.0 + 7.3);
  float puff = smoothstep(0.32, 0.78, n);
  float shade = 0.80 + 0.17 * puff + 0.07 * (n2 - 0.5);
  vec3 cloud = vec3(shade, shade, min(1.0, shade * 1.03));
  // Distance haze toward the horizon.
  float haze = smoothstep(15000.0, 220000.0, t);
  vec3 skyHaze = vec3(0.74, 0.84, 0.95);
  cloud = mix(cloud, skyHaze, haze * 0.8);
  out_FragColor = vec4(mix(color.rgb, cloud, u_opacity), 1.0);
}
`;

export class CloudDeck {
  private stage: PostProcessStage;
  opacity = 0;
  /** Height of the camera above the cloud tops, meters. */
  private h = 1000;
  private east = new Cartesian3(1, 0, 0);
  private north = new Cartesian3(0, 1, 0);
  private up = new Cartesian3(0, 0, 1);
  private offset = new Cartesian2(0, 0);
  private R = Ellipsoid.WGS84.maximumRadius;

  constructor(private scene: Scene) {
    this.stage = new PostProcessStage({
      name: "playnes-cloud-deck",
      fragmentShader: FRAG,
      uniforms: {
        u_opacity: () => (gfxOn("cloudDeck") && cloudPrefs.on ? this.opacity : 0),
        u_R: () => this.R,
        u_h: () => this.h,
        u_east: () => this.east,
        u_north: () => this.north,
        u_up: () => this.up,
        u_offset: () => this.offset,
      },
    });
    scene.postProcessStages.add(this.stage);
  }

  /**
   * Update for this frame. `cameraPos` is the camera location, `cloudTopHeight` the ellipsoid
   * height of the cloud tops, and `scroll` (meters east, north) moves the pattern to show motion.
   */
  update(cameraPos: LatLon & { height: number }, cloudTopHeight: number, scrollEast: number, scrollNorth: number): void {
    const p = Cartesian3.fromDegrees(cameraPos.lon, cameraPos.lat, cameraPos.height);
    const enu = Transforms.eastNorthUpToFixedFrame(p);
    const col = (i: number) => {
      const c = Matrix4.getColumn(enu, i, new Cartesian4());
      return Cartesian3.normalize(new Cartesian3(c.x, c.y, c.z), new Cartesian3());
    };
    this.east = col(0);
    this.north = col(1);
    this.up = col(2);
    const geocentric = Cartesian3.magnitude(p);
    this.R = geocentric - cameraPos.height + cloudTopHeight;
    this.h = Math.max(1, cameraPos.height - cloudTopHeight);
    this.offset = new Cartesian2(this.offset.x + scrollEast, this.offset.y + scrollNorth);
    // Keep the offset small so float precision in the shader stays good.
    const wrap = 3200 * 64;
    if (Math.abs(this.offset.x) > wrap) this.offset.x %= wrap;
    if (Math.abs(this.offset.y) > wrap) this.offset.y %= wrap;
  }

  destroy(): void {
    this.scene.postProcessStages.remove(this.stage);
  }
}
