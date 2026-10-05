const float hazeDensity = 2.5;
const float hazeSaturation = 0.5;
const float sunWarmth = 0.15;
const vec3 shallowWater = vec3(0.01025, 0.0645, 0.0835);
const vec3 deepWater = vec3(0.004, 0.03, 0.075);
const vec3 leafGlowColor = vec3(1.1, 1.05, 0.55);
const float leafGlowAmount = 0.035;
const float grainAmount = 0.275;
const float grainSize = 0.1;
const float skyShade = 2.0;
const float rippleStrength = 3.0;
const float sparkleWidth = 2.0;
const vec3 leafDark = vec3(0.62, 0.8, 0.82);
const vec3 leafBright = vec3(1.3, 1.2, 0.75);

void addHaze(inout vec3 extinction, inout vec3 inscatter, vec3 view, vec3 position, float cloudCover)
{
    float eyeHeight = (length(position + view) - 100000.0) * 83.88608;
    float fade = max(smoothstep(20000.0, 100000.0, length(view) * 83.88608), smoothstep(2000.0, 8000.0, eyeHeight));
    fade = max(fade, smoothstep(0.3, 0.9, cloudCover));
    vec3 clear = clamp(extinction, 0.0, 1.0);
    vec3 thick = pow(clear, vec3(mix(hazeDensity, 1.0, fade)));
    vec3 extra = max(inscatter * ((1.0 - thick) / max(1.0 - clear, 0.001) - 1.0), 0.0);
    inscatter += mix(vec3(dot(extra, vec3(0.299, 0.587, 0.114))), extra, hazeSaturation);
    extinction = thick;
}

vec3 waterColor(float depth)
{
    return mix(shallowWater, deepWater, depth);
}

vec3 leafGlow(vec3 V, vec3 sunDir, float leafy)
{
    return leafGlowColor * pow(clamp(dot(-V, sunDir), 0.0, 1.0), 6.0) * leafy * leafGlowAmount;
}

vec3 sunTint(vec3 sunColor)
{
    float warmth = sunWarmth * smoothstep(0.25, 0.6, sunColor.b / max(sunColor.r, 0.0001));
    return vec3(1.0 + warmth, 1.0, 1.0 - warmth * 1.2);
}

float cellHash(vec3 p)
{
    p = fract(p * 0.3183099 + 0.1) * 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float valueNoise(vec3 p)
{
    vec3 i = floor(p);
    vec3 f = p - i;
    f = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    return mix(mix(mix(cellHash(i), cellHash(i + vec3(1.0, 0.0, 0.0)), f.x),
                   mix(cellHash(i + vec3(0.0, 1.0, 0.0)), cellHash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
               mix(mix(cellHash(i + vec3(0.0, 0.0, 1.0)), cellHash(i + vec3(1.0, 0.0, 1.0)), f.x),
                   mix(cellHash(i + vec3(0.0, 1.0, 1.0)), cellHash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}

float grain(vec3 localPos)
{
    vec3 p = localPos * (83.88608 / grainSize);
    float level = max(log2(length(fwidth(p)) * 2.0), 0.0);
    float lower = floor(level);
    float scale = exp2(-lower);
    float near = valueNoise(p * scale + lower * 13.0);
    float far = valueNoise(p * scale * 0.5 + (lower + 1.0) * 13.0);
    return clamp((mix(near, far, level - lower) - 0.5) * 1.8 + 0.5, 0.0, 1.0);
}

vec3 leafTone(float value)
{
    return mix(vec3(1.0), mix(leafDark, leafBright, value), grainAmount);
}

float plainTone(float value)
{
    return mix(1.0, mix(0.82, 1.18, value), grainAmount);
}

float skyFacing(vec3 normal, vec3 up, float leafy)
{
    vec3 softened = mix(normal, up, leafy * 0.6);
    float facing = dot(softened, up) / max(length(softened), 0.0001);
    return 1.0 + skyShade * mix(-0.3, 0.12, facing * 0.5 + 0.5);
}
