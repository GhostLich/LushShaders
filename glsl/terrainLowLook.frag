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
    vec4 sunPos;
    vec4 camDirection;
    vec4 lightOriginOffset;
    vec4 screenSize_cloudCover;
    ivec4 outputType_SSAOEnabled;
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
layout(binding = 14) uniform sampler2D ssaoTexture;
layout(binding = 15) uniform sampler2D materialTexture;
layout(binding = 16) uniform sampler2D materialIndexTexture;
layout(binding = 17) uniform sampler2D materialBlendTexture;

layout(location = 0) in vec3 outPos;
layout(location = 1) in vec3 outWorldPos;
layout(location = 2) in vec3 outWorldCamPos;
layout(location = 3) in vec3 outView;
layout(location = 4) in vec3 outNormal;
layout(location = 5) in vec3 outWorldViewVec;
layout(location = 6) in vec4 outShadowCoords[4];
layout(location = 10) in float depth;
layout(location = 11) in vec2 outMatTex;
layout(location = 12) in vec2 outMatBlendTex;

layout(location = 0) out vec4 data;

const float matTexSize = 4096;

vec2 getOutMaterial(float matIn)
{
    if(matIn >= 0.5)
    {
      return vec2((matIn - 0.5) / 0.5, 1.0);
    }
    else
    {
      return vec2(matIn / 0.5, 0.0);
    }
}

