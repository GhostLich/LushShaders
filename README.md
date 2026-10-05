# LushShaders

a sapiens mod that makes the game look a bit lusher. thicker haze in the distance, warmer sunlight, improved exposure, water improvements and a noise texture for terrian / built objects

works on both Stable 0.6.1.3 and Unstable 0.7.0.2

compatible with vanilla / MoreFPS / GrassBoost, and shouldn't significantly impact fps if at all

glsl/ has the shader sources and spv/ the compiled shaders. they're edited copies of the game's shaders, so to build them you need the game's GameResources/glsl folder for the includes, then glslc -std=450 --target-env=vulkan1.0. the two objectPacked ones are edited copies of the MoreFPS shaders

scripts are MIT, see LICENSE
