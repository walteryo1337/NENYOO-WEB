-- @nenyoo-menu
-- Nenyoo documentation example: coordinate notebook.
-- Requires GTA V Premium's native Engine + Foundation Lua APIs.
-- Source review only; no in-game compatibility claim.
-- Read-only position utility: use after your character has loaded.

local root = menu.my_root()
local last_capture = nil

menu.action(root, "Capture position", {}, "Print coordinates and heading to the Lua console", function()
    local x, y, z = self.pos()
    local heading = self.heading()
    last_capture = string.format("{ x = %.3f, y = %.3f, z = %.3f, heading = %.2f }",
        x, y, z, heading)
    print("Coordinate notebook: " .. last_capture)
    util.toast("Position captured. Open F10 to read the coordinates.")
end)

menu.action(root, "Print last capture", {}, "Print the last capture again", function()
    if last_capture then
        print("Coordinate notebook: " .. last_capture)
        util.toast("Last capture printed to the Lua console.")
    else
        util.toast("Capture a position first.")
    end
end)

menu.action(root, "Clear capture", {}, "Discard the local capture", function()
    last_capture = nil
    util.toast("Capture cleared.")
end)
