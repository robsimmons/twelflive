#!/bin/bash

ulimit -m 250 -t 4
/twelf/bin/twelf-server << EOF
    set chatter 0
    loadFile $1
    set chatter 3
    loadFile $2
EOF