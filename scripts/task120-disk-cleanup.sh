#!/bin/bash
# Task 120 — aggressive but safe disk cleanup (everything here is re-downloadable).
rm -rf /home/z/my-project/hrms_app/build
rm -rf /home/z/.gradle/caches
rm -rf /home/z/.gradle/daemon
rm -rf /home/z/.npm/_cacache
rm -rf /tmp/my-project
echo "CLEANUP_DONE"
df -h /home/z | tail -1
