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
layout(binding = 14) uniform sampler2D decalTexMap;
layout(binding = 15) uniform sampler2D ssaoTexture;
layout(binding = 16) uniform sampler2D objectDetailsNormalTexture;

layout(location = 0) in vec3 outPos;
layout(location = 1) in vec4 outWorldPos;
layout(location = 2) in vec3 outWorldCamPos;
layout(location = 3) in vec3 outColor;
layout(location = 4) in vec2 outMaterial;
layout(location = 5) in vec3 outView;
layout(location = 6) in vec3 outNormal;
layout(location = 7) in vec3 outWorldViewVec;
layout(location = 8) in vec4 outShadowCoords[4];
layout(location = 12) in vec4 outInstanceExtraData;
layout(location = 13) in vec3 outTexCoord;
layout(location = 14) in vec3 outTangent;
layout(location = 15) in vec3 outColorB;
layout(location = 16) in vec2 outMaterialB;

layout(location = 0) out vec4 data;

void main(void)
{
    vec4 tex = texture(decalTexMap, outTexCoord.xy);

    vec3 worldPosToUse = outWorldPos.xyz;
    vec3 worldViewVecToUse = outWorldViewVec;

    vec3 V = normalize(outView);

    float mixValue = tex.g;
    float roughnessToUse = mix(outMaterial.x, outMaterialB.x, mixValue);
    float metalToUse = mix(outMaterial.y, outMaterialB.y, mixValue);
    vec3 colorToUse = mix(outColor, outColorB, mixValue);
    float leafy = clamp((colorToUse.g - max(colorToUse.r, colorToUse.b)) * 16.0, 0.0, 1.0);
    colorToUse = colorToUse * colorToUse;

    vec4 normalTextureValue = texture(objectDetailsNormalTexture, outTexCoord.xy);
    vec3 tNorm = normalize(normalTextureValue.rgb * 2.0 - 1.0);
    vec3 outNorm = normalize(outNormal);

    vec3 finalTangent = normalize(outTangent);
    vec3 outBinormal = normalize(cross(outNorm, finalTangent));

    mat3 outTBN;
    outTBN[0] = finalTangent;
    outTBN[1] = outBinormal;
    outTBN[2] = outNorm;

    vec3 normalToUse = (outTBN) * tNorm;
    normalToUse = normalize(mix(outNorm, normalToUse, 0.02 + roughnessToUse * BUMP_MAPPING_STRENGTH));

    float nDotV = dot(V, normalToUse);

    float NdotLToUse = clamp(dot( normalToUse, ubo.sunPos.xyz ), 0.0, 1.0);

    float sunFade = ubo.screenSize_cloudCover.z * 0.9 + 0.1;
    float shadowBaseVisibility = 1.0;

    float shadowVisibility = mix(getShadowVisibility(shadowBaseVisibility, outShadowCoords, shadowTextureA,shadowTextureB,shadowTextureC,shadowTextureD), 0.0, sunFade);

    vec3 extinction;

    vec3 inscatter = max(inScattering(atmoUbo.betaMExAndmieG, transmittanceSampler, inscatterSampler, outWorldCamPos, worldPosToUse, outWorldViewVec, vec4(ubo.sunPos.xyz, sunFade), extinction), vec3(0.0));
    addHaze(extinction, inscatter, outView, outWorldPos.xyz / 8.388608, ubo.screenSize_cloudCover.z);
    float ssaoValue = 1.0;
    if(ubo.outputType_SSAOEnabled.y == 1 && ubo.outputType_SSAOEnabled.x == 0)
    {
        vec2 ssaoTexCoord = gl_FragCoord.xy / ubo.screenSize_cloudCover.xy;
        ssaoTexCoord.y = 1.0 - ssaoTexCoord.y;
        ssaoValue = mix(texture(ssaoTexture, ssaoTexCoord).r, 1.0, tex.g * 0.5);
    }
    vec3 diffuseColor = textureLod( cubeMapTex, normalToUse, PBR_MIP_LEVELS - 1 ).rgb * ssaoValue;
    float worldPosLength = length(worldPosToUse);
    vec3 normalizedWorldPosition = worldPosToUse / worldPosLength;
    vec3 sunColor = sunRadiance(transmittanceSampler, worldPosLength, dot(normalizedWorldPosition, ubo.sunPos.xyz)) * (1.0 - ubo.screenSize_cloudCover.z);
    sunColor *= sunTint(sunColor);
    vec3 skyLit = diffuseColor * skyFacing(outNorm, normalizedWorldPosition, leafy);

    if(outInstanceExtraData.y > 0.1)
    {
        leafy = 0.0;
        if(outInstanceExtraData.y > 0.6)
        {
            colorToUse = vec3(0.5,0.3,0.0);
        }
        else
        {
            colorToUse = colorToUse * 0.2 + vec3(0.5,0.0,0.0);
        }
    }

    vec3 diffuseLit = colorToUse * ((sunColor * vec3(NdotLToUse) * shadowVisibility) + skyLit);
    diffuseLit += colorToUse * leafGlow(V, ubo.sunPos.xyz, leafy) * sunColor;

    vec3 specularColor		= mix( vec3( 0.04 ), colorToUse, metalToUse );

    vec3 lookup				= -reflect( V, normalToUse );

    float mip				= PBR_MIP_LEVELS - 1 + log2(roughnessToUse);
    vec3 sampledColor		= textureLod( cubeMapTex, lookup, mip ).rgb * ssaoValue;

    float NoV				= saturate( dot( normalToUse, V ) );
    vec3 EnvBRDF = texture( brdfTex, vec2(roughnessToUse, NoV)).rgb;

    vec3 H = normalize(ubo.sunPos.xyz + V);
    float directDot = saturate( dot(H, normalToUse));

    float specularPowerB = exp2(12.0 * (1.0 - roughnessToUse));
    vec3 directSpecular = sunColor * exp2(directDot * specularPowerB - specularPowerB) * shadowVisibility * 4.0;

    vec3 reflectance		= (specularColor * EnvBRDF.x + EnvBRDF.y);

    vec3 lightReflect = sunColor * lightSpecular(normalToUse, V, ubo.sunPos.xyz, roughnessToUse) * shadowVisibility * 0.3;

    vec3 outColorBase = colorToUse * ssaoValue;
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
            float NdotLP        = clamp(dot( normalToUse, lightNormal ), 0.0, 1.0);
            diffuseLit += outColorBase * lights.lightColors[lightIndex].xyz * NdotLP * att;

            if(NdotLP > 0.001)
            {
                lightReflect += lights.lightColors[lightIndex].xyz * lightSpecular(normalToUse, V, lightNormal, roughnessToUse) * att * NdotLP;
            }
        }
    }

    diffuseLit = diffuseLit * (1.0 - metalToUse);

    vec3 litColor = diffuseLit + (sampledColor + lightReflect) * reflectance * reflectanceMultiplier;

    vec3 combined = litColor * extinction + inscatter;

    if(ubo.outputType_SSAOEnabled.x != 0)
    {
        data.rgb = combined;
    }
    else
    {
        data.rgb = hdrFinal(exposureSampler, combined);

        if(outInstanceExtraData.x > 0.01 && outInstanceExtraData.y < 0.1)
        {
            float glowOpacity = clamp(1.0 - dot(V, normalToUse), 0.0, 0.8);
            glowOpacity = glowOpacity * glowOpacity;
            float grey = (data.r + data.g + data.b) * 0.2 + 0.3;
            data.rgb = mix(data.rgb, vec3(grey * 0.5,grey * 0.8,grey *1.2), (0.3 + glowOpacity * 0.5));

        }
    }

    data.a = 1.0;

}
