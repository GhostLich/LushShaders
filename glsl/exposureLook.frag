layout(binding = 0) uniform UniformBufferObjectFrag
{
    vec4 camDirection;
    vec4 camPos_brightness;
} ubo;

layout(binding = 1) uniform sampler2D exposureSampler;
layout(binding = 2) uniform samplerCube cubeMapTex;

#define PBR_MIP_LEVELS 7

layout(location = 0) out vec4 data;

const float lookWeight = 0.5;

vec3 hdrFinal(vec3 color) {
	float A = 0.15;
	float B = 0.50;
	float C = 0.10;
	float D = 0.20;
	float E = 0.02;
	float F = 0.30;
	float W = 11.2;
	float exposure = texture(exposureSampler, vec2(0.5,0.5)).g;
	color = color * exposure * exposure * exposure * 0.05;
	color = ((color * (A * color + C * B) + D * E) / (color * (A * color + B) + D * F)) - E / F;
	float white = ((W * (A * W + C * B) + D * E) / (W * (A * W + B) + D * F)) - E / F;
	color /= white;
    float gamma = 1.13 + exposure * 0.01;
	color = pow(color, vec3(1.0 / gamma));
	return color;
}

void main()
{
    float prevExposure = texture(exposureSampler, vec2(0.5,0.5)).r;
    vec3 cubeTexA = hdrFinal(textureLod( cubeMapTex, normalize(ubo.camDirection.xyz), PBR_MIP_LEVELS - 2 ).rgb);
    vec3 cubeTexB = hdrFinal(textureLod( cubeMapTex, normalize(ubo.camPos_brightness.xyz), PBR_MIP_LEVELS - 1 ).rgb);
    vec3 cubeTexD = hdrFinal(textureLod( cubeMapTex, normalize(-ubo.camPos_brightness.xyz), PBR_MIP_LEVELS - 1 ).rgb);

    float averageBrightnessA = dot(cubeTexA, vec3(0.2126, 0.7152, 0.0722));
    float averageBrightnessB = dot(cubeTexB, vec3(0.2126, 0.7152, 0.0722));
    float averageBrightnessD = dot(cubeTexD, vec3(0.2126, 0.7152, 0.0722));

    float averageBrightness = averageBrightnessA * lookWeight + (averageBrightnessB + averageBrightnessD) * (1.0 - lookWeight) * 0.5;

    float optimimumBrightness = 0.55 + (ubo.camPos_brightness.w - 0.8) * 0.5;
    float optimumExposure = prevExposure + (optimimumBrightness - averageBrightness) * 4.0;
    optimumExposure = clamp(optimumExposure, 0.1, 40.0 + (ubo.camPos_brightness.w - 0.8) * 50.0);

    float newExposure = optimumExposure;
    data = vec4(newExposure,newExposure,newExposure,1.0);
}
