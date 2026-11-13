-- @nenyoo-menu
-- Nenyoo documentation example: menu starter.
-- Requires GTA V Premium's native Engine + Foundation Lua APIs.
-- Source review only; no in-game compatibility claim.

local root = menu.my_root()
local counter = 0
local show_notifications = true

menu.toggle(root, "Show notifications", {}, "Local script preference", function(on)
    show_notifications = on
end, true)

local counter_page = menu.list(root, "Counter", {}, "Practice actions and local state")

menu.action(counter_page, "Add one", {}, "Increment the local counter", function()
    counter = counter + 1
    print("Documentation counter: " .. counter)
    if show_notifications then
        util.toast("Counter: " .. counter)
    end
end)

menu.action(counter_page, "Reset counter", {}, "Reset this script's counter", function()
    counter = 0
    print("Documentation counter reset")
    if show_notifications then
        util.toast("Counter reset")
    end
end)
