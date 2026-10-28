#!/bin/bash
# Dismiss any top-right toast/notification popover then wait briefly
agent-browser eval "
document.querySelectorAll('button').forEach(b => {
  const r = b.getBoundingClientRect();
  if (r.top >= 0 && r.top < 120 && r.right > window.innerWidth - 320 && b.textContent.trim() === '') b.click();
});
'dismissed'" > /dev/null 2>&1
sleep 1
