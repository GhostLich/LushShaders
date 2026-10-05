local mod = {
    loadOrder = 1,
}

function mod:onload(shader)
    shader.fragPath = "finalOutputGrade.frag.spv"
end

return mod
