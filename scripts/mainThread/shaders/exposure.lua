local mod = {
    loadOrder = 1,
}

function mod:onload(shader)
    shader.fragPath = "exposureLook.frag.spv"
end

return mod
