-- @nenyoo-menu
-- Nenyoo documentation example: JOAAT hash notebook.
-- Requires GTA V Premium's native Engine + Foundation Lua APIs.
-- Source review only; no in-game compatibility claim.

local root = menu.my_root()
-- Add your own ASCII GTA identifiers to this list, then reload the script.
local identifiers = { "adder", "sultan", "weapon_pistol" }

for _, name in ipairs(identifiers) do
    local identifier = name
    menu.action(root, identifier, {}, "Print this identifier's JOAAT hash", function()
        local hash = util.joaat(identifier)
        local signed = hash
        if hash >= 0x80000000 then
            signed = hash - 0x100000000
        end
        local message = string.format("%s: 0x%08X | u32 %d | i32 %d",
            identifier, hash, hash, signed)
        print(message)
        util.toast(message)
    end)
end
