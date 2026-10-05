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
layout(binding = 15) uniform sampler2D objectDetailsTexture;
layout(binding = 16) uniform sampler2D objectDetailsTextureB;

layout(location = 0) in vec4 pPosDepth;
layout(location = 1) in vec4 pNormalU;
layout(location = 2) in vec4 pShadowV;
layout(location = 3) flat in uvec4 pOriginMat;
layout(location = 4) flat in uvec4 pCamWorldMatB;
layout(location = 5) flat in uvec4 pCamViewTex;
layout(location = 6) flat in vec4 pInstanceExtra;
layout(location = 7) in vec3 pWorldViewVec;

layout(location = 0) out vec4 data;

void main(void)
{
    vec3 outPos = pPosDepth.xyz;
    vec3 origin = uintBitsToFloat(pOriginMat.xyz);
    vec4 outWorldPos = vec4((outPos + origin) * 8.388608, pPosDepth.w);
    vec3 outWorldCamPos = uintBitsToFloat(pCamWorldMatB.xyz);

    uint packedMaterial = pOriginMat.w;
    uint packedMaterialB = pCamWorldMatB.w;
    uvec4 material = uvec4(packedMaterial & 255u, (packedMaterial >> 8) & 255u, (packedMaterial >> 16) & 255u, packedMaterial >> 24);
    uvec4 materialB = uvec4(packedMaterialB & 255u, (packedMaterialB >> 8) & 255u, (packedMaterialB >> 16) & 255u, packedMaterialB >> 24);

    vec3 outColor = material.xyz / 255.0;
    vec3 outColorB = materialB.xyz / 255.0;
    vec4 outMaterialUV;
    if(material.w > 127)
    {
      outMaterialUV.xy = vec2((material.w - 128.0) / 127.0, 1.0);
    }
    else
    {
      outMaterialUV.xy = vec2(material.w / 127.0, 0.0);
    }
    vec2 outMaterialB;
    if(materialB.w > 127)
    {
      outMaterialB = vec2((materialB.w - 128.0) / 127.0, 1.0);
    }
    else
    {
      outMaterialB = vec2(materialB.w / 127.0, 0.0);
    }
    outMaterialUV.zw = vec2(pNormalU.w, pShadowV.w);

    vec4 outView_texMapIndex = vec4(uintBitsToFloat(pCamViewTex.xyz) - outPos, float(pCamViewTex.w));
    vec3 outNormal = pNormalU.xyz;
    vec3 outWorldViewVec = pWorldViewVec;
    vec4 shadowCoordD = vec4(pShadowV.xyz, 1.0);
    vec4 outInstanceExtraData = pInstanceExtra;
    if(ubo.outputType_SSAOEnabled.x == 2)
    {
        if(outWorldPos.w > 0.0)
        {
            discard;
        }
    }
    float viewDepth = (outWorldPos.w * 0.1);

    vec3 worldPosToUse = outWorldPos.xyz;
    vec3 worldViewVecToUse = outWorldViewVec;

    float outViewLength = length(outView_texMapIndex.xyz);
    vec3 V = outView_texMapIndex.xyz / outViewLength;

    if(viewDepth > 0.0)
    {
        float viewAngle = dot(V, normalize(outWorldPos.xyz));

        viewDepth = viewDepth / max(0.8 + viewAngle * 0.2, 0.001);

        worldPosToUse = outWorldPos.xyz + viewDepth * (V * 8.388608);
        worldViewVecToUse = (outWorldPos.xyz - outWorldCamPos);

        if(viewDepth > 0.0)
        {
            viewDepth = clamp((viewDepth * 6.0), 0.0, 1.0);
            viewDepth = pow(viewDepth, 0.5);
        }
    }
    viewDepth = clamp(viewDepth, 0.0, 1.0);

    vec4 texMapValue;
    if(outView_texMapIndex.w > 0.5)
    {
        texMapValue = texture(objectDetailsTextureB, outMaterialUV.zw);
    }
    else
    {
        texMapValue = texture(objectDetailsTexture, outMaterialUV.zw);
    }

    float mixValue = min(texMapValue.a * 2.0, 1.0);
    float roughnessToUse =  mix(outMaterialUV.x, outMaterialB.x, mixValue);
    float metalToUse = mix(outMaterialUV.y, outMaterialB.y, mixValue);
    vec3 colorToUse = mix(outColor, outColorB, mixValue);
    float leafy = clamp((colorToUse.g - max(colorToUse.r, colorToUse.b)) * 16.0, 0.0, 1.0);
    colorToUse = colorToUse * colorToUse;
    float grainValue = grain(outPos);
    colorToUse *= mix(vec3(plainTone(grainValue)), leafTone(grainValue), leafy);

    vec3 normalToUse = normalize(outNormal);
    if(!gl_FrontFacing)
    {
      normalToUse = -normalToUse;
    }

    float NdotLToUse = clamp(dot( normalToUse, ubo.sunPos.xyz ), 0.0, 1.0);
    float sunFade = ubo.screenSize_cloudCover.z * 0.9 + 0.1;
    float shadowBaseVisibility = 1.0;
    float edgeDistanceX = min(-(shadowCoordD.x - 1.0), shadowCoordD.x);
    float edgeDistanceY = min(-(shadowCoordD.y - 1.0), shadowCoordD.y);
    float shadowEdgeDistance = min(edgeDistanceX, edgeDistanceY);
    if(shadowEdgeDistance > 0.0)
    {
        float shadowMapValue = sampleShadowMapLow(shadowTextureD, shadowCoordD, 32.0);
        shadowBaseVisibility = mix(shadowMapValue, 1.0, (1.0 - clamp(shadowEdgeDistance * 10.0, 0.0, 1.0)));
    }
    float shadowVisibility = mix(shadowBaseVisibility, 0.0, sunFade);
    shadowVisibility = mix(shadowVisibility, 0.0, clamp((viewDepth * 1.5), 0.0, 1.0));

    vec3 extinction;
    vec3 inscatter = max(inScattering(atmoUbo.betaMExAndmieG, transmittanceSampler, inscatterSampler, outWorldCamPos, worldPosToUse, outWorldViewVec, vec4(ubo.sunPos.xyz, sunFade), extinction), vec3(0.0));
    addHaze(extinction, inscatter, outView_texMapIndex.xyz, outWorldPos.xyz / 8.388608, ubo.screenSize_cloudCover.z);
    float ssaoValue = 1.0;
    if(ubo.outputType_SSAOEnabled.y == 1 && ubo.outputType_SSAOEnabled.x == 0)
    {
        vec2 ssaoTexCoord = gl_FragCoord.xy / ubo.screenSize_cloudCover.xy;
        ssaoTexCoord.y = 1.0 - ssaoTexCoord.y;
        ssaoValue = texture(ssaoTexture, ssaoTexCoord).r;
    }
    vec3 diffuseColor = textureLod( cubeMapTex, normalToUse, PBR_MIP_LEVELS - 1 ).rgb * ssaoValue;
    float worldPosLength = length(worldPosToUse);
    vec3 normalizedWorldPosition = worldPosToUse / worldPosLength;
    vec3 sunColor = sunRadiance(transmittanceSampler, worldPosLength, dot(normalizedWorldPosition, ubo.sunPos.xyz)) * (1.0 - ubo.screenSize_cloudCover.z);
    sunColor *= sunTint(sunColor);
    vec3 skyLit = diffuseColor * skyFacing(normalToUse, normalizedWorldPosition, leafy);

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

    vec3 reflectance		= (specularColor * EnvBRDF.x + EnvBRDF.y);

    vec3 lightReflect = sunColor * lightSpecular(normalToUse, V, ubo.sunPos.xyz, roughnessToUse) * shadowVisibility * 0.3;

    if(ubo.outputType_SSAOEnabled.x == 0)
    {
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
                if(metalToUse < 0.5)
                {
                    diffuseLit += outColorBase * lights.lightColors[lightIndex].xyz * NdotLP * att;
                }

                if(NdotLP > 0.001)
                {
                    lightReflect += lights.lightColors[lightIndex].xyz * lightSpecular(normalToUse, V, lightNormal, roughnessToUse) * att * NdotLP;
                }
            }
        }
    }

    diffuseLit = diffuseLit * (1.0 - metalToUse);

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