void main() {

    if(ubo.outputType_SSAOEnabled.x == 2 && depth > 0.0001)
    {
        discard;
    }

    vec3 worldPosToUse = outWorldPos;
    vec3 worldViewVecToUse = outWorldViewVec;
    float viewDepth = depth;

    float outViewLength = length(outView);

    if(depth > 0.0)
    {
        float viewAngle = dot(outView / outViewLength, normalize(outWorldPos));
        viewDepth = depth / max(0.8 + viewAngle * 0.2, 0.001);

        worldViewVecToUse = (outWorldPos - outWorldCamPos);

        if(viewDepth > 0.0)
        {
            viewDepth = clamp((viewDepth * 6.0), 0.0, 1.0);
            viewDepth = pow(viewDepth, 0.5);
        }
    }

    viewDepth = clamp(viewDepth, 0.0, 1.0);

    vec3 normalizedNormal = normalize(outNormal);

    vec3 V = outView / outViewLength;

    vec4 indexTexValue = texture(materialIndexTexture, outMatBlendTex);

    vec4 matTexValueA = texture(materialTexture, outMatTex + vec2((indexTexValue.x * 255.0) / matTexSize,0.0) + vec2(0.5,0.5) / matTexSize);
    vec4 matTexValueB = texture(materialTexture, outMatTex + vec2((indexTexValue.y * 255.0) / matTexSize,0.0) + vec2(0.5,0.5) / matTexSize);
    vec4 matTexValueC = texture(materialTexture, outMatTex + vec2((indexTexValue.z * 255.0) / matTexSize,0.0) + vec2(0.5,0.5) / matTexSize);

    vec3 materialWeightValue = texture(materialBlendTexture, outMatBlendTex).xyz;
    materialWeightValue = materialWeightValue / (materialWeightValue.x + materialWeightValue.y + materialWeightValue.z);

    vec3 outColor = matTexValueA.xyz * matTexValueA.xyz * materialWeightValue.x + matTexValueB.xyz * matTexValueB.xyz * materialWeightValue.y + matTexValueC.xyz * matTexValueC.xyz * materialWeightValue.z;

    vec2 materialA = getOutMaterial(matTexValueA.w);
    vec2 materialB = getOutMaterial(matTexValueB.w);
    vec2 materialC = getOutMaterial(matTexValueC.w);

    vec2 outMaterial = materialA * materialWeightValue.x + materialB * materialWeightValue.y + materialC * materialWeightValue.z;

    float baseDepthOffset = clamp((depth) * 200.0, 0.0, 1.0);
    baseDepthOffset = pow(baseDepthOffset, 0.6) * 0.8;
    outColor = mix(outColor, vec3(0.02, 0.02, 0.02), baseDepthOffset);
    outMaterial.x = mix(outMaterial.x, 1.0, baseDepthOffset);

    float NdotLToUse = clamp(dot( normalizedNormal, ubo.sunPos.xyz ), 0.0, 1.0);
    float shadowBaseVisibility = 1.0;
    float sunFade = ubo.screenSize_cloudCover.z * 0.9 + 0.1;
    float shadowVisibility = mix(getShadowVisibility(shadowBaseVisibility, outShadowCoords, shadowTextureA,shadowTextureB,shadowTextureC,shadowTextureD), 0.0, sunFade);
    shadowVisibility = mix(shadowVisibility, 0.0, clamp((viewDepth * 1.5), 0.0, 1.0));

    vec3 normalizedWorldPosition = normalize(worldPosToUse);

    vec3 extinction;
    vec3 inscatter = max(inScattering(atmoUbo.betaMExAndmieG, transmittanceSampler, inscatterSampler, outWorldCamPos, worldPosToUse, worldViewVecToUse, vec4(ubo.sunPos.xyz, sunFade), extinction), vec3(0.0));
    addHaze(extinction, inscatter, outView, outWorldPos.xyz / 8.388608, ubo.screenSize_cloudCover.z);

    vec3 diffuseNormalToUse = mix(normalizedNormal, normalizedWorldPosition, viewDepth);
    float ssaoValue = 1.0;
    if(ubo.outputType_SSAOEnabled.y == 1 && ubo.outputType_SSAOEnabled.x == 0)
    {
        vec2 ssaoTexCoord = gl_FragCoord.xy / ubo.screenSize_cloudCover.xy;
        ssaoTexCoord.y = 1.0 - ssaoTexCoord.y;
        ssaoValue = texture(ssaoTexture, ssaoTexCoord).r;
    }
    vec3 diffuseColor = textureLod( cubeMapTex, diffuseNormalToUse, PBR_MIP_LEVELS - 1 ).rgb * ssaoValue;
    vec3 sunColor = sunRadiance(transmittanceSampler, length(worldPosToUse), dot(normalize(worldPosToUse), ubo.sunPos.xyz)) * (1.0 - ubo.screenSize_cloudCover.z);
    sunColor *= sunTint(sunColor);
    vec3 sunValue = ((sunColor * vec3(NdotLToUse) * shadowVisibility) + diffuseColor);
    sunValue *= plainTone(grain(outPos));

    vec3 diffuseLitA = matTexValueA.xyz * matTexValueA.xyz * sunValue * materialWeightValue.x;
    vec3 diffuseLitB = matTexValueB.xyz * matTexValueB.xyz * sunValue * materialWeightValue.y;
    vec3 diffuseLitC = matTexValueC.xyz * matTexValueC.xyz * sunValue * materialWeightValue.z;

    vec3 diffuseLit = diffuseLitA * (1.0 - materialA.y) + diffuseLitB * (1.0 - materialB.y) + diffuseLitC * (1.0 - materialC.y);
    diffuseLit = mix(diffuseLit, vec3(0.02, 0.02, 0.02) * sunValue, baseDepthOffset);

    vec3 N                  = normalizedNormal;
    vec3 specularColor		= mix( vec3( 0.04), outColor, outMaterial.y );

    vec3 lookup				= -reflect( V, N );
    float mip				= PBR_MIP_LEVELS - 1 + log2(outMaterial.x);
    vec3 sampledColor		= textureLod( cubeMapTex, lookup, mip ).rgb * ssaoValue;

    vec3 H = normalize(ubo.sunPos.xyz + V);
    float directDot = saturate( dot(H, N));

    float NoV				= saturate( dot( N, V ) );
    vec3 EnvBRDF = texture( brdfTex, vec2(outMaterial.x, NoV)).rgb;
    vec3 reflectance		= (specularColor * EnvBRDF.x + EnvBRDF.y);

    vec3 lightReflect = sunColor * lightSpecular(normalizedNormal, V, ubo.sunPos.xyz, outMaterial.x) * shadowVisibility * 0.3;

    if(ubo.outputType_SSAOEnabled.x == 0)
    {
        vec3 outColorBase = outColor.xyz * ssaoValue;
        for(int lightIndex = 0; lightIndex < lights.lightCount; lightIndex++)
        {
            vec3 distanceVec = (lights.lightPositions[lightIndex].xyz + ubo.lightOriginOffset.xyz - outPos) * LIGHT_DISTANCE_MULTIPLIER;
            float lightDistance2 = dot(distanceVec,distanceVec);
            if(lightDistance2 < MAX_LIGHT_DISTANCE2)
            {
                float fadeOutNearEdge = clamp((lightDistance2 - FADE_OUT_START_LIGHT_DISTANCE2) / FADE_OUT_DIVIDER_LIGHT_DISTANCE2, 0.0, 1.0);
                fadeOutNearEdge = 1.0 - fadeOutNearEdge;
                float att = mix(0.0, 0.1 / max(lightDistance2, 0.1), fadeOutNearEdge);
                vec3 lightNormal = normalize(distanceVec);
                float NdotLP        = clamp(dot( normalizedNormal, lightNormal ), 0.0, 1.0);
                diffuseLit += outColorBase * lights.lightColors[lightIndex].xyz * NdotLP * att * (1.0 - outMaterial.y);

            }
        }
    }

    vec3 litColor = diffuseLit + (sampledColor + lightReflect) * reflectance * reflectanceMultiplier;
    if(ubo.outputType_SSAOEnabled.x != 2)
    {

        vec3 waterDiffuseLit = waterColor(viewDepth) * (sunColor * clamp(dot( normalizedWorldPosition, ubo.sunPos.xyz ), 0.0, 1.0) * (0.1 + shadowVisibility * 0.9) + diffuseColor);
        litColor = mix(litColor, waterDiffuseLit, viewDepth);
    }

    vec3 combined = litColor * extinction + inscatter;

    if(ubo.outputType_SSAOEnabled.x != 0)
    {
        data.rgb = combined;
    }
    else
    {
        data.rgb = hdrFinal(exposureSampler, combined);
    }

	data.a = 1.0;
}
