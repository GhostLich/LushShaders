#include "shadowCommon.frag"
#include "lightingCommon.frag"
#include "atmoRenderCommon.frag"
#include "look.frag"

layout(binding = 2) uniform AtmoUniformBufferObject {
    float Rg;
    float Rt;
    float RL;
    float AVERAGE_GROUND_REFLECTANCE;

    vec4 betaRAndHR;
    vec4 betaMScaAndHM;
    vec4 betaMExAndmieG;

    int TRANSMITTANCE_W;
    int TRANSMITTANCE_H;
    int SKY_W;
    int SKY_H;
    int RES_R;
    int RES_MU;
    int RES_MU_S;
    int RES_NU;
} atmoUbo;

layout(binding = 3) uniform UniformBufferObjectFrag
{
    vec4 sunPos_cloudCover;
    vec4 camDirection;
    mat4 waveMatrix;
    mat4 reflectionMatrix;
    vec4 lightOriginOffset;
    vec4 animationTimerWindStrength;
    vec4 camPos;
    vec4 windDirection;
    int outputType;
} ubo;

layout(binding = 4) uniform UniformBufferObjectLights
{
    vec4 lightPositions[MAX_LIGHTS];
    vec4 lightColors[MAX_LIGHTS];
    int lightCount;
} lights;

layout(binding = 5) uniform sampler2D transmittanceSampler;
layout(binding = 6) uniform sampler3D inscatterSampler;
layout(binding = 7) uniform samplerCube cubeMapTex;
layout(binding = 8) uniform sampler2D brdfTex;
layout(binding = 9) uniform sampler2DShadow shadowTextureA;
layout(binding = 10) uniform sampler2DShadow shadowTextureB;
layout(binding = 11) uniform sampler2DShadow shadowTextureC;
layout(binding = 12) uniform sampler2DShadow shadowTextureD;
layout(binding = 13) uniform sampler2D exposureSampler;
layout(binding = 14) uniform sampler2D reflectionSampler;
layout(binding = 15) uniform sampler2D noiseSampler;

layout(location = 0) in vec4 outPos;
layout(location = 1) in vec3 outWorldPos;
layout(location = 2) in vec3 outWorldCamPos;
layout(location = 3) in vec3 outColor;
layout(location = 4) in vec2 outMaterial;
layout(location = 5) in vec3 outView;
layout(location = 6) in vec3 outNormal;
layout(location = 7) in vec3 outWorldViewVec;
layout(location = 8) in vec4 outShadowCoords[4];
layout(location = 12) in vec3 fLocalPos;
layout(location = 13) in vec3 outCamPos;
layout(location = 14) in mat4 outReflectionProjView;

layout(location = 0) out vec4 data;

mat4 rotationMatrix(vec3 axis, float angle)
{
    axis = normalize(axis);
    float s = sin(angle);
    float c = cos(angle);
    float oc = 1.0 - c;

    return mat4(oc * axis.x * axis.x + c,           oc * axis.x * axis.y - axis.z * s,  oc * axis.z * axis.x + axis.y * s,  0.0,
                oc * axis.x * axis.y + axis.z * s,  oc * axis.y * axis.y + c,           oc * axis.y * axis.z - axis.x * s,  0.0,
                oc * axis.z * axis.x - axis.y * s,  oc * axis.y * axis.z + axis.x * s,  oc * axis.z * axis.z + c,           0.0,
                0.0,                                0.0,                                0.0,                                1.0);
}

float getStrengthWave(vec2 wavePosition2D, vec2 originOffset, float waveLengthScale, float animationTimerToUse)
{
    vec2 directionA = originOffset - wavePosition2D;
    float lengthA = length(directionA);
    float waveAngleA = sin(lengthA * waveLengthScale + animationTimerToUse);

    return (waveAngleA + 1.0) * 0.5;
}

#define WAVE_SCALE 1.0
#define WAVE_SCALE_TEXTURE (0.04 * rippleStrength)

mat3 addTextureWaveMat(vec2 wavePosition2D, vec2 originOffset, mat3 inputMat, float viewDistanceToUse, float waveLengthScale, float waveHeightScale, float animationTimerToUse)
{
    vec3 texValue = normalize(vec3(0.0,1.0,0.0) + (texture(noiseSampler, wavePosition2D * waveLengthScale * 0.00008 + originOffset * animationTimerToUse * 0.00006).rbg - vec3(0.5)) * waveHeightScale * WAVE_SCALE_TEXTURE);

    vec3 right = cross(texValue, vec3(0.0,0.0,1.0));
    vec3 forward = cross(-texValue, right);

    mat3 rotationMatrix = mat3(right,texValue,forward);
    return inputMat * rotationMatrix;
}

