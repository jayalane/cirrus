#! /bin/bash



for a in rm1 rm2 rm3 ; do
    echo $a
    /path/to/node/bin/node main.js $a >> /tmp/$a.out 2>> /tmp/$a.err &
done
