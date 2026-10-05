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
    int outputType;
} ubo;

layout(binding = 4) uniform UniformBufferObjectLights
{
    vec4 lightPositions[MAX_LIGHTS];
    vec4 lightColors[MAX_LIGHTS];
    vec4 animationData;
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

layout(location = 0) in vec3 outPos;
layout(location = 1) in vec4 outWorldPos;
layout(location = 2) in vec3 outWorldCamPos;
layout(location = 3) in vec3 outColor;
layout(location = 4) in vec4 outMaterialUV;
layout(location = 5) in vec4 outView_texMapIndex;
layout(location = 6) in vec3 outNormal;
layout(location = 7) in vec3 outWorldViewVec;
layout(location = 8) in vec4 outShadowCoords[4];
layout(location = 12) in vec4 outInstanceExtraData;
layout(location = 13) in vec3 outColorB;
layout(location = 14) in vec2 outMaterialB;
layout(location = 15) in vec3 outTangent;

layout(location = 0) out vec4 data;

void main(void)
{
    vec3 normalToUse = normalize(outNormal);

    float NdotLToUse = clamp(dot( normalToUse, ubo.sunPos.xyz ), 0.0, 1.0);
    float shadowBaseVisibility = 1.0;
    float shadowVisibility = getShadowVisibility(shadowBaseVisibility, outShadowCoords, shadowTextureA,shadowTextureB,shadowTextureC,shadowTextureD);

    vec3 V = normalize(outView_texMapIndex.xyz);

    vec3 extinction;
    vec3 inscatter = max(inScattering(atmoUbo.betaMExAndmieG, transmittanceSampler, inscatterSampler, outWorldCamPos, outWorldPos.xyz, outWorldViewVec, vec4(ubo.sunPos.xyz, 0.0), extinction), vec3(0.0));
    addHaze(extinction, inscatter, outView_texMapIndex.xyz, outWorldPos.xyz / 8.388608, 0.0);
    vec3 diffuseColor = textureLod( cubeMapTex, normalToUse.xyz, PBR_MIP_LEVELS - 1 ).rgb;
    vec3 sunColor = sunRadiance(transmittanceSampler, length(outWorldPos.xyz), dot(normalize(outWorldPos.xyz), ubo.sunPos.xyz));
    sunColor *= sunTint(sunColor);
    vec3 colorToUse = outColor.xyz;
    float leafy = clamp((colorToUse.g - max(colorToUse.r, colorToUse.b)) * 16.0, 0.0, 1.0);
    colorToUse = colorToUse * colorToUse;
    float grainValue = grain(outPos);
    colorToUse *= mix(vec3(plainTone(grainValue)), leafTone(grainValue), leafy);

    if(outInstanceExtraData.y > 0.1)
    {
        leafy = 0.0;
        colorToUse = vec3(0.5,0.4,0.0);
    }

    vec3 diffuseLit = colorToUse * ((sunColor * vec3(NdotLToUse) * shadowVisibility) + diffuseColor);
    diffuseLit += colorToUse * leafGlow(V, ubo.sunPos.xyz, leafy) * sunColor;

    vec3 specularColor		= mix( vec3( 0.04 ), colorToUse, outMaterialUV.y );

    vec3 lookup				= -reflect( V, normalToUse );

    float mip				= PBR_MIP_LEVELS - 1 + log2(outMaterialUV.x);
    vec3 sampledColor		= textureLod( cubeMapTex, lookup.xyz, mip ).rgb;

    float NoV				= saturate( dot( normalToUse, V ) );
    vec3 EnvBRDF = texture( brdfTex, vec2(outMaterialUV.x, NoV)).rgb;

    vec3 H = normalize(ubo.sunPos.xyz + V);

    vec3 reflectance		= (specularColor * EnvBRDF.x + EnvBRDF.y);

    vec3 lightReflect = sunColor * lightSpecular(normalToUse, V, ubo.sunPos.xyz, outMaterialUV.x) * shadowVisibility;

    if(ubo.outputType == 0)
    {
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
                diffuseLit += colorToUse * lights.lightColors[lightIndex].xyz * NdotLP * att;

            }
        }
    }

    diffuseLit = diffuseLit * (1.0 - outMaterialUV.y);

    vec3 litColor = diffuseLit + (sampledColor + lightReflect) * reflectance * reflectanceMultiplier;

    data.rgb = litColor * extinction + inscatter;

    float glowOpacity = clamp(1.0 - dot(V, normalToUse), 0.0, 0.8);
    glowOpacity = glowOpacity * glowOpacity;

    data.a = 0.4 + outInstanceExtraData.y * 0.2;
    data.rgb = data.rgb + ((vec3(0.4,0.4,0.4) + vec3(0.4,0.4,0.4) * glowOpacity) * (1.0 - outInstanceExtraData.y)) + (colorToUse * outInstanceExtraData.y * 2.0);

    if(outInstanceExtraData.x > 0.01 && outInstanceExtraData.y < 0.1)
    {

            float grey = (data.r + data.g + data.b) * 0.2 + 0.3;
            data.rgb = mix(data.rgb, vec3(grey * 0.5,grey * 0.8,grey *1.2), (0.3 + glowOpacity * 0.5));

    }

    {
    }

}
