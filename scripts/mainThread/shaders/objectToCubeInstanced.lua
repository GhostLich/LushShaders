local gameConstants = mjrequire "common/gameConstants"

local mod = {
    loadOrder = 2,
}

function mod:onload(shader)
    if gameConstants.minPopulationForRaids then
        shader.fragPath = "objectStatic07Look.frag.spv"
    else
        shader.fragPath = "objectStaticLook.frag.spv"
    end
end

return mod
