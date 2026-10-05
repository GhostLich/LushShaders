
layout(binding = 0) uniform sampler2D texMap;
layout(binding = 1) uniform sampler2D bloomTex;

layout(location = 0) in vec2 fragTexCoord;

layout(location = 0) out vec4 outColor;

const float bloomIntensity = 5.0;
const float saturation = 1.3;

void main() {
    vec4 bloomValue = texture(bloomTex, fragTexCoord) * bloomIntensity;
    outColor = mix(texture(texMap, fragTexCoord), vec4(vec3(0.8) + bloomValue.xyz * 0.3, 1.0), min((bloomValue.x + bloomValue.y + bloomValue.z) * 0.12, 1.0));

    float lum = dot(outColor.rgb, vec3(0.299, 0.587, 0.114));
    float warmHighlight = clamp((min(outColor.r, outColor.g) - outColor.b) * 4.0, 0.0, 1.0) * smoothstep(0.5, 0.9, lum);
    outColor.rgb = mix(vec3(lum), outColor.rgb, mix(saturation, 1.0, warmHighlight));
}
