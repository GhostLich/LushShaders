local gameConstants = mjrequire "common/gameConstants"

local mod = {
    loadOrder = 2,
}

function mod:onload(shader)
    local name = "objectStatic"
    if shader.vertPath == "objectInstancedReflectLite.vert.spv" then
        name = "objectPackedReflect"
    end
    if gameConstants.minPopulationForRaids then
        shader.fragPath = name .. "07Look.frag.spv"
    else
        shader.fragPath = name .. "Look.frag.spv"
    end
end

return mod