mat3 addWaveMat(vec2 wavePosition2D, vec2 originOffset, mat3 inputMat, float viewDistanceToUse, float waveLengthScale, float waveHeightScale, float animationTimerToUse)
{
    float mixValueA = max(1.0 - clamp(viewDistanceToUse, 0.0, 1.0), 0.0);
    vec2 directionA = originOffset - wavePosition2D;
    float lengthA = length(directionA);
    float waveAngleA = sin(lengthA * waveLengthScale + animationTimerToUse) * waveHeightScale * mixValueA * WAVE_SCALE;
    waveAngleA = pow(abs(waveAngleA), 1.3) * sign(waveAngleA);
    vec2 directionNormalA = directionA / lengthA;
   mat3 waveRotationMatrixA = mat3(rotationMatrix(vec3(directionNormalA.y, 0.0, -directionNormalA.x), waveAngleA));

    return inputMat * waveRotationMatrixA;
}

void main()
{
    float viewDistance = length(outView);

    float scale = 10.0;

    float animationTimer = ubo.animationTimerWindStrength.x;

    vec2 wavePosition2D = (ubo.waveMatrix * vec4(fLocalPos, 1.0)).xz;

    vec3 V = outView / viewDistance;

    vec3 normalToUse = outNormal;

    mat3 waveMatrix = addTextureWaveMat(wavePosition2D, vec2(50.0, 35.7), mat3(1.0), viewDistance * 0.5,1757.0 * 0.3, 0.4, animationTimer * 0.5);
    waveMatrix = addTextureWaveMat(wavePosition2D, vec2(-57.0, -67.7), waveMatrix, viewDistance * 2.0, 3315.0, 0.4, animationTimer * 1.0);
    waveMatrix = addTextureWaveMat(wavePosition2D, vec2(64.0, 53.7), waveMatrix, viewDistance * 0.5, 18215.0, 0.5, animationTimer * 1.5);
    waveMatrix = addTextureWaveMat(wavePosition2D, vec2(-53.0, -43.7), waveMatrix, viewDistance * 0.5, 12215.0, 0.3, animationTimer * 1.4);
    waveMatrix = addTextureWaveMat(wavePosition2D, vec2(83.0, -43.7), waveMatrix, viewDistance * 0.5, 20215.0, 0.3, animationTimer * 1.9);

    waveMatrix = addWaveMat(wavePosition2D, vec2(136.0, 13.7), waveMatrix, viewDistance * 0.5, 75.0, 0.04, animationTimer * 2.0);
    waveMatrix = addWaveMat(wavePosition2D, vec2(116.0, 33.7), waveMatrix, viewDistance * 0.5, 79.0, 0.05, animationTimer * 1.5);

    mat3 sunMatrix = addTextureWaveMat(wavePosition2D, vec2(64.0, 53.7), waveMatrix, viewDistance * 0.5, 18215.0, 2.0 * 2.0, animationTimer * 1.5);
    sunMatrix = addTextureWaveMat(wavePosition2D, vec2(-53.0, -43.7), sunMatrix, viewDistance * 0.5, 12215.0, 2.0 * 2.0, animationTimer * 1.4);
    sunMatrix = addTextureWaveMat(wavePosition2D, vec2(83.0, -43.7), sunMatrix, viewDistance * 0.1, 20215.0, 3.0 * 2.0, animationTimer * 1.8);
    sunMatrix = addTextureWaveMat(wavePosition2D, vec2(-73.0, 53.7), sunMatrix, viewDistance * 0.1, 22215.0, 4.0 * 2.0, animationTimer * 1.4);

    vec3 tangentSpaceNormal = mat3(ubo.waveMatrix) * normalToUse;
    vec3 tangentSpaceViewDirection = mat3(ubo.waveMatrix) * -V;

    vec3 rotatedTangentSpaceNormal = waveMatrix * tangentSpaceNormal;
    vec3 rotatedTangentSpaceSunNomral = sunMatrix * tangentSpaceNormal;
    vec3 rotatedTangentSpaceViewDirection;

    vec3 view2D = normalize(vec3(tangentSpaceViewDirection.x, 0.0, tangentSpaceViewDirection.z));

    if(dot(view2D, rotatedTangentSpaceNormal) > 0.0)
    {
        rotatedTangentSpaceViewDirection = waveMatrix * tangentSpaceViewDirection;
    }
    else
    {
        rotatedTangentSpaceViewDirection = inverse(waveMatrix) * tangentSpaceViewDirection;
    }

    normalToUse = inverse(mat3(ubo.waveMatrix)) * rotatedTangentSpaceNormal;
    vec3 viewDirection = inverse(mat3(ubo.waveMatrix)) * rotatedTangentSpaceViewDirection;

    vec3 sunNormalToUse = inverse(mat3(ubo.waveMatrix)) * rotatedTangentSpaceSunNomral;

    float NdotLToUse = clamp(dot( normalToUse, ubo.sunPos_cloudCover.xyz ), 0.0, 1.0);
    float shadowBaseVisibility = 1.0;
    float shadowVisibility = mix(getShadowVisibility(shadowBaseVisibility, outShadowCoords, shadowTextureA,shadowTextureB,shadowTextureC,shadowTextureD), 0.0, (ubo.sunPos_cloudCover.w));

    vec3 extinction;
    vec3 inscatter = max(inScattering(atmoUbo.betaMExAndmieG, transmittanceSampler, inscatterSampler, outWorldCamPos, outWorldPos, outWorldViewVec, ubo.sunPos_cloudCover, extinction), vec3(0.0));

    vec3 sunColor = sunRadiance(transmittanceSampler, length(outWorldPos), dot(normalize(outWorldPos), ubo.sunPos_cloudCover.xyz)) * (1.0 - ubo.sunPos_cloudCover.w);
    vec3 diffuseLit = vec3(0.0, 0.0, 0.0);

    float reflectMip				= 0.0;

    vec3 specularColor		= vec3( 0.04);

    vec4 vClipReflection = outReflectionProjView * ubo.reflectionMatrix * vec4(viewDirection * viewDistance + outCamPos, 1.0);
	vec2 vDeviceReflection = vClipReflection.xy  / vClipReflection.w;
	vec2 vTextureReflection = vec2(0.5, 0.5) + 0.5 * vDeviceReflection;

    vec3 sampledColor = texture(reflectionSampler, vTextureReflection).rgb;

    float NoV				= saturate( dot( normalToUse, V ) );
    vec3 EnvBRDF = texture( brdfTex, vec2(outMaterial.x, NoV)).rgb;
    vec3 reflectance		= specularColor * EnvBRDF.x + EnvBRDF.y;

    float directReflectLightOpacity = lightSpecular(sunNormalToUse, V, ubo.sunPos_cloudCover.xyz, mix(0.04, 0.08, clamp(viewDistance * 1.0, 0.0, 1.0)) * sparkleWidth) * shadowVisibility * 1.0 * (1.0 - ubo.sunPos_cloudCover.w);
    vec3 lightReflect = sunColor * directReflectLightOpacity * extinction;

    if(ubo.outputType == 0)
    {
        for(int lightIndex = 0; lightIndex < lights.lightCount; lightIndex++)
        {
            vec3 distanceVec = (lights.lightPositions[lightIndex].xyz + ubo.lightOriginOffset.xyz - outPos.xyz) * LIGHT_DISTANCE_MULTIPLIER;
            float lightDistance2 = dot(distanceVec,distanceVec);
            if(lightDistance2 < MAX_LIGHT_DISTANCE2)
            {
                float fadeOutNearEdge = clamp((lightDistance2 - FADE_OUT_START_LIGHT_DISTANCE2) / FADE_OUT_DIVIDER_LIGHT_DISTANCE2, 0.0, 1.0);
                fadeOutNearEdge = 1.0 - fadeOutNearEdge;
                float att = mix(0.0, 0.1 / max(lightDistance2, 0.1), fadeOutNearEdge);
                vec3 lightNormal = normalize(distanceVec);
                float NdotLP        = clamp(dot( sunNormalToUse, lightNormal ), 0.0, 1.0);
                float lightReflectIntensity = lightSpecular(sunNormalToUse, V, lightNormal, 0.04) * att * 128.0;
                directReflectLightOpacity += lightReflectIntensity;
                lightReflect += lights.lightColors[lightIndex].xyz * lightReflectIntensity;
            }
        }
    }

    diffuseLit = diffuseLit * (1.0 - outMaterial.y);

    float opacity = clamp(1.0 - EnvBRDF.x + directReflectLightOpacity * (1.0 - EnvBRDF.x), 0.0, 1.0);

    vec3 litColor = mix(diffuseLit, (sampledColor), reflectance) + lightReflect * (EnvBRDF.x + EnvBRDF.y);

    vec3 combined = litColor * extinction + inscatter;

    if(ubo.outputType != 0)
    {
        data.rgb = combined;
    }
    else
    {
        data.rgb = hdrFinal(exposureSampler, combined);
    }
    data.a = opacity;
}
