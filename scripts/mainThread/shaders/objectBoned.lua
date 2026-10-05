local gameConstants = mjrequire "common/gameConstants"

local mod = {
    loadOrder = 2,
}

function mod:onload(shader)
    if gameConstants.minPopulationForRaids then
        shader.fragPath = "object07Look.frag.spv"
    else
        shader.fragPath = "objectLook.frag.spv"
    end
end

return mod
