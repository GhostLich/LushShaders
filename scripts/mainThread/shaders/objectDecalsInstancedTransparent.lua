local gameConstants = mjrequire "common/gameConstants"

local mod = {
    loadOrder = 2,
}

function mod:onload(shader)
    if gameConstants.minPopulationForRaids then
        shader.fragPath = "objectDecalsTransparent07Look.frag.spv"
    else
        shader.fragPath = "objectDecalsTransparentLook.frag.spv"
    end
end

return mod
